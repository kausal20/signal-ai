// Stage 1+2: tier-aware ingestion. Triggered by cron at three cadences:
//   fast   — every 10 min (frontier labs)
//   medium — every 30 min (community + launches)
//   slow   — every 2  hrs (research + funding + market)
// Writes to raw_items only. Publishing is decoupled into `publish-feed`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { connectorFetch, loadConnectors } from "../_shared/sources.ts";
import { dedupeByCanonicalUrl, rejectRaw } from "../_shared/cluster.ts";
import { storeRawItems, updateSourceHealth, loadDisabledSources } from "../_shared/store.ts";
import { acquireLock, releaseLock } from "../_shared/reliability.ts";
import { Logger } from "../_shared/logger.ts";
import type { RawItem, SourceTier } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const runStart = Date.now();

  let tier: SourceTier = "fast";
  try {
    const body = await req.json().catch(() => ({}));
    if (body.tier === "medium" || body.tier === "slow") tier = body.tier;
  } catch { /* ignore */ }

  const logger = new Logger(sb);
  const jobName = `ingest-${tier}`;

  // Phase 8: prevent overlapping runs of the same tier.
  const holder = crypto.randomUUID();
  const gotLock = await acquireLock(sb, jobName, 290, holder);
  if (!gotLock) {
    logger.warn("job_skipped_locked", { source: jobName });
    await logger.flush();
    return new Response(JSON.stringify({ ok: true, skipped: "locked", tier }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    logger.info("ingest_started", { meta: { tier } });
    const allConnectors = await loadConnectors(sb, tier);
    const disabled = await loadDisabledSources(sb);
    const connectors = allConnectors.filter((c) => !disabled.has(c.source));

    const allRaw: RawItem[] = [];
    const statuses: Record<string, { status: string; count: number; durationMs: number; error?: string }> = {};
    const healthUpdates: Array<{ source: string; ok: boolean; count: number; durationMs: number; duplicates?: number; error?: string }> = [];

    await Promise.all(connectors.map(async (c) => {
      const t = Date.now();
      try {
        logger.debug("fetch_started", { source: c.source });
        const items = await connectorFetch(c)();
        const dur = Date.now() - t;
        // Per-source duplicate rate.
        const distinct = new Set(items.map((i) => i.canonicalUrl)).size;
        const duplicates = Math.max(0, items.length - distinct);
        allRaw.push(...items);
        statuses[c.source] = { status: "ok", count: items.length, durationMs: dur };
        healthUpdates.push({ source: c.source, ok: true, count: items.length, durationMs: dur, duplicates });
        logger.info("fetch_finished", { source: c.source, durationMs: dur, meta: { items: items.length } });
        await sb.from("fetch_log").insert({ source: c.source, status: "ok", items_fetched: items.length });
      } catch (e) {
        const dur = Date.now() - t;
        const msg = e instanceof Error ? e.message : String(e);
        const stack = e instanceof Error ? e.stack : undefined;
        statuses[c.source] = { status: "error", count: 0, durationMs: dur, error: msg };
        healthUpdates.push({ source: c.source, ok: false, count: 0, durationMs: dur, error: msg });
        logger.error("source_failed", { source: c.source, durationMs: dur, message: msg, stack });
        await sb.from("fetch_log").insert({ source: c.source, status: "error", items_fetched: 0, error: msg });
      }
    }));

    await updateSourceHealth(sb, healthUpdates, tier);

    // Log auto-disabled + recovered sources.
    for (const u of healthUpdates) {
      if (!u.ok && (statuses[u.source]?.status === "error")) { /* handled above */ }
    }

    const deduped = dedupeByCanonicalUrl(allRaw);
    const rejected: RawItem[] = [];
    const accepted: RawItem[] = [];
    for (const item of deduped) {
      const reason = rejectRaw(item);
      if (reason) { item.rejectionReason = reason; rejected.push(item); }
      else accepted.push(item);
    }
    await storeRawItems(sb, accepted, rejected);

    const sourcesOk = Object.values(statuses).filter((s) => s.status === "ok").length;
    const sourcesTotal = Object.values(statuses).length;
    logger.info("ingest_completed", { durationMs: Date.now() - runStart, meta: { tier, raw: allRaw.length, accepted: accepted.length, sourcesOk, sourcesTotal } });
    await logger.flush();

    return new Response(JSON.stringify({
      ok: true,
      tier,
      raw: allRaw.length,
      accepted: accepted.length,
      rejected: rejected.length,
      connectors: connectors.length,
      disabled: [...disabled],
      sources_ok: sourcesOk,
      sources_total: sourcesTotal,
      sources: statuses,
      ms: Date.now() - runStart,
      ran_at: new Date().toISOString(),
    }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    logger.error("ingest_crashed", { message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
    await logger.flush();
    return new Response(JSON.stringify({ error: String(e), tier }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await releaseLock(sb, jobName);
  }
});
