// High-level orchestrator (Stages 4..13) with structured results, logging,
// circuit breakers, and a queryable pipeline_runs record. No silent failures.

import { dedupeByCanonicalUrl, clusterRaw, clusterPriority, enrichClusters, rejectRaw } from "./cluster.ts";
import { curateClustersAI, fallbackCurate, secondPassReview } from "./editor.ts";
import { loadTrendIndex } from "./trends.ts";
import { assembleDailyFeed, rankItems, notificationCandidates } from "./publish.ts";
import {
  storeRawItems, storeClusters, storeEditorialAudits,
  upsertFeedItems, pruneFeedItems, recordPipelineRun,
  startPipelineRun, finishPipelineRun,
} from "./store.ts";
import { persistStoryIntelligence, buildTrendContext } from "./intelligence_v2.ts";
import { runAgentReasoning } from "./agents.ts";
import { estimateROI } from "./roi.ts";
import { buildScoreBreakdown } from "./scoring.ts";
import { evaluateSource } from "./source_quality.ts";
import { runRuleEngine, buildRuleContext } from "./rules/engine.ts";
import { generateOpportunity } from "./opportunity.ts";
import { embedAndStoreStories, embedAndStoreConcepts } from "./vector_store.ts";
import { getEmbeddingProvider } from "./embeddings.ts";
import type { StoredStory } from "./intelligence_engine.ts";
import { Logger } from "./logger.ts";
import { runStage, CircuitBreaker } from "./reliability.ts";
import type { RawItem, SignalItem, EditorialAudit, StoryCluster } from "./types.ts";

interface OrchestratorInput {
  sb: any;
  rawItems: RawItem[];
  apiKey: string;
  triggerLabel: string;
  alreadyStoredRaw?: boolean;
  sourcesOk?: number;
  sourcesTotal?: number;
  disabledSources?: string[];
  tier?: string;
  logger?: Logger;
  pipelineRunId?: string | null;
}

interface OrchestratorOutput {
  raw: number;
  accepted: number;
  rejected: number;
  clusters: number;
  curated: number;
  stored: number;
  notifications_queued: number;
  curation_mode: "ai" | "fallback" | "skipped";
  status: "completed" | "partial" | "failed";
  audits: EditorialAudit[];
  daily: SignalItem[];
  errors: Array<{ stage: string; error: string }>;
}

export async function runPipeline(input: OrchestratorInput): Promise<OrchestratorOutput> {
  const { sb, apiKey } = input;
  const runStart = Date.now();
  const logger = input.logger ?? new Logger(sb, input.pipelineRunId ?? undefined);
  const runId = input.pipelineRunId ?? await startPipelineRun(sb, input.triggerLabel);

  const timings: Record<string, number> = {};
  const stageResults: Record<string, { ok: boolean; durationMs: number; degraded?: boolean; error?: string }> = {};
  const errors: Array<{ stage: string; error: string }> = [];

  function record<T>(r: { stage: string; ok: boolean; durationMs: number; error?: string; degraded?: boolean }): void {
    timings[r.stage] = r.durationMs;
    stageResults[r.stage] = { ok: r.ok, durationMs: r.durationMs, degraded: r.degraded, error: r.error };
    if (!r.ok && r.error) errors.push({ stage: r.stage, error: r.error });
  }

  logger.info("pipeline_started", { meta: { trigger: input.triggerLabel, raw: input.rawItems.length } });

  // Stage 4: dedup + reject.
  const dedupeRes = await runStage("dedupe_reject", async () => {
    const deduped = dedupeByCanonicalUrl(input.rawItems);
    const rejected: RawItem[] = [];
    const accepted: RawItem[] = [];
    for (const item of deduped) {
      const reason = rejectRaw(item);
      if (reason) { item.rejectionReason = reason; rejected.push(item); }
      else accepted.push(item);
    }
    return { accepted, rejected, dupCount: input.rawItems.length - deduped.length };
  }, { logger });
  record(dedupeRes);
  const accepted = dedupeRes.value?.accepted ?? [];
  const rejected = dedupeRes.value?.rejected ?? [];

  if (!input.alreadyStoredRaw) {
    const sr = await runStage("store_raw", () => storeRawItems(sb, accepted, rejected), { logger });
    record(sr);
  }

  // Stage 5: cluster + prioritize.
  const clusterRes = await runStage("cluster", async () => {
    return clusterRaw(accepted).sort((a, b) => clusterPriority(b) - clusterPriority(a)).slice(0, 84);
  }, { logger });
  record(clusterRes);
  const clusters: StoryCluster[] = clusterRes.value ?? [];
  logger.info("clusters_created", { stage: "cluster", meta: { count: clusters.length, multi: clusters.filter((c) => c.members.length >= 2).length } });

  // Stage 6: full article extraction (best-effort, degraded on failure).
  const extractRes = await runStage("extract", () => enrichClusters(clusters, 28), { logger });
  record(extractRes);

  // Stage 7+8: AI editorial with circuit breaker → deterministic fallback.
  const breaker = new CircuitBreaker({ name: "ai_gateway", failureThreshold: 3, cooldownMs: 120_000 });
  await breaker.load(sb);

  const editorRes = await runStage("editorial", async () => {
    const curated: SignalItem[] = [];
    const allAudits: EditorialAudit[] = [];
    let aiOk = false;
    let aiCalls = 0;
    let aiFailures = 0;

    if (breaker.canAttempt()) {
      for (let i = 0; i < clusters.length; i += 7) {
        aiCalls++;
        try {
          const { items, ok, audits } = await curateClustersAI(clusters.slice(i, i + 7), apiKey, breaker);
          if (ok) { aiOk = true; }
          else { aiFailures++; }
          curated.push(...items);
          allAudits.push(...audits);
        } catch (e) {
          aiFailures++;
          logger.error("ai_chunk_failed", { stage: "editorial", message: e instanceof Error ? e.message : String(e) });
        }
        await new Promise((r) => setTimeout(r, 350));
      }
    } else {
      logger.warn("ai_gateway_circuit_open", { stage: "editorial", source: "ai_gateway" });
    }

    // Persist breaker outcome.
    if (aiOk) await breaker.recordSuccess(sb);
    else if (aiCalls > 0 || !breaker.canAttempt()) await breaker.recordFailure(sb, "ai gateway empty/failed");

    let mode: "ai" | "fallback" = "ai";
    if (curated.length === 0 && clusters.length > 0) {
      mode = "fallback";
      logger.warn("ai_fallback_used", { stage: "editorial", source: "ai_gateway", meta: { aiCalls, aiFailures } });
      curated.push(...fallbackCurate(clusters));
    } else if (!aiOk) {
      mode = "fallback";
    }
    return { curated, allAudits, mode, aiOk };
  }, { logger });
  record({ ...editorRes, degraded: editorRes.value?.mode === "fallback" });
  const curated = editorRes.value?.curated ?? [];
  const allAudits = editorRes.value?.allAudits ?? [];
  const curation_mode: "ai" | "fallback" | "skipped" =
    clusters.length === 0 ? "skipped" : (editorRes.value?.mode ?? "fallback");

  // Stage 10+11: trend index → ranking.
  const rankRes = await runStage("rank", async () => {
    const trendIndex = await loadTrendIndex(sb);
    return rankItems(curated, trendIndex);
  }, { logger });
  record(rankRes);
  const ranked = rankRes.value ?? curated;

  // Second-pass managing editor: top 25 only, merge/rewrite/reject. Falls back
  // deterministically if the gateway is down (circuit breaker shared).
  const secondPassRes = await runStage("second_pass", async () => {
    const reviewed = await secondPassReview(ranked, apiKey, breaker);
    logger.info("second_pass_done", { stage: "second_pass", meta: { before: ranked.length, after: reviewed.length } });
    return reviewed;
  }, { logger });
  record({ ...secondPassRes, degraded: !secondPassRes.ok });
  const polished = secondPassRes.value ?? ranked;

  // Stage 12: lineup + persist (gated: prune only after a successful upsert).
  const publishRes = await runStage("publish", async () => {
    const daily = assembleDailyFeed(polished);
    await storeClusters(sb, clusters, curated);
    await storeEditorialAudits(sb, allAudits);
    // Phase 4 · Module 1 — attach the explainable scoring layer. ADDITIVE ONLY:
    // it reads the already-computed dimension scores and never mutates `score`,
    // `leverage_score`, or anything rankItems/assembleDailyFeed read, so the
    // feed order is unchanged. Runs after assembly on the final lineup.
    const scoredAt = Date.now();
    let factorTotal = 0;
    let ruleMatchTotal = 0;
    let oppTotal = 0;
    for (const it of daily) {
      const b = buildScoreBreakdown(it as any, scoredAt);
      (it as any).score_factors = b.factors;
      (it as any).freshness_score = b.freshness;
      (it as any).confidence_band = b.confidence_band;
      (it as any).developer_value = b.developer_value;
      (it as any).founder_value = b.founder_value;
      (it as any).investor_value = b.investor_value;
      (it as any).learning_value = b.learning_value;
      factorTotal += b.factors.length;
      // Module 2 — explainable source quality (additive; never affects ranking).
      const sq = evaluateSource({
        url: it.url,
        source: it.source,
        source_label: it.source_label,
        title: it.title,
        summary: it.summary,
        source_count: (it as any).source_count,
        corroboration_score: it.corroboration_score,
      });
      (it as any).source_quality = sq;
      // Module 8 — rule engine (runs AFTER source quality, BEFORE recommendation).
      // Additive: writes a separate rule-intelligence layer; never mutates the
      // ranking score or Module 1/2 columns.
      const rc = buildRuleContext({
        title: it.title, summary: it.summary, what_happened: (it as any).what_happened,
        tag: it.tag, content_category: it.content_category, trend_entities: it.trend_entities,
        developer_value: (it as any).developer_value, founder_value: (it as any).founder_value,
        investor_value: (it as any).investor_value, learning_value: (it as any).learning_value,
        source_quality: sq,
      });
      const re = runRuleEngine(rc);
      (it as any).rule_intelligence = re.merged;
      (it as any).matched_rules = re.merged.matched_rules;
      ruleMatchTotal += re.merged.rule_count;
      // Module 4 — opportunity intelligence (after rules, before recommendation).
      // Consumes rules + source quality + score; additive; ranking untouched.
      const opp = generateOpportunity({
        id: it.id, title: it.title, summary: it.summary, why_it_matters: it.why_it_matters,
        score: it.score, rule_intelligence: re.merged, matched_rules: re.merged.matched_rules,
        source_quality: sq,
      });
      (it as any).opportunity_intel = opp ?? {};
      (it as any).opportunity_type = opp?.type ?? null;
      if (opp) oppTotal++;
    }
    if (daily.length > 0) logger.info("scoring_done", { stage: "publish", meta: { stories: daily.length, avg_factors: Math.round(factorTotal / daily.length), avg_rules: Math.round(ruleMatchTotal / daily.length), opportunities: oppTotal } });
    const fetchedAt = new Date().toISOString();
    if (daily.length > 0) {
      const { error } = await upsertFeedItems(sb, daily, fetchedAt);
      if (error) throw new Error(`feed upsert: ${error.message ?? error}`);
      await pruneFeedItems(sb, fetchedAt);
      logger.info("stories_published", { stage: "publish", meta: { count: daily.length } });
    }
    return daily;
  }, { logger });
  record(publishRes);
  const daily = publishRes.value ?? [];

  // Intelligence Engine V2: reason ONCE per published story (not per user) and
  // cache the reusable 8-persona intelligence. Degrades to deterministic
  // fallback when the gateway is down; never blocks feed availability.
  const reasoningRes = await runStage("reasoning", async () => {
    if (daily.length === 0) return 0;
    const trendIndex = await loadTrendIndex(sb);
    const out: Array<{ feed_item_id: string; intel: any; degraded: boolean }> = [];
    let reasoned = 0;
    // V4 CAP 4: multi-agent reasoning per story (cached, reused by all users).
    // CAP 5: attach deterministic ROI. Small concurrency for gateway limits.
    for (let i = 0; i < daily.length; i += 3) {
      const batch = daily.slice(i, i + 3);
      const results = await Promise.all(batch.map(async (item) => {
        const story = item as unknown as StoredStory;
        const ctx = buildTrendContext(item.trend_entities ?? [], trendIndex);
        const { intel, ok, degraded } = await runAgentReasoning(story, ctx, apiKey, breaker);
        intel.roi = estimateROI(intel, story);   // CAP 5
        if (ok) reasoned++;
        return { feed_item_id: item.id, intel, degraded };
      }));
      out.push(...results);
    }
    await persistStoryIntelligence(sb, out);

    // V4 CAP 1: generate + cache embeddings for stories and their concepts.
    try {
      const provider = getEmbeddingProvider();
      await embedAndStoreStories(sb, daily.map((d) => ({
        id: d.id, text: `${d.title}. ${d.summary} ${d.why_it_matters ?? ""}`,
      })), provider);
      const concepts = [...new Set(daily.flatMap((d) => d.trend_entities ?? []))]
        .map((c) => ({ concept: c, text: c.replace(/_/g, " ") }));
      await embedAndStoreConcepts(sb, concepts, provider);
    } catch (e) { logger.warn("embedding_failed", { stage: "reasoning", message: e instanceof Error ? e.message : String(e) }); }

    logger.info("reasoning_done", { stage: "reasoning", meta: { stories: daily.length, reasoned, agents: "multi" } });
    return reasoned;
  }, { logger });
  record({ ...reasoningRes, degraded: (reasoningRes.value ?? 0) < daily.length });

  const notifQueued = daily.length > 0 ? notificationCandidates(daily).length : 0;

  // Determine overall status.
  const criticalFailed = !publishRes.ok;
  const anyFailed = Object.values(stageResults).some((s) => !s.ok);
  const status: "completed" | "partial" | "failed" =
    criticalFailed ? "failed" : anyFailed ? "partial" : "completed";

  const durationMs = Date.now() - runStart;
  const acceptance_rate = accepted.length === 0 ? 0 : curated.length / accepted.length;
  const rewrite_success_rate = editorRes.value?.aiOk ? 1 : 0;

  // Legacy metrics table (kept for existing dashboards).
  await recordPipelineRun(sb, {
    curation_mode,
    tier: input.tier,
    raw_count: input.rawItems.length,
    rejected_count: rejected.length,
    accepted_count: accepted.length,
    cluster_count: clusters.length,
    multi_source_clusters: clusters.filter((c) => c.members.length >= 2).length,
    curated_count: curated.length,
    stored_count: daily.length,
    sources_ok: input.sourcesOk ?? 0,
    sources_total: input.sourcesTotal ?? 0,
    disabled_sources: input.disabledSources ?? [],
    duration_ms: durationMs,
    ai_gateway_ok: curation_mode === "ai",
    stage_timings: timings,
    acceptance_rate,
    rewrite_success_rate,
  });

  // Detailed run record (Phase 3).
  await finishPipelineRun(sb, runId, {
    status,
    duration_ms: durationMs,
    sources_processed: input.sourcesTotal ?? 0,
    sources_ok: input.sourcesOk ?? 0,
    stories_fetched: input.rawItems.length,
    stories_accepted: accepted.length,
    stories_rejected: rejected.length,
    stories_clustered: clusters.length,
    stories_published: daily.length,
    notifications_queued: notifQueued,
    fallback_used: curation_mode === "fallback",
    error_count: errors.length + logger.errorCount,
    stage_timings: timings,
    stage_results: stageResults,
    errors,
  });

  logger.info("pipeline_completed", { durationMs, meta: { status, stored: daily.length, mode: curation_mode } });
  await logger.flush();

  return {
    raw: input.rawItems.length,
    accepted: accepted.length,
    rejected: rejected.length,
    clusters: clusters.length,
    curated: curated.length,
    stored: daily.length,
    notifications_queued: notifQueued,
    curation_mode,
    status,
    audits: allAudits,
    daily,
    errors,
  };
}
