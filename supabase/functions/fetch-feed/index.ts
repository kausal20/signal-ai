// Legacy entrypoint kept for manual triggers + backwards compat with old crons.
// Runs the full pipeline in a single shot: ingest all tiers -> dedup -> cluster
// -> extract -> edit -> rank -> publish -> notify. Production cron now uses
// ingest-tier + publish-feed independently; this stays as the "one button"
// debug / smoke-test endpoint.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { connectorFetch, loadConnectors } from "../_shared/sources.ts";
import { loadDisabledSources, updateSourceHealth, storeRawItems, startPipelineRun } from "../_shared/store.ts";
import { runPipeline } from "../_shared/pipeline.ts";
import { dedupeByCanonicalUrl, rejectRaw } from "../_shared/cluster.ts";
import { acquireLock, releaseLock } from "../_shared/reliability.ts";
import { Logger } from "../_shared/logger.ts";
import type { RawItem } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const runStart = Date.now();

  // Phase 8: this one-shot path must not overlap with the tiered crons.
  const holder = crypto.randomUUID();
  const gotLock = await acquireLock(sb, "fetch-feed", 290, holder);
  if (!gotLock) {
    return new Response(JSON.stringify({ ok: true, skipped: "locked" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const logger = new Logger(sb);
  const runId = await startPipelineRun(sb, "fetch-feed");

  try {
  // -------- Ingest all tiers in one pass --------
  const allConnectors = await loadConnectors(sb);
  const disabled = await loadDisabledSources(sb);
  const connectors = allConnectors.filter((c) => !disabled.has(c.source));

  const allRaw: RawItem[] = [];
  const statuses: Record<string, { status: string; count: number; durationMs: number; error?: string }> = {};
  const healthUpdates: Array<{ source: string; ok: boolean; count: number; durationMs: number; duplicates?: number; error?: string }> = [];

  await Promise.all(connectors.map(async (c) => {
    const t = Date.now();
    try {
      const items = await connectorFetch(c)();
      const dur = Date.now() - t;
      const distinct = new Set(items.map((i) => i.canonicalUrl)).size;
      allRaw.push(...items);
      statuses[c.source] = { status: "ok", count: items.length, durationMs: dur };
      healthUpdates.push({ source: c.source, ok: true, count: items.length, durationMs: dur, duplicates: Math.max(0, items.length - distinct) });
      logger.info("fetch_finished", { source: c.source, durationMs: dur, meta: { items: items.length } });
      await sb.from("fetch_log").insert({ source: c.source, status: "ok", items_fetched: items.length });
    } catch (e) {
      const dur = Date.now() - t;
      const msg = e instanceof Error ? e.message : String(e);
      statuses[c.source] = { status: "error", count: 0, durationMs: dur, error: msg };
      healthUpdates.push({ source: c.source, ok: false, count: 0, durationMs: dur, error: msg });
      logger.error("source_failed", { source: c.source, durationMs: dur, message: msg, stack: e instanceof Error ? e.stack : undefined });
      await sb.from("fetch_log").insert({ source: c.source, status: "error", items_fetched: 0, error: msg });
    }
  }));
  await updateSourceHealth(sb, healthUpdates);

  // Pre-stage 4 dedupe + reject so we persist clean raw rows before publishing.
  const deduped = dedupeByCanonicalUrl(allRaw);
  const rejectedPre: RawItem[] = [];
  const acceptedPre: RawItem[] = [];
  for (const item of deduped) {
    const reason = rejectRaw(item);
    if (reason) { item.rejectionReason = reason; rejectedPre.push(item); }
    else acceptedPre.push(item);
  }
  await storeRawItems(sb, acceptedPre, rejectedPre);

  // -------- Run the full pipeline (raw already stored) --------
  const sourcesOk = Object.values(statuses).filter((s) => s.status === "ok").length;
  const result = await runPipeline({
    sb,
    rawItems: acceptedPre,
    apiKey: LOVABLE_API_KEY,
    triggerLabel: "fetch-feed",
    alreadyStoredRaw: true,
    sourcesOk,
    sourcesTotal: connectors.length,
    disabledSources: [...disabled],
    logger,
    pipelineRunId: runId,
  });

  // Trigger notifications.
  if (result.stored > 0) {
    fetch(`${SUPABASE_URL}/functions/v1/send-notifications`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "fetch-feed" }),
    }).catch((e) => console.error("notify trigger", e));
  }

  return new Response(JSON.stringify({
    ok: true,
    status: result.status,
    curation_mode: result.curation_mode,
    raw: result.raw,
    rejected: result.rejected,
    accepted: result.accepted,
    clusters: result.clusters,
    curated: result.curated,
    stored: result.stored,
    audits: result.audits.length,
    disabled_sources: [...disabled],
    sources: statuses,
    sources_ok: sourcesOk,
    sources_total: connectors.length,
    ms: Date.now() - runStart,
    ran_at: new Date().toISOString(),
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    logger.error("fetch_feed_crashed", { message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
    await logger.flush();
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await releaseLock(sb, "fetch-feed");
  }
});
