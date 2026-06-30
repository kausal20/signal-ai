// Stages 4-13: read recent raw_items from the DB, run the full pipeline,
// publish the daily feed, trigger notifications. Runs every 30 min.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { runPipeline } from "../_shared/pipeline.ts";
import { loadDisabledSources, startPipelineRun } from "../_shared/store.ts";
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

  // Phase 8: single publisher at a time (clustering + AI calls are expensive).
  const holder = crypto.randomUUID();
  const gotLock = await acquireLock(sb, "publish-feed", 290, holder);
  if (!gotLock) {
    return new Response(JSON.stringify({ ok: true, skipped: "locked" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const logger = new Logger(sb);
  try {
  // Read the last 24h of accepted raw items. Rejected rows are excluded —
  // they keep history in the table but never reach the editor.
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const { data, error } = await sb
    .from("raw_items")
    .select("*")
    .gte("published_at", since)
    .is("rejection_reason", null)
    .order("published_at", { ascending: false })
    .limit(2000);
  if (error) {
    logger.error("publish_read_failed", { message: error.message });
    await logger.flush();
    await releaseLock(sb, "publish-feed");
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const rawItems: RawItem[] = (data ?? []).map((r: any) => ({
    id: r.id,
    rawTitle: r.raw_title,
    rawText: r.raw_text ?? "",
    url: r.url,
    canonicalUrl: r.canonical_url,
    source: r.source,
    sourceLabel: r.source_label,
    sourceKind: r.source_kind,
    sourceWeight: Number(r.source_weight ?? 1),
    engagement: r.engagement ?? 0,
    published_at: r.published_at,
    hoursOld: (Date.now() - new Date(r.published_at).getTime()) / 3600_000,
  }));

  const disabled = await loadDisabledSources(sb);
  const runId = await startPipelineRun(sb, "publish-feed");
  const result = await runPipeline({
    sb,
    rawItems,
    apiKey: LOVABLE_API_KEY,
    triggerLabel: "publish-feed",
    alreadyStoredRaw: true,
    sourcesOk: 0,
    sourcesTotal: 0,
    disabledSources: [...disabled],
    logger,
    pipelineRunId: runId,
  });

  // Trigger notifications asynchronously (the function does its own caps).
  if (result.stored > 0) {
    fetch(`${SUPABASE_URL}/functions/v1/send-notifications`, {
      method: "POST",
      headers: { Authorization: `Bearer ${SUPABASE_ANON_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ trigger: "publish-feed" }),
    }).catch((e) => console.error("notify trigger", e));
  }

  return new Response(JSON.stringify({
    ok: true,
    status: result.status,
    raw: result.raw,
    accepted: result.accepted,
    rejected: result.rejected,
    clusters: result.clusters,
    curated: result.curated,
    stored: result.stored,
    notifications_queued: result.notifications_queued,
    curation_mode: result.curation_mode,
    audits: result.audits.length,
    errors: result.errors,
    ran_at: new Date().toISOString(),
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    logger.error("publish_crashed", { message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
    await logger.flush();
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await releaseLock(sb, "publish-feed");
  }
});
