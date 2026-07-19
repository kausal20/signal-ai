// ai-pulse — the AI industry intelligence center. Cached, refreshed every few
// hours. Additive: does NOT touch existing feed/functions/tables.
//
// GET (invoked from the client):
//   200 { ok: true, pulse, generated_at, cached }
//   200 { ok: false, code, error }   — graceful (client falls back to sample)
//
// Cache: single global row in `ai_pulse_cache` (id = 'global'), regenerated only
// when older than REFRESH_HOURS. Best-effort — works uncached if the table isn't
// migrated yet.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildPrompt, validatePulse, RESPONSE_SCHEMA } from "../_shared/ai_pulse.ts";
import { isConfigured, generateContent } from "../_shared/ai_provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const REFRESH_HOURS = 6;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // 1) Fresh cache?
  try {
    const { data } = await supabase
      .from("ai_pulse_cache")
      .select("pulse,generated_at")
      .eq("id", "global")
      .maybeSingle();
    if (data?.pulse && data.generated_at) {
      const ageH = (Date.now() - new Date(data.generated_at).getTime()) / 3_600_000;
      if (ageH < REFRESH_HOURS) {
        return json({ ok: true, cached: true, pulse: data.pulse, generated_at: data.generated_at });
      }
    }
  } catch (_) { /* table may not exist yet */ }

  // 2) No key → graceful (client shows Preview sample).
  if (!isConfigured()) {
    return json({ ok: false, code: "no_key", error: "AI Pulse is not configured yet." });
  }

  // 3) Generate via shared AI provider.
  const result = await generateContent({
    feature: "ai-pulse",
    contents: [{ role: "user", parts: [{ text: buildPrompt() }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.5,
      maxOutputTokens: 2048,
    },
  });

  if (!result.success) {
    return json({ ok: false, code: result.code, error: result.error, retry: result.retry });
  }

  let pulse;
  try {
    pulse = validatePulse(result.data);
  } catch (e) {
    return json({ ok: false, code: "generation_failed", error: e instanceof Error ? e.message : String(e) });
  }

  // 4) Cache (best-effort).
  const generated_at = new Date().toISOString();
  try {
    await supabase.from("ai_pulse_cache").upsert({ id: "global", pulse, generated_at }, { onConflict: "id" });
  } catch (_) { /* optional */ }

  return json({ ok: true, cached: false, pulse, generated_at });
});
