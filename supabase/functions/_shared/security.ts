// Shared origin/rate-limit guard for public write endpoints (record-signal,
// record-outcome, save-onboarding-profile, personalize).
//
// What this does and doesn't do:
// - Origin check blocks a browser page on another domain from reading the
//   response, and rejects requests with no/unrecognized Origin. It does NOT
//   stop a script (curl, bots) that simply sets its own Origin header — CORS
//   is enforced by browsers, not by the caller. Keep this as one layer, not
//   the whole defense.
// - Rate limiting is backed by Postgres (see migration
//   20260901120000_rate_limit_edge_functions.sql), not in-memory. Deno Deploy
//   runs many concurrent isolates with no shared memory, so an in-memory Map
//   would only ever see a slice of real traffic.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const ALLOWED_ORIGINS = new Set([
  "https://signal-project-export.vercel.app",
  "http://localhost:5000",
]);

export function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

export function verifyOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  return !!origin && ALLOWED_ORIGINS.has(origin);
}

export function getClientIP(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

// Fails OPEN on DB error — a rate-limiter outage should not take down the
// endpoint it's guarding.
export async function checkRateLimit(
  sb: SupabaseClient, fnName: string, req: Request, limit: number, windowSeconds: number,
): Promise<boolean> {
  const key = `${fnName}:${getClientIP(req)}`;
  try {
    const { data, error } = await sb.rpc("check_rate_limit", { p_key: key, p_limit: limit, p_window_seconds: windowSeconds });
    if (error) { console.error("check_rate_limit", error); return true; }
    return data !== false;
  } catch (e) { console.error("check_rate_limit", e); return true; }
}
