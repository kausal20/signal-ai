import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";
import { acquireLock, releaseLock } from "../_shared/reliability.ts";
import { Logger } from "../_shared/logger.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT") ?? "mailto:signal@app",
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

type ImportanceLevel = "minimal" | "balanced" | "aggressive";

type Sub = {
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled: boolean;
  quiet_mode: boolean;
  importance_level: ImportanceLevel;
};

type Item = {
  id: string;
  title: string;
  summary: string;
  why_it_matters: string | null;
  url: string;
  tag: string;
  score: number;
  usefulness: number | null;
  published_at: string;
  impact: "critical" | "major" | "useful" | string;
  content_category: string | null;
  novelty_score: number | null;
  business_impact_score: number | null;
  builder_value_score: number | null;
  adoption_potential_score: number | null;
  market_impact_score: number | null;
  confidence_score: number | null;
};

const LEVEL_CFG: Record<ImportanceLevel, { minScore: number; cap: number }> = {
  minimal: { minScore: 92, cap: 1 },
  balanced: { minScore: 88, cap: 2 },
  aggressive: { minScore: 85, cap: 3 },
};

const MAX_NOTIFICATIONS_PER_DAY = 3;

const INTERRUPTIBLE_CATEGORIES = new Set([
  "Must Know",
  "Workflow of the Day",
  "Founder Opportunity",
  "Market Shift",
  "Research Breakthrough",
]);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Phase 8: only one delivery pass at a time so two triggers (inline + cron)
  // can't double-send.
  const holder = crypto.randomUUID();
  const gotLock = await acquireLock(supabase, "send-notifications", 110, holder);
  if (!gotLock) {
    return new Response(JSON.stringify({ ok: true, skipped: "locked" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const logger = new Logger(supabase);

  try {
    const sinceIso = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data: itemsRaw, error: itemsErr } = await supabase
      .from("feed_items")
      .select("id,title,summary,why_it_matters,url,tag,score,usefulness,published_at,impact,content_category,novelty_score,business_impact_score,builder_value_score,adoption_potential_score,market_impact_score,confidence_score")
      .gte("published_at", sinceIso)
      .gte("score", 85)
      .gte("confidence_score", 68)
      .order("score", { ascending: false })
      .limit(12);
    if (itemsErr) throw itemsErr;

    const items = ((itemsRaw ?? []) as Item[]).filter(isInterruptWorthy);

    const { data: subs } = await supabase.from("push_subscriptions")
      .select("endpoint,p256dh,auth,enabled,quiet_mode,importance_level")
      .eq("enabled", true)
      .eq("quiet_mode", false);
    const subscriptions = (subs ?? []) as Sub[];

    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);

    let sent = 0;
    let pruned = 0;

    for (const sub of subscriptions) {
      const cfg = LEVEL_CFG[sub.importance_level] ?? LEVEL_CFG.balanced;

      const { count: todayCount } = await supabase.from("notification_log")
        .select("id", { count: "exact", head: true })
        .eq("subscription_endpoint", sub.endpoint)
        .gte("sent_at", dayStart.toISOString());
      const remaining = Math.max(0, Math.min(cfg.cap, MAX_NOTIFICATIONS_PER_DAY) - (todayCount ?? 0));
      if (remaining <= 0) continue;

      const { data: already } = await supabase.from("notification_log")
        .select("feed_item_id,status,sent_at")
        .eq("subscription_endpoint", sub.endpoint)
        .limit(500);
      const alreadyIds = new Set((already ?? []).map((r: any) => r.feed_item_id));

      const toSend = items
        .filter((i) => !alreadyIds.has(i.id))
        .filter((i) => i.score >= cfg.minScore)
        .slice(0, remaining);

      for (const it of toSend) {
        const payload = JSON.stringify({
          title: `Signal Alert - ${shortTitle(it)}`,
          body: shortBody(it),
          url: it.url,
          tag: `signal-${it.id}`,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
        });

        const result = await deliverWithRetry(sub, payload);
        if (result.ok) {
          await supabase.from("notification_log").insert({
            subscription_endpoint: sub.endpoint,
            feed_item_id: it.id,
            status: `alert:${it.content_category ?? "signal"}`,
            attempts: result.attempts,
            delivered_at: new Date().toISOString(),
          });
          logger.info("notification_sent", { source: "push", message: it.id, meta: { attempts: result.attempts } });
          sent++;
        } else if (result.dead) {
          // 404/410 => subscription is gone; stop sending to it.
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
          logger.warn("subscription_pruned", { source: "push", message: sub.endpoint.slice(0, 40) });
          pruned++;
          break;
        } else {
          await supabase.from("notification_log").insert({
            subscription_endpoint: sub.endpoint,
            feed_item_id: it.id,
            status: `error:${result.status ?? "x"}`,
            attempts: result.attempts,
          }).then(() => {}, () => {});
          logger.error("notification_failed", { source: "push", message: it.id, retryCount: result.attempts, meta: { status: result.status } });
        }
      }
    }

    logger.info("notifications_completed", { meta: { sent, pruned, subscribers: subscriptions.length, candidates: items.length } });
    await logger.flush();
    return new Response(
      JSON.stringify({ ok: true, sent, pruned, subscribers: subscriptions.length, candidates: items.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    logger.error("notifications_crashed", { message: e instanceof Error ? e.message : String(e), stack: e instanceof Error ? e.stack : undefined });
    await logger.flush();
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } finally {
    await releaseLock(supabase, "send-notifications");
  }
});

async function deliverWithRetry(
  sub: Sub,
  payload: string,
): Promise<{ ok: boolean; dead: boolean; status?: number; attempts: number }> {
  const maxAttempts = 3;
  let lastStatus: number | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
        { TTL: 60 * 60 * 24 },
      );
      return { ok: true, dead: false, attempts: attempt };
    } catch (err) {
      const status = (err as { statusCode?: number })?.statusCode;
      lastStatus = status;
      if (status === 404 || status === 410) return { ok: false, dead: true, status, attempts: attempt };
      // Retry only transient failures (429 / 5xx); give up on other 4xx.
      const transient = status === 429 || (typeof status === "number" && status >= 500) || status === undefined;
      if (!transient || attempt === maxAttempts) {
        return { ok: false, dead: false, status, attempts: attempt };
      }
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }
  return { ok: false, dead: false, status: lastStatus, attempts: maxAttempts };
}

function isInterruptWorthy(item: Item): boolean {
  if (!item.title || item.title.length < 12) return false;
  if (item.impact !== "critical" && item.impact !== "major") return false;
  if (!INTERRUPTIBLE_CATEGORIES.has(item.content_category ?? "")) return false;
  if ((item.confidence_score ?? 0) < 68) return false;

  const modelOrBreakthrough =
    (item.content_category === "Must Know" || item.content_category === "Research Breakthrough") &&
    ((item.market_impact_score ?? 0) >= 82 || (item.novelty_score ?? 0) >= 84);
  const founderOpportunity =
    item.content_category === "Founder Opportunity" &&
    (item.business_impact_score ?? 0) >= 84;
  const workflowShift =
    item.content_category === "Workflow of the Day" &&
    (item.builder_value_score ?? 0) >= 84;
  const marketShift =
    item.content_category === "Market Shift" &&
    ((item.market_impact_score ?? 0) >= 84 || (item.adoption_potential_score ?? 0) >= 84);

  return modelOrBreakthrough || founderOpportunity || workflowShift || marketShift;
}

function shortTitle(it: Item): string {
  const t = it.title.trim();
  return t.length > 76 ? t.slice(0, 73).replace(/[,.!?;:]?$/, "") + "..." : t;
}

function shortBody(it: Item): string {
  const source = (it.why_it_matters || it.summary || "").replace(/^Opportunity:\s*/i, "").trim();
  const first = source.split(/(?<=[.!?])\s/)[0] || source;
  return first.length > 136 ? first.slice(0, 133).replace(/[,.!?;:]?$/, "") + "..." : first;
}
