// Deterministic tests for Module 6 Notification Intelligence.
// Run: npx tsx supabase/functions/_shared/notification_engine.test.ts
import assert from "node:assert";
import {
  evaluateNotification, dedupAndGroup, computeFatigue, chooseSchedule,
  type StoryContext, type UserContext, type FatigueContext,
} from "./notification_engine.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

const NOW = new Date(Date.UTC(2026, 6, 5, 14, 0, 0));

const critical = (): StoryContext => ({
  id: "s_crit", title: "OpenAI releases GPT-6",
  summary: "New frontier model with major capability jump.",
  score: 96, freshness_score: 18, confidence_band: "Very High",
  source_quality: { tier: "S+", quality_score: 92, official: true, spam_risk: 0 },
  opportunity_intel: { type: "Model Release", urgency: 85, confidence: 90, time_window: "24 Hours" },
  opportunity_type: "Developer Opportunity",
  matched_rules: ["model_release", "breaking_news", "api_release"],
  rule_intelligence: { urgency: 90, time_sensitivity: 85, categories: ["Breaking"] },
  content_category: "Must Know", novelty_score: 82,
});

const lowQuality = (): StoryContext => ({
  id: "s_low", title: "Random blog: my thoughts on AI",
  summary: "Opinion piece.", score: 58, confidence_band: "Low",
  source_quality: { tier: "D", quality_score: 30, official: false, spam_risk: 45 },
  opportunity_intel: null, opportunity_type: null,
  matched_rules: [], rule_intelligence: null,
});

const fundingRound = (): StoryContext => ({
  id: "s_fund", title: "AcmeAI raises $12M Series A",
  summary: "Another round.", score: 78, freshness_score: 14, confidence_band: "Medium",
  source_quality: { tier: "A", quality_score: 68, official: false, spam_risk: 0 },
  opportunity_intel: { type: "Startup Opportunity", urgency: 55, confidence: 72, time_window: "1 Week" },
  opportunity_type: "Startup Opportunity",
  matched_rules: ["funding"], rule_intelligence: { urgency: 55, time_sensitivity: 55, categories: ["Startup Opportunity"] },
  content_category: "Founder Opportunity", novelty_score: 55,
});

const emptyUser = (): UserContext => ({});
const builder = (): UserContext => ({
  clusters: ["AI Builder", "Agent Developer"],
  interest_weights: { coding: 1.2, agents: 0.9 },
  opportunity_weights: { "Developer Opportunity": 60, "AI Agent Opportunity": 55 },
  dimension_confidence: { developer: 88 },
  saved_count: 6, opened_count: 40, dismissed_count: 3, reading_ms_total: 60000,
  matches_search: ["mcp"], matches_bookmark_topic: true, matches_project: false,
  persona: "developer",
});

const freshFatigue = (): FatigueContext => ({ notifs_today: 0, notifs_ignored_7d: 0, notifs_opened_7d: 0, minutes_since_last_notif: -1, daily_cap: 3 });
const heavyFatigue = (): FatigueContext => ({ notifs_today: 3, notifs_ignored_7d: 8, notifs_opened_7d: 1, minutes_since_last_notif: 10, daily_cap: 3 });
const midFatigue = (): FatigueContext => ({ notifs_today: 1, notifs_ignored_7d: 4, notifs_opened_7d: 1, minutes_since_last_notif: 55, daily_cap: 3 });

// 1. Critical OpenAI release → notify + immediate + Critical
{
  const d = evaluateNotification(critical(), builder(), freshFatigue(), NOW);
  assert.strictEqual(d.decision, "notify");
  assert.strictEqual(d.schedule, "immediate");
  assert.ok(d.score >= 85, `score ${d.score}`);
  assert.strictEqual(d.priority, "Critical");
  ok("Critical OpenAI release → notify + immediate + Critical");
}

// 2. Low quality blog → suppress
{
  const d = evaluateNotification(lowQuality(), builder(), freshFatigue(), NOW);
  assert.strictEqual(d.decision, "suppress");
  ok("Low quality blog → suppress");
}

// 3. Small funding + fatigue mid → hold/digest (never spam)
{
  const d = evaluateNotification(fundingRound(), builder(), midFatigue(), NOW);
  assert.notStrictEqual(d.decision, "notify");
  ok("Funding + mid fatigue → not-notify (hold/digest)");
}

// 4. Daily cap reached → suppress + schedule=never
{
  const d = evaluateNotification(critical(), builder(), heavyFatigue(), NOW);
  assert.strictEqual(d.schedule, "never");
  assert.strictEqual(d.decision, "suppress");
  ok("Daily cap → schedule=never + suppress");
}

// 5. Fatigue: ignore rate raises penalty; strong CTR reduces it
{
  const hi = computeFatigue({ notifs_today: 1, notifs_ignored_7d: 8, notifs_opened_7d: 1, minutes_since_last_notif: 120, daily_cap: 3 });
  const lo = computeFatigue({ notifs_today: 1, notifs_ignored_7d: 1, notifs_opened_7d: 5, minutes_since_last_notif: 120, daily_cap: 3 });
  assert.ok(hi.penalty > lo.penalty, `hi ${hi.penalty} vs lo ${lo.penalty}`);
  ok("Fatigue: low CTR > high CTR penalty");
}

// 6. Bookmark similar topic → priority increases
{
  const withBm = evaluateNotification(fundingRound(), { ...builder(), matches_bookmark_topic: true }, freshFatigue(), NOW);
  const noBm = evaluateNotification(fundingRound(), { ...builder(), matches_bookmark_topic: false, matches_search: [] }, freshFatigue(), NOW);
  assert.ok(withBm.score > noBm.score, `${withBm.score} vs ${noBm.score}`);
  ok("Bookmark similar → score increases");
}

// 7. Dedup: same topic within 24h → suppressed
{
  const a = evaluateNotification(fundingRound(), builder(), freshFatigue(), NOW);
  const b = evaluateNotification(fundingRound(), builder(), freshFatigue(), NOW);
  const r = dedupAndGroup([a, b], [{ key: a.topic_key, last_notified_at: new Date(NOW.getTime() - 3600_000).toISOString() }], NOW);
  assert.strictEqual(r.keep.filter((k) => k.topic_key === a.topic_key).length, 0);
  assert.ok(r.suppressed.some((s) => s.reasoning.some((r) => /Duplicate topic|already selected/i.test(r))));
  ok("Dedup: same topic in 24h → suppressed");
}

// 8. Grouping: 3+ digest items → digest summary
{
  // Low-urgency stories at night → all bucketed to morning_brief → grouped.
  const base: Partial<StoryContext> = {
    score: 78, freshness_score: 14, confidence_band: "Medium",
    source_quality: { tier: "A", quality_score: 68, official: false, spam_risk: 0 },
    opportunity_intel: { type: "Learning Opportunity", urgency: 20, confidence: 68, time_window: "1 Week" },
    rule_intelligence: { urgency: 20, time_sensitivity: 20 },
    novelty_score: 40,
  };
  const s1: StoryContext = { ...(base as StoryContext), id: "d1", title: "Story one", matched_rules: ["research_paper"], opportunity_type: "Learning Opportunity" };
  const s2: StoryContext = { ...(base as StoryContext), id: "d2", title: "Story two", matched_rules: ["education"], opportunity_type: "Learning Opportunity" };
  const s3: StoryContext = { ...(base as StoryContext), id: "d3", title: "Story three", matched_rules: ["tutorial"], opportunity_type: "Learning Opportunity" };
  const night = new Date(Date.UTC(2026, 6, 5, 23, 0, 0));   // 23:00 UTC → morning_brief
  const ds = [s1, s2, s3].map((s) => evaluateNotification(s, builder(), freshFatigue(), night));
  // Sanity: all 3 should have decision=digest and distinct topic keys.
  assert.ok(ds.every((d) => d.decision === "digest"), `decisions ${ds.map((d) => d.decision).join(",")}`);
  const r = dedupAndGroup(ds, [], night);
  assert.ok(r.digest, "digest present");
  assert.strictEqual(r.digest!.count, 3);
  ok("Grouping: 3+ digest items → single digest header");
}

// 9. Explainability: reasoning always present + non-empty
{
  const d = evaluateNotification(critical(), builder(), freshFatigue(), NOW);
  assert.ok(Array.isArray(d.reasoning) && d.reasoning.length >= 4);
  const joined = d.reasoning.join(" | ");
  assert.ok(/score|urgency|source|schedule|rule/i.test(joined));
  ok("Explainability: reasoning[] populated + meaningful");
}

// 10. Determinism
{
  const a = JSON.stringify(evaluateNotification(critical(), builder(), freshFatigue(), NOW));
  const b = JSON.stringify(evaluateNotification(critical(), builder(), freshFatigue(), NOW));
  assert.strictEqual(a, b);
  ok("Deterministic (same input → same output)");
}

// 11. Schedule buckets by hour (deterministic)
{
  const s = critical();
  s.rule_intelligence = { urgency: 30 };                        // not critical urgency
  s.opportunity_intel = { ...(s.opportunity_intel ?? {}), urgency: 30 };
  s.matched_rules = [];                                          // avoid CRITICAL_RULES trigger
  const morning = chooseSchedule(s, 0, new Date(Date.UTC(2026, 6, 5, 3, 0, 0)));
  const evening = chooseSchedule(s, 0, new Date(Date.UTC(2026, 6, 5, 20, 0, 0)));
  const midday  = chooseSchedule(s, 0, new Date(Date.UTC(2026, 6, 5, 12, 0, 0)));
  assert.strictEqual(morning, "morning_brief");
  assert.strictEqual(evening, "evening_digest");
  assert.strictEqual(midday, "wait");
  ok("Time engine: night→morning, evening→digest, midday→wait");
}

console.log(`\n${passed} tests passed.`);
