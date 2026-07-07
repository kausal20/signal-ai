// Phase 4 · Module 8 — Rule Engine.
//
// Generic executor: loads the registry, evaluates every rule once, collects
// matches, merges effects (priority-weighted, additive — never overwrites), and
// resolves category conflicts. Pure + deterministic. Adding a rule requires NO
// change here. Rules never touch the ranking score.

import { RULES } from "./registry.ts";
import { PRIORITY_WEIGHT, type Rule, type RuleContext, type RuleResult, type MergedIntelligence } from "./types.ts";

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));
}
function uniq(a: string[]): string[] { return [...new Set(a.filter(Boolean))]; }

export interface RuleEngineOutput {
  merged: MergedIntelligence;
  matched: RuleResult[];
  durationMs: number;
}

/**
 * Run all rules over one story context and merge into structured intelligence.
 * @param ctx  read-only story context (blob precomputed lowercased).
 * @param rules registry (defaults to RULES; injectable for tests).
 */
export function runRuleEngine(ctx: RuleContext, rules: Rule[] = RULES): RuleEngineOutput {
  const t0 = Date.now();
  const matched: RuleResult[] = [];

  for (const r of rules) {
    let res: RuleResult;
    try {
      res = r.evaluate(ctx);
    } catch {
      // A rule failure must never break the engine (observability: skipped).
      res = { rule_id: r.id, rule_name: r.name, matched: false, confidence: 0, priority: r.priority, reason: "rule_error", effects: {}, metadata: { error: true } };
    }
    if (res.matched) matched.push(res);
  }

  // Priority-weighted additive merge (Critical influences most).
  const w = (p: RuleResult["priority"]) => PRIORITY_WEIGHT[p] / 3;   // Critical 1.67 … Info 0.33
  let opp = 0, dev = 0, fnd = 0, inv = 0, lrn = 0, trend = 0;
  let urgency = 0, timeSens = 0;
  const tags: string[] = [], categories: string[] = [], recs: string[] = [], reasoning: string[] = [];
  let confNum = 0, confDen = 0;

  for (const r of matched) {
    const f = r.effects;
    const k = w(r.priority);
    opp += (f.opportunity_score ?? 0) * k;
    dev += (f.developer_value ?? 0) * k;
    fnd += (f.founder_value ?? 0) * k;
    inv += (f.investor_value ?? 0) * k;
    lrn += (f.learning_value ?? 0) * k;
    trend += (f.trend_strength ?? 0) * k;
    urgency = Math.max(urgency, f.urgency ?? 0);            // most-urgent wins
    timeSens = Math.max(timeSens, f.time_sensitivity ?? 0);
    if (f.tags) tags.push(...f.tags);
    if (f.categories) categories.push(...f.categories);
    if (f.recommendations) recs.push(...f.recommendations);
    reasoning.push(`${r.rule_name}: ${r.reason} (confidence ${r.confidence}, ${r.priority})`);
    confNum += r.confidence * PRIORITY_WEIGHT[r.priority];
    confDen += PRIORITY_WEIGHT[r.priority];
  }

  // Conflict note: >1 distinct category from High/Critical rules → merged, flagged.
  const strongCats = uniq(matched.filter((r) => r.priority === "Critical" || r.priority === "High").flatMap((r) => r.effects.categories ?? []));
  const conflicts = strongCats.length > 1
    ? [`Multiple strong categories merged: ${strongCats.join(" + ")}`]
    : [];

  // Base values (Module 1) enriched by rule deltas — ADDITIVE layer, stored
  // separately. feed_items.developer_value (Module 1) is never overwritten.
  const merged: MergedIntelligence = {
    matched_rules: matched.map((r) => r.rule_id),
    rule_count: matched.length,
    opportunity_boost: clamp(opp),
    developer_value: clamp((ctx.developer_value ?? 0) + dev),
    founder_value: clamp((ctx.founder_value ?? 0) + fnd),
    investor_value: clamp((ctx.investor_value ?? 0) + inv),
    learning_value: clamp((ctx.learning_value ?? 0) + lrn),
    urgency: clamp(urgency),
    time_sensitivity: clamp(timeSens),
    trend_strength: clamp(trend),
    tags: uniq(tags),
    categories: uniq(categories),
    recommendations: uniq(recs).slice(0, 6),
    confidence: confDen ? clamp(confNum / confDen) : 0,
    reasoning,
    conflicts,
  };

  return { merged, matched, durationMs: Date.now() - t0 };
}

/** Build a RuleContext from a feed item (precomputes the lowercased blob). */
export function buildRuleContext(item: {
  title?: string; summary?: string; what_happened?: string; tag?: string; content_category?: string;
  trend_entities?: string[]; developer_value?: number; founder_value?: number; investor_value?: number;
  learning_value?: number; source_quality?: any;
}): RuleContext {
  const title = item.title ?? "";
  const summary = item.summary ?? "";
  const text = item.what_happened ?? "";
  return {
    title, summary, text, tag: item.tag, content_category: item.content_category,
    trend_entities: item.trend_entities,
    developer_value: item.developer_value, founder_value: item.founder_value,
    investor_value: item.investor_value, learning_value: item.learning_value,
    source_quality: item.source_quality ?? null,
    blob: `${title} ${summary} ${text}`.toLowerCase(),
  };
}
