// Self-Learning Feedback capture (V3 CAP 1 + CAP 5, V4.1 batched + deduped).
// Accepts either a single signal OR a batch { events: [...] }. Idempotent via
// per-event event_id. Fires aggregate outcome + Bayesian updates. Emits
// telemetry to event_log. Fire-and-forget from the client; never blocks UI.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ALLOWED = new Set([
  "opened", "completed", "skipped", "bookmarked", "dismissed", "shared", "clicked_source",
  "reading_time", "prompt_copied", "tool_clicked", "workflow_opened", "external_link",
  "notification_opened", "notification_dismissed", "search", "search_result_click",
  "topic_revisit", "session_start", "session_end", "onboarding_completed",
]);

// signal_kind the DB CHECK accepts (V3 set). Map newer client kinds onto them
// so we never violate the constraint while still learning from the richer event.
const KIND_DB_MAP: Record<string, string> = {
  completed: "reading_time", external_link: "clicked_source",
  search_result_click: "clicked_source", session_start: "opened", session_end: "skipped",
  onboarding_completed: "opened",
};

const OUTCOME_FIELD: Record<string, string> = {
  opened: "clicks", clicked_source: "clicks", tool_clicked: "clicks", workflow_opened: "clicks",
  prompt_copied: "clicks", notification_opened: "clicks", external_link: "clicks", search_result_click: "clicks",
  bookmarked: "saves", shared: "shares",
  dismissed: "ignores", skipped: "ignores", notification_dismissed: "ignores",
  topic_revisit: "returns",
};

interface InEvent {
  event_id?: string; feed_item_id?: string; signal_kind: string;
  duration_ms?: number; query?: string; persona?: string; meta?: Record<string, unknown>;
}

function normalize(e: any): InEvent | null {
  const signal_kind = String(e?.signal_kind || "");
  if (!ALLOWED.has(signal_kind)) return null;
  const feed_item_id = e?.feed_item_id ? String(e.feed_item_id) : "";
  // session/search events may not reference a story.
  const needsItem = !["search", "session_start", "session_end", "topic_revisit", "onboarding_completed"].includes(signal_kind);
  if (needsItem && !feed_item_id) return null;
  return {
    event_id: e?.event_id ? String(e.event_id).slice(0, 80) : undefined,
    feed_item_id,
    signal_kind,
    duration_ms: Number.isFinite(e?.duration_ms) ? Math.max(0, Math.min(7_200_000, Math.round(e.duration_ms))) : undefined,
    query: e?.query ? String(e.query).slice(0, 120) : undefined,
    persona: e?.persona ? String(e.persona).slice(0, 40) : "generic",
    meta: e?.meta && typeof e.meta === "object" && !Array.isArray(e.meta) ? e.meta : undefined,
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
  const rawEvents: any[] = Array.isArray(body.events) ? body.events : [body];
  const events = rawEvents.map(normalize).filter((e): e is InEvent => e !== null).slice(0, 200);
  if (events.length === 0) {
    return new Response(JSON.stringify({ error: "no valid events" }), { status: 400, headers: corsHeaders });
  }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // 1. Batch insert raw signals — deduped by event_id (ON CONFLICT DO NOTHING).
  const rows = events.map((e) => ({
    event_id: e.event_id ?? null,
    feed_item_id: e.feed_item_id || "_none",
    signal_kind: KIND_DB_MAP[e.signal_kind] ?? e.signal_kind,
    client_id,
    duration_ms: e.duration_ms ?? null,
    meta: { client_kind: e.signal_kind, ...(e.query ? { query: e.query } : {}), ...(e.meta ?? {}) },
  }));
  let inserted = 0;
  try {
    const { data, error } = await sb.from("user_signals")
      .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true })
      .select("id");
    if (error) console.error("user_signals upsert", error);
    else inserted = data?.length ?? 0;
  } catch (e) { console.error("user_signals batch", e); }
  const duplicates = events.length - inserted;

  // 2. Search capture (CAP 2 semantic interest).
  if (client_id) {
    const searches = events.filter((e) => e.signal_kind === "search" && e.query).map((e) => ({ client_id, query: e.query! }));
    if (searches.length) await sb.from("user_searches").insert(searches).then(() => {}, () => {});
  }

  // 3. Aggregate outcome + global Bayesian updates (CAP 3/5). Skip duplicates'
  // double-count is acceptable (idempotency is best-effort on aggregates).
  for (const e of events) {
    const field = OUTCOME_FIELD[e.signal_kind];
    if (field && e.feed_item_id) {
      sb.rpc("bump_outcome", { p_feed_item_id: e.feed_item_id, p_persona: e.persona, p_field: field, p_delta: 1 }).then(() => {}, () => {});
      const success = field === "clicks" ? 0.5 : field === "saves" || field === "shares" ? 1 : 0;
      const fail = field === "ignores" ? 0.5 : 0;
      if (success || fail) sb.rpc("bump_bayes", { p_key: e.feed_item_id, p_kind: "story", p_success: success, p_fail: fail }).then(() => {}, () => {});
    }
  }

  // 4. Telemetry (Part 6).
  sb.from("event_log").insert({
    level: "info", event: "signals_received", source: "record-signal",
    message: `${events.length} events, ${inserted} stored, ${duplicates} dup`,
    duration_ms: Date.now() - t0,
    context: { client_id, received: events.length, stored: inserted, duplicates },
  }).then(() => {}, () => {});

  return new Response(JSON.stringify({ ok: true, received: events.length, stored: inserted, duplicates }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
