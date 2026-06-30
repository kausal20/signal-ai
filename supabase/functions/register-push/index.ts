import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = new URL(req.url);

  // GET → public VAPID key
  if (req.method === "GET") {
    return new Response(
      JSON.stringify({ publicKey: Deno.env.get("VAPID_PUBLIC_KEY") ?? "" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const body = await req.json();
    const action = body.action ?? "subscribe";

    if (action === "subscribe") {
      const { subscription, userAgent } = body;
      if (!subscription?.endpoint || !subscription?.keys?.p256dh || !subscription?.keys?.auth) {
        return json({ error: "invalid subscription" }, 400);
      }
      const { error } = await supabase.from("push_subscriptions").upsert({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_agent: userAgent ?? null,
        last_seen: new Date().toISOString(),
      }, { onConflict: "endpoint" });
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "update") {
      const { endpoint, prefs } = body;
      if (!endpoint) return json({ error: "missing endpoint" }, 400);
      const patch: Record<string, unknown> = { last_seen: new Date().toISOString() };
      if (typeof prefs?.enabled === "boolean") patch.enabled = prefs.enabled;
      if (typeof prefs?.quietMode === "boolean") patch.quiet_mode = prefs.quietMode;
      if (typeof prefs?.importanceLevel === "string"
        && ["minimal", "balanced", "aggressive"].includes(prefs.importanceLevel)) {
        patch.importance_level = prefs.importanceLevel;
      }
      const { error } = await supabase.from("push_subscriptions").update(patch).eq("endpoint", endpoint);
      if (error) return json({ error: error.message }, 500);
      return json({ ok: true });
    }

    if (action === "unsubscribe") {
      const { endpoint } = body;
      if (!endpoint) return json({ error: "missing endpoint" }, 400);
      await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
      return json({ ok: true });
    }

    if (action === "get") {
      const { endpoint } = body;
      if (!endpoint) return json({ error: "missing endpoint" }, 400);
      const { data } = await supabase.from("push_subscriptions")
        .select("enabled, quiet_mode, importance_level")
        .eq("endpoint", endpoint).maybeSingle();
      const prefs = data ? {
        enabled: data.enabled,
        quietMode: data.quiet_mode,
        importanceLevel: data.importance_level,
      } : null;
      return json({ prefs });
    }

    return json({ error: "unknown action" }, 400);
  } catch (e) {
    return json({ error: String(e) }, 500);
  }

  function json(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
