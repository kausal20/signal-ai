// Database writes for the pipeline. Centralizing keeps upsert shapes in
// one place so a schema change touches one file.

import type { RawItem, StoryCluster, SignalItem, EditorialAudit } from "./types.ts";
import { sourceUrlsFor } from "./cluster.ts";
import { dbWrite } from "./reliability.ts";

const MAX_CONSECUTIVE_FAILURES = 3;
// Exponential disable window per failure streak, capped (Phase 11 self-healing).
const DISABLE_BACKOFF_MIN = [15, 30, 60, 120, 360]; // minutes

export async function storeRawItems(sb: any, rawItems: RawItem[], rejected: RawItem[]): Promise<void> {
  const rows = [...rawItems, ...rejected].map((i) => ({
    id: i.id,
    canonical_url: i.canonicalUrl,
    raw_title: i.rawTitle,
    raw_text: i.rawText,
    url: i.url,
    source: i.source,
    source_label: i.sourceLabel,
    source_kind: i.sourceKind,
    source_weight: i.sourceWeight,
    engagement: i.engagement,
    published_at: i.published_at,
    cluster_key: null,
    rejection_reason: i.rejectionReason ?? null,
  }));
  if (rows.length === 0) return;
  // Idempotent upsert (onConflict id) wrapped with retry on transient DB errors.
  await dbWrite("raw_items.upsert", () => sb.from("raw_items").upsert(rows, { onConflict: "id" }));
}

export async function storeClusters(sb: any, clusters: StoryCluster[], items: SignalItem[]): Promise<void> {
  const byId = new Map(items.map((i) => [i.id, i]));
  const rows = clusters.map((c) => {
    const item = byId.get(c.id);
    return {
      id: c.id,
      canonical_title: item?.title ?? c.primary.rawTitle,
      canonical_url: c.primary.canonicalUrl,
      content_category: item?.content_category ?? null,
      source_count: c.members.length,
      confidence_score: item?.confidence_score ?? Math.min(100, 45 + c.members.length * 8),
      best_score: item?.score ?? 0,
      source_urls: sourceUrlsFor(c),
      last_seen_at: new Date().toISOString(),
    };
  });
  if (rows.length === 0) return;
  await dbWrite("story_clusters.upsert", () => sb.from("story_clusters").upsert(rows, { onConflict: "id" }));
}

export async function storeEditorialAudits(sb: any, audits: EditorialAudit[]): Promise<void> {
  if (audits.length === 0) return;
  try {
    await sb.from("editorial_audits").insert(audits.map((a) => ({
      cluster_id: a.cluster_id,
      leverage_score: a.leverage_score,
      q_founder: a.q_founder,
      q_builder: a.q_builder,
      q_agency: a.q_agency,
      q_vibe_coder: a.q_vibe_coder,
      q_saves_time: a.q_saves_time,
      q_creates_business: a.q_creates_business,
      q_changes_workflow: a.q_changes_workflow,
      q_remember_tomorrow: a.q_remember_tomorrow,
      q_recommend: a.q_recommend,
      one_sentence: a.one_sentence,
      teen_understandable: a.teen_understandable,
      action_required: a.action_required,
      rejection_reason: a.rejection_reason ?? null,
      raw_payload: a.raw_payload ?? null,
    })));
  } catch (e) { console.error("editorial_audits insert", e); }
}

export async function upsertFeedItems(sb: any, dailyFeed: SignalItem[], fetchedAt: string): Promise<{ error: any }> {
  if (dailyFeed.length === 0) return { error: null };
  // NOTE: explicit column whitelist below. A stray unknown column makes
  // PostgREST reject the entire batch — the original zero-stories bug.
  const rows = dailyFeed.map((i) => ({
    id: i.id,
    title: i.title,
    summary: i.summary,
    why_it_matters: i.why_it_matters,
    what_happened: i.what_happened,
    opportunity: i.opportunity,
    who_for: i.who_for,
    url: i.url,
    tag: i.tag,
    source: i.source,
    source_label: i.source_label,
    source_urls: i.source_urls,
    category: i.category,
    content_category: i.content_category,
    score: i.score,
    usefulness: i.usefulness,
    vibe_friendly: i.vibe_friendly,
    engagement: i.engagement,
    underrated: i.underrated ?? false,
    growth: i.growth ?? null,
    published_at: i.published_at,
    impact: i.impact,
    novelty_score: i.novelty_score,
    business_impact_score: i.business_impact_score,
    builder_value_score: i.builder_value_score,
    adoption_potential_score: i.adoption_potential_score,
    market_impact_score: i.market_impact_score,
    confidence_score: i.confidence_score,
    opportunity_score: i.opportunity_score,
    corroboration_score: i.corroboration_score,
    source_count: i.source_count,
    leverage_score: i.leverage_score,
    trend_score: i.trend_score,
    momentum_score: i.momentum_score,
    action_label: i.action_label,
    action: i.action,
    risk: i.risk,
    who_benefits: i.who_benefits,
    who_should_ignore: i.who_should_ignore,
    expected_impact: i.expected_impact,
    time_horizon: i.time_horizon,
    trend_entities: i.trend_entities,
    ranking_reason: i.ranking_reason,
    fetched_at: fetchedAt,
  }));
  // Idempotent + retried. Returns the PostgREST result so callers can gate
  // the prune (only delete old rows once the new batch landed).
  const res = await dbWrite("feed_items.upsert", () => sb.from("feed_items").upsert(rows, { onConflict: "id" }));
  return res ?? { error: new Error("feed_items upsert returned null after retries") };
}

export async function pruneFeedItems(sb: any, fetchedAt: string): Promise<void> {
  // Signal is a daily snapshot, not an infinite scroll. Anything older than
  // this run was either replaced or expired; drop it.
  await sb.from("feed_items").delete().lt("fetched_at", fetchedAt);
  // Age-based expiry applies ONLY to rows from PRIOR runs (fetched_at < fetchedAt).
  // The current batch must never be pruned by article date — a curated story can
  // legitimately reference an older-dated paper/blog post and still belong in
  // today's feed. Without this guard the snapshot we just wrote is deleted on the
  // spot (the zero-stories-after-publish bug).
  const now = Date.now();
  await sb.from("feed_items").delete().lt("fetched_at", fetchedAt).eq("tag", "news").lt("published_at", new Date(now - 48 * 3600_000).toISOString());
  await sb.from("feed_items").delete().lt("fetched_at", fetchedAt).eq("tag", "tool").lt("published_at", new Date(now - 7 * 24 * 3600_000).toISOString());
  await sb.from("feed_items").delete().lt("fetched_at", fetchedAt).eq("tag", "use-case").lt("published_at", new Date(now - 7 * 24 * 3600_000).toISOString());
}

// =====================================================================
// Source health (Stage 1 telemetry) — auto-disable failing connectors.
// =====================================================================
export async function updateSourceHealth(
  sb: any,
  updates: Array<{ source: string; ok: boolean; count: number; durationMs: number; duplicates?: number; error?: string }>,
  tier?: string,
): Promise<void> {
  if (updates.length === 0) return;
  try {
    const { data: existing } = await sb
      .from("source_health")
      .select("source,consecutive_failures,total_failures,total_runs,last_ok_at,avg_response_ms,items_fetched_total")
      .in("source", updates.map((u) => u.source));
    const prev = new Map((existing ?? []).map((r: any) => [r.source, r]));
    const nowIso = new Date().toISOString();

    const rows = updates.map((u) => {
      const p: any = prev.get(u.source) ?? {
        consecutive_failures: 0, total_failures: 0, total_runs: 0,
        avg_response_ms: 0, items_fetched_total: 0,
      };
      const wasFailing = (p.consecutive_failures ?? 0) > 0;
      const consecutive = u.ok ? 0 : (p.consecutive_failures ?? 0) + 1;
      const totalRuns = (p.total_runs ?? 0) + 1;
      const totalFailures = (p.total_failures ?? 0) + (u.ok ? 0 : 1);
      const successRate = (totalRuns - totalFailures) / Math.max(1, totalRuns);
      const uptimePct = Math.round(successRate * 1000) / 10;
      const avgMs = Math.round(((p.avg_response_ms ?? 0) * (totalRuns - 1) + u.durationMs) / totalRuns);
      const itemsTotal = (p.items_fetched_total ?? 0) + u.count;
      const dupRate = u.count > 0 && u.duplicates != null ? Math.round((u.duplicates / u.count) * 1000) / 10 : 0;

      // Self-healing: exponential disable window; auto re-enable on success.
      const disabled = !u.ok && consecutive >= MAX_CONSECUTIVE_FAILURES;
      let disabledUntil: string | null = null;
      if (disabled) {
        const idx = Math.min(consecutive - MAX_CONSECUTIVE_FAILURES, DISABLE_BACKOFF_MIN.length - 1);
        disabledUntil = new Date(Date.now() + DISABLE_BACKOFF_MIN[idx] * 60_000).toISOString();
      }
      const circuitState = disabled ? "open" : (u.ok && wasFailing ? "half_open" : "closed");

      return {
        source: u.source,
        consecutive_failures: consecutive,
        total_failures: totalFailures,
        total_runs: totalRuns,
        disabled,
        disabled_until: disabledUntil,
        recovered_at: (u.ok && wasFailing) ? nowIso : (p.recovered_at ?? null),
        last_status: u.ok ? "ok" : "error",
        last_error: u.error ?? (u.ok ? null : p.last_error ?? null),
        last_ok_at: u.ok ? nowIso : (p.last_ok_at ?? null),
        last_failed_at: u.ok ? (p.last_failed_at ?? null) : nowIso,
        last_item_count: u.count,
        items_fetched_total: itemsTotal,
        avg_response_ms: avgMs,
        success_rate: successRate,
        uptime_pct: uptimePct,
        duplicate_rate: dupRate,
        circuit_state: circuitState,
        tier: tier ?? "medium",
        updated_at: nowIso,
      };
    });
    await dbWrite("source_health.upsert", () => sb.from("source_health").upsert(rows, { onConflict: "source" }));
  } catch (e) { console.error("source_health upsert", e); }
}

// A source is skipped only while its disable window is active. Once
// disabled_until passes it gets a recovery probe automatically (Phase 11).
export async function loadDisabledSources(sb: any): Promise<Set<string>> {
  const disabled = new Set<string>();
  try {
    const nowIso = new Date().toISOString();
    const { data } = await sb
      .from("source_health")
      .select("source,disabled,disabled_until")
      .eq("disabled", true);
    for (const r of data ?? []) {
      if (r.disabled_until && r.disabled_until < nowIso) continue; // window expired -> probe again
      disabled.add(r.source);
    }
  } catch (e) { console.error("loadDisabledSources", e); }
  return disabled;
}

// =====================================================================
// Detailed pipeline run record (Phase 3). Insert at start, patch at end.
// =====================================================================
export async function startPipelineRun(sb: any, trigger: string): Promise<string | null> {
  const res = await dbWrite("pipeline_runs.start", () =>
    sb.from("pipeline_runs").insert({ trigger, status: "running" }).select("id").single());
  return res?.data?.id ?? null;
}

export async function finishPipelineRun(
  sb: any,
  id: string | null,
  patch: Record<string, unknown>,
): Promise<void> {
  if (!id) return;
  await dbWrite("pipeline_runs.finish", () =>
    sb.from("pipeline_runs").update({ ...patch, ended_at: new Date().toISOString() }).eq("id", id));
}

// =====================================================================
// Pipeline run telemetry.
// =====================================================================
export interface PipelineMetricsRow {
  curation_mode: "ai" | "fallback" | "skipped";
  tier?: string;
  raw_count: number;
  rejected_count: number;
  accepted_count: number;
  cluster_count: number;
  multi_source_clusters: number;
  curated_count: number;
  stored_count: number;
  sources_ok: number;
  sources_total: number;
  disabled_sources: string[];
  duration_ms: number;
  ai_gateway_ok: boolean;
  stage_timings: Record<string, number>;
  acceptance_rate: number;
  rewrite_success_rate: number;
}

export async function recordPipelineRun(sb: any, row: PipelineMetricsRow): Promise<void> {
  try {
    await sb.from("pipeline_metrics").insert(row);
  } catch (e) { console.error("pipeline_metrics insert", e); }
}
