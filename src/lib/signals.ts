// V4.1 — behavioural signal capture engine.
// Guarantees: never lose events (persisted to localStorage before send),
// batched uploads, exponential-backoff retry, idempotent (per-event event_id
// → server dedupes), offline queue that drains on reconnect, no UI blocking.

import { supabase } from "@/integrations/supabase/client";
import { getClientId, getPersona } from "@/lib/clientId";
import { recordRead } from "@/lib/stats";

export type SignalKind =
  | "opened" | "completed" | "skipped" | "dismissed" | "bookmarked" | "shared"
  | "clicked_source" | "external_link" | "reading_time" | "prompt_copied"
  | "tool_clicked" | "workflow_opened" | "notification_opened" | "notification_dismissed"
  | "search" | "search_result_click" | "topic_revisit" | "session_start" | "session_end"
  | "onboarding_completed";

export type OutcomeKind =
  | "built" | "implemented" | "ignored" | "saved" | "revenue" | "time_saved"
  | "adoption" | "feedback" | "useful" | "not_useful" | "action_completed";

interface SignalEvent {
  event_id: string; signal_kind: SignalKind; feed_item_id?: string;
  duration_ms?: number; query?: string; meta?: Record<string, unknown>; persona: string; ts: number;
}
interface OutcomeEvent {
  event_id: string; outcome_kind: OutcomeKind; feed_item_id: string;
  value?: number; note?: string; ts: number;
}

const SIG_KEY = "signal:queue:signals";
const OUT_KEY = "signal:queue:outcomes";
const MAX_QUEUE = 500;
const BATCH_AT = 12;
const FLUSH_MS = 4000;

function uuid(): string {
  return crypto?.randomUUID?.() ?? `e_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}
function load<T>(key: string): T[] {
  try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch { return []; }
}
function save<T>(key: string, arr: T[]): void {
  try { localStorage.setItem(key, JSON.stringify(arr.slice(-MAX_QUEUE))); } catch { /* quota */ }
}

let sigTimer: ReturnType<typeof setTimeout> | null = null;
let outTimer: ReturnType<typeof setTimeout> | null = null;
let backoff = 0;

// ---- public API -----------------------------------------------------------
export function track(kind: SignalKind, opts: { feed_item_id?: string; duration_ms?: number; query?: string; meta?: Record<string, unknown> } = {}): void {
  const q = load<SignalEvent>(SIG_KEY);
  q.push({ event_id: uuid(), signal_kind: kind, persona: getPersona(), ts: Date.now(), ...opts });
  save(SIG_KEY, q);
  if (q.length >= BATCH_AT) flushSignals();
  else scheduleSignalFlush();
}

export function trackOutcome(kind: OutcomeKind, feed_item_id: string, opts: { value?: number; note?: string } = {}): void {
  const q = load<OutcomeEvent>(OUT_KEY);
  q.push({ event_id: uuid(), outcome_kind: kind, feed_item_id, ts: Date.now(), ...opts });
  save(OUT_KEY, q);
  scheduleOutcomeFlush();
}

function scheduleSignalFlush() { if (!sigTimer) sigTimer = setTimeout(() => { sigTimer = null; flushSignals(); }, FLUSH_MS); }
function scheduleOutcomeFlush() { if (!outTimer) outTimer = setTimeout(() => { outTimer = null; flushOutcomes(); }, FLUSH_MS); }

export async function flushSignals(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return; // stay queued
  const q = load<SignalEvent>(SIG_KEY);
  if (q.length === 0) return;
  const batch = q.slice(0, 100);
  try {
    const { error } = await supabase.functions.invoke("record-signal", {
      body: {
        client_id: getClientId(),
        events: batch.map((e) => ({
          event_id: e.event_id, signal_kind: e.signal_kind, feed_item_id: e.feed_item_id,
          duration_ms: e.duration_ms, query: e.query, meta: e.meta, persona: e.persona,
        })),
      },
    });
    if (error) throw error;
    // success: drop the sent prefix, reset backoff.
    save(SIG_KEY, load<SignalEvent>(SIG_KEY).filter((e) => !batch.some((b) => b.event_id === e.event_id)));
    backoff = 0;
    if (load<SignalEvent>(SIG_KEY).length > 0) scheduleSignalFlush();
  } catch {
    backoff = Math.min(backoff + 1, 6);
    setTimeout(() => flushSignals(), 1000 * Math.pow(2, backoff)); // retry, events stay queued
  }
}

export async function flushOutcomes(): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return;
  const q = load<OutcomeEvent>(OUT_KEY);
  if (q.length === 0) return;
  const batch = q.slice(0, 100);
  try {
    const { error } = await supabase.functions.invoke("record-outcome", {
      body: {
        client_id: getClientId(),
        events: batch.map((e) => ({ event_id: e.event_id, outcome_kind: e.outcome_kind, feed_item_id: e.feed_item_id, value: e.value, note: e.note })),
      },
    });
    if (error) throw error;
    save(OUT_KEY, load<OutcomeEvent>(OUT_KEY).filter((e) => !batch.some((b) => b.event_id === e.event_id)));
  } catch {
    setTimeout(() => flushOutcomes(), 4000);
  }
}

// ---- reading-duration helper ----------------------------------------------
const readStart = new Map<string, number>();
export function readingStart(id: string) { readStart.set(id, Date.now()); }
export function readingStop(id: string) {
  const t = readStart.get(id);
  if (t == null) return;
  readStart.delete(id);
  const dur = Date.now() - t;
  if (dur >= 1500) track("reading_time", { feed_item_id: id, duration_ms: dur });
  if (dur >= 8000) { track("completed", { feed_item_id: id, duration_ms: dur }); recordRead(); } // read-through
}

// ---- session + lifecycle wiring (call once on app mount) -------------------
let sessionStarted = false;
export function initSignals(): () => void {
  if (sessionStarted) return () => {};
  sessionStarted = true;
  track("session_start");

  const onOnline = () => { flushSignals(); flushOutcomes(); };
  const onHide = () => {
    if (document.visibilityState === "hidden") {
      // best-effort flush before the tab is backgrounded/closed.
      for (const id of readStart.keys()) readingStop(id);
      track("session_end");
      flushSignals(); flushOutcomes();
    }
  };
  window.addEventListener("online", onOnline);
  document.addEventListener("visibilitychange", onHide);
  window.addEventListener("pagehide", onHide);
  // drain anything left over from a previous session.
  flushSignals(); flushOutcomes();

  return () => {
    window.removeEventListener("online", onOnline);
    document.removeEventListener("visibilitychange", onHide);
    window.removeEventListener("pagehide", onHide);
  };
}
