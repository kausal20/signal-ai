// V4 CAP 6 — Long-term outcome learning (V4.1 batched + deduped).
// Records real success events (built, implemented, revenue, time_saved,
// adoption, feedback, useful, not_useful, action_completed, ignored) and applies
// a Bayesian update to the story's global confidence. Accepts single or batch.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { outcomeMass, recordBayes } from "../_shared/global_graph.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED = new Set([
  "built", "implemented", "ignored", "saved", "revenue", "time_saved",
  "adoption", "feedback", "useful", "not_useful", "action_completed",
]);

// Map V4.1 client kinds onto the Bayesian mass model in global_graph.
const KIND_MASS_ALIAS: Record<string, string> = {
  useful: "feedback", not_useful: "feedback", action_completed: "implemented",
};

interface OutEvent { event_id?: string; feed_item_id: string; outcome_kind: string; value?: number | null; note?: string | null; client_id?: string | null; }

function normalize(e: any, fallbackClient: string | null): OutEvent | null {
  const feed_item_id = String(e?.feed_item_id || "");
  const outcome_kind = String(e?.outcome_kind || "");
  if (!feed_item_id || !ALLOWED.has(outcome_kind)) return null;
  let value = Number.isFinite(e?.value) ? Number(e.value) : null;
  if (outcome_kind === "useful") value = 5;
  if (outcome_kind === "not_useful") value = 1;
  return {
    event_id: e?.event_id ? String(e.event_id).slice(0, 80) : undefined,
    feed_item_id, outcome_kind, value,
    note: e?.note ? String(e.note).slice(0, 500) : null,
    client_id: e?.client_id ? String(e.client_id).slice(0, 80) : fallbackClient,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("method not allowed", { status: 405, headers: corsHeaders });

  const t0 = Date.now();
  let body: any;
  try { body = await req.json(); }
  catch { return new Response(JSON.stringify({ error: "invalid json" }), { status: 400, headers: corsHeaders }); }

  const client_id = body.client_id ? String(body.client_id).slice(0, 80) : null;
  const raw: any[] = Array.isArray(body.events) ? body.events : [body];
  const events = raw.map((e) => normalize(e, client_id)).filter((e): e is OutEvent => e !== null).slice(0, 100);
  if (events.length === 0) return new Response(JSON.stringify({ error: "no valid events" }), { status: 400, headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Durable success-event log (deduped by event_id).
  let stored = 0;
  try {
    const { data, error } = await sb.from("outcome_events")
      .upsert(events.map((e) => ({
        event_id: e.event_id ?? null, client_id: e.client_id, feed_item_id: e.feed_item_id,
        outcome_kind: e.outcome_kind, value: e.value, note: e.note,
      })), { onConflict: "event_id", ignoreDuplicates: true })
      .select("id");
    if (error) console.error("outcome_events upsert", error);
    else stored = data?.length ?? 0;
  } catch (e) { console.error("outcome_events batch", e); }

  // 2. Bayesian global confidence update (CAP 3 + 6).
  for (const e of events) {
    const massKind = KIND_MASS_ALIAS[e.outcome_kind] ?? e.outcome_kind;
    const { success, fail } = outcomeMass(massKind, e.value ?? undefined);
    await recordBayes(sb, e.feed_item_id, "story", success, fail);
  }

  // 3. Telemetry (Part 6).
  sb.from("event_log").insert({
    level: "info", event: "outcomes_received", source: "record-outcome",
    message: `${events.length} outcomes, ${stored} stored`,
    duration_ms: Date.now() - t0,
    context: { client_id, received: events.length, stored },
  }).then(() => {}, () => {});

  return new Response(JSON.stringify({ ok: true, received: events.length, stored }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
