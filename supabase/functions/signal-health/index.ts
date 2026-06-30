// Signal validation + monitoring endpoint. Runs the 10-point checklist
// against the live database and returns pass/fail per check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type Status = "pass" | "warn" | "fail" | "skip";
interface Check {
  id: number;
  name: string;
  status: Status;
  detail: string;
  data?: unknown;
}

const ALLOWED_CATEGORIES = [
  "Must Know",
  "Tool of the Day",
  "Workflow of the Day",
  "Founder Opportunity",
  "Underrated Tool",
  "Market Shift",
  "Research Breakthrough",
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const checks: Check[] = [];

  // 1. Stories stored: at least one row in feed_items.
  {
    const { count } = await sb.from("feed_items").select("id", { count: "exact", head: true });
    checks.push({
      id: 1,
      name: "Stories stored",
      status: (count ?? 0) > 0 ? "pass" : "fail",
      detail: `feed_items rows: ${count ?? 0}`,
      data: { count: count ?? 0 },
    });
  }

  // 2. New stories: items fetched within 24h.
  {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count } = await sb.from("feed_items")
      .select("id", { count: "exact", head: true })
      .gte("fetched_at", since);
    checks.push({
      id: 2,
      name: "New stories in last 24h",
      status: (count ?? 0) > 0 ? "pass" : "fail",
      detail: `${count ?? 0} items fetched in last 24h`,
      data: { count: count ?? 0 },
    });
  }

  // 3. Clustering: at least one multi-source cluster in last 24h is the ideal,
  //    but at minimum the table is populated.
  {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: total } = await sb.from("story_clusters")
      .select("id,source_count,last_seen_at")
      .gte("last_seen_at", since)
      .limit(500);
    const multi = (total ?? []).filter((r: any) => (r.source_count ?? 1) >= 2).length;
    const t = total?.length ?? 0;
    const status: Status = t === 0 ? "fail" : multi === 0 ? "warn" : "pass";
    checks.push({
      id: 3,
      name: "Story clustering active",
      status,
      detail: `${t} recent clusters, ${multi} with 2+ sources`,
      data: { recent_clusters: t, multi_source: multi },
    });
  }

  // 4. Source health: tracked rows exist, no unexpected blanket-disable.
  {
    const { data: health } = await sb.from("source_health").select("source,disabled,consecutive_failures");
    const tracked = health?.length ?? 0;
    const disabled = (health ?? []).filter((r: any) => r.disabled).length;
    const status: Status =
      tracked === 0 ? "fail" :
      disabled > tracked / 2 ? "warn" :
      "pass";
    checks.push({
      id: 4,
      name: "Source health monitoring",
      status,
      detail: `${tracked} sources tracked, ${disabled} auto-disabled`,
      data: { tracked, disabled, sources: health },
    });
  }

  // 5. Fallback editor: ever exercised, or AI healthy enough that it wasn't needed.
  {
    const { data: recent } = await sb.from("pipeline_metrics")
      .select("curation_mode,ran_at,ai_gateway_ok")
      .order("ran_at", { ascending: false })
      .limit(50);
    const aiRuns = (recent ?? []).filter((r: any) => r.curation_mode === "ai").length;
    const fallbackRuns = (recent ?? []).filter((r: any) => r.curation_mode === "fallback").length;
    const lastRun = recent?.[0];
    // Pass if AI works; pass if fallback ever fired & stored stories; warn if no runs yet.
    let status: Status = "warn";
    let detail = "no pipeline runs recorded yet";
    if (recent && recent.length > 0) {
      if (aiRuns > 0) {
        status = "pass";
        detail = `AI editor healthy on ${aiRuns}/${recent.length} recent runs (fallback fired ${fallbackRuns}x)`;
      } else if (fallbackRuns > 0) {
        status = "warn";
        detail = `AI editor failing — fallback covering ${fallbackRuns}/${recent.length} runs`;
      } else {
        status = "fail";
        detail = `no curated runs in last ${recent.length} attempts`;
      }
    }
    checks.push({ id: 5, name: "Fallback editor resilience", status, detail, data: { aiRuns, fallbackRuns, lastRun } });
  }

  // 6. Notifications queued: candidate stories meeting interrupt threshold.
  {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: subs } = await sb.from("push_subscriptions")
      .select("endpoint", { count: "exact", head: true })
      .eq("enabled", true);
    const { count: candidates } = await sb.from("feed_items")
      .select("id", { count: "exact", head: true })
      .gte("published_at", since)
      .gte("score", 85)
      .gte("confidence_score", 68);
    const status: Status = (subs ?? 0) === 0 ? "skip" : (candidates ?? 0) > 0 ? "pass" : "warn";
    checks.push({
      id: 6,
      name: "Notifications queued",
      status,
      detail: `${candidates ?? 0} interrupt-worthy candidates / ${subs ?? 0} active subscribers`,
      data: { candidates: candidates ?? 0, subscribers: subs ?? 0 },
    });
  }

  // 7. Notification delivery: alerts logged with success status in last 24h.
  {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: log } = await sb.from("notification_log")
      .select("status,attempts,delivered_at")
      .gte("sent_at", since)
      .limit(500);
    const total = log?.length ?? 0;
    const delivered = (log ?? []).filter((r: any) => String(r.status ?? "").startsWith("alert:")).length;
    const errors = (log ?? []).filter((r: any) => String(r.status ?? "").startsWith("error:")).length;
    const { count: subs } = await sb.from("push_subscriptions")
      .select("endpoint", { count: "exact", head: true })
      .eq("enabled", true);
    let status: Status = "skip";
    let detail = "no active subscribers";
    if ((subs ?? 0) > 0) {
      if (total === 0) { status = "warn"; detail = "no notification activity in 24h"; }
      else if (delivered > 0 && errors === 0) { status = "pass"; detail = `${delivered} delivered, 0 errors`; }
      else if (delivered > 0) { status = "warn"; detail = `${delivered} delivered, ${errors} errors`; }
      else { status = "fail"; detail = `${errors} errors, 0 delivered`; }
    }
    checks.push({ id: 7, name: "Notification delivery", status, detail, data: { delivered, errors, total } });
  }

  // 8. Feed freshness: newest item under 6 hours old.
  {
    const { data: newest } = await sb.from("feed_items")
      .select("fetched_at,published_at")
      .order("fetched_at", { ascending: false })
      .limit(1);
    const last = newest?.[0];
    if (!last) {
      checks.push({ id: 8, name: "Feed freshness <6h", status: "fail", detail: "no feed_items" });
    } else {
      const ageH = (Date.now() - new Date(last.fetched_at).getTime()) / 3600_000;
      const status: Status = ageH <= 6 ? "pass" : ageH <= 12 ? "warn" : "fail";
      checks.push({
        id: 8,
        name: "Feed freshness <6h",
        status,
        detail: `last fetch ${ageH.toFixed(1)}h ago`,
        data: { age_hours: Number(ageH.toFixed(2)), last_fetched_at: last.fetched_at },
      });
    }
  }

  // 9. Category distribution: only allowed categories, no single one dominates.
  {
    const { data: rows } = await sb.from("feed_items")
      .select("content_category")
      .order("fetched_at", { ascending: false })
      .limit(50);
    const counts: Record<string, number> = {};
    for (const r of rows ?? []) {
      const c = r.content_category ?? "(none)";
      counts[c] = (counts[c] ?? 0) + 1;
    }
    const unknown = Object.keys(counts).filter((k) => !ALLOWED_CATEGORIES.includes(k));
    const totalRows = rows?.length ?? 0;
    const mustKnowShare = totalRows ? (counts["Must Know"] ?? 0) / totalRows : 0;
    let status: Status = "pass";
    let detail = `${totalRows} sampled across ${Object.keys(counts).length} categories`;
    if (totalRows === 0) { status = "fail"; detail = "no feed_items to sample"; }
    else if (unknown.length > 0) { status = "fail"; detail = `unknown categories: ${unknown.join(", ")}`; }
    else if (mustKnowShare > 0.6) { status = "warn"; detail = `Must Know dominates: ${(mustKnowShare * 100).toFixed(0)}%`; }
    checks.push({ id: 9, name: "Category distribution", status, detail, data: counts });
  }

  // 10. Daily feed = only top-ranked items: cap 10/day, min score 76, min confidence 58.
  {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { data: today } = await sb.from("feed_items")
      .select("id,score,confidence_score,fetched_at")
      .gte("fetched_at", since)
      .order("fetched_at", { ascending: false })
      .limit(50);
    const total = today?.length ?? 0;
    const lowScore = (today ?? []).filter((r: any) => (r.score ?? 0) < 76).length;
    const lowConf = (today ?? []).filter((r: any) => (r.confidence_score ?? 0) < 58).length;
    let status: Status = "pass";
    let detail = `${total} items today; min score 76, min conf 58 enforced`;
    if (total === 0) { status = "fail"; detail = "no items stored today"; }
    else if (total > 12) { status = "warn"; detail = `${total} items today exceeds cap of 12`; }
    else if (lowScore > 0 || lowConf > 0) { status = "warn"; detail = `${lowScore} below-score, ${lowConf} below-confidence`; }
    checks.push({ id: 10, name: "Top-ranked-only daily feed", status, detail, data: { total, lowScore, lowConf } });
  }

  // 11. Trend memory active.
  {
    const { data: trends } = await sb.from("trend_entities").select("id,trend_state,momentum,rolling_7d").order("momentum", { ascending: false }).limit(20);
    const tracked = trends?.length ?? 0;
    const rising = (trends ?? []).filter((r: any) => r.trend_state === "rising").length;
    const status: Status = tracked === 0 ? "warn" : "pass";
    checks.push({
      id: 11,
      name: "Trend memory",
      status,
      detail: `${tracked} entities tracked, ${rising} rising`,
      data: { top: (trends ?? []).slice(0, 5) },
    });
  }

  // 12. Learning signals captured.
  {
    const since = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();
    const { count: opens } = await sb.from("user_signals").select("id", { count: "exact", head: true }).gte("occurred_at", since).eq("signal_kind", "opened");
    const { count: marks } = await sb.from("user_signals").select("id", { count: "exact", head: true }).gte("occurred_at", since).eq("signal_kind", "bookmarked");
    const status: Status = (opens ?? 0) + (marks ?? 0) === 0 ? "skip" : "pass";
    checks.push({
      id: 12,
      name: "User learning signals",
      status,
      detail: `${opens ?? 0} opens / ${marks ?? 0} bookmarks in last 7 days`,
      data: { opens: opens ?? 0, bookmarks: marks ?? 0 },
    });
  }

  // 13. Per-stage timings from last pipeline run.
  {
    const { data: last } = await sb.from("pipeline_metrics").select("ran_at,stage_timings,acceptance_rate,rewrite_success_rate,curation_mode,tier").order("ran_at", { ascending: false }).limit(1);
    const lastRun = last?.[0];
    const status: Status = lastRun ? "pass" : "warn";
    checks.push({
      id: 13,
      name: "Pipeline stage telemetry",
      status,
      detail: lastRun ? `mode=${lastRun.curation_mode} tier=${lastRun.tier ?? '-'} acceptance=${(Number(lastRun.acceptance_rate) * 100).toFixed(0)}%` : "no runs",
      data: lastRun,
    });
  }

  // 14. Last pipeline run status (Phase 3 + 12).
  {
    const { data: last } = await sb.from("pipeline_runs").select("status,started_at,duration_ms,stories_published,error_count,fallback_used").order("started_at", { ascending: false }).limit(1);
    const run = last?.[0];
    let status: Status = "warn";
    let detail = "no pipeline_runs recorded";
    if (run) {
      const ageH = (Date.now() - new Date(run.started_at).getTime()) / 3600_000;
      if (run.status === "failed") { status = "fail"; detail = `last run failed (${run.error_count} errors)`; }
      else if (ageH > 2) { status = "warn"; detail = `last run ${ageH.toFixed(1)}h ago — scheduler may be stalled`; }
      else { status = run.status === "partial" ? "warn" : "pass"; detail = `last run ${run.status}, ${run.stories_published} published${run.fallback_used ? " (fallback)" : ""}`; }
    }
    checks.push({ id: 14, name: "Pipeline run health", status, detail, data: run });
  }

  // 15. Error rate in the structured event log (Phase 4 + 9).
  {
    const since = new Date(Date.now() - 6 * 3600_000).toISOString();
    const { count: errs } = await sb.from("event_log").select("id", { count: "exact", head: true }).gte("occurred_at", since).eq("level", "error");
    const status: Status = (errs ?? 0) === 0 ? "pass" : (errs ?? 0) < 20 ? "warn" : "fail";
    checks.push({ id: 15, name: "Error log rate (6h)", status, detail: `${errs ?? 0} error events in last 6h`, data: { errors: errs ?? 0 } });
  }

  // 16. Self-healing: sources auto-disabled + circuit breakers + stuck locks.
  {
    const { data: health } = await sb.from("source_health").select("source,disabled,disabled_until,circuit_state").eq("disabled", true);
    const { data: breakers } = await sb.from("circuit_breakers").select("name,state").neq("state", "closed");
    const { data: locks } = await sb.from("job_locks").select("job_name,expires_at");
    const nowIso = new Date().toISOString();
    const stuckLocks = (locks ?? []).filter((l: any) => l.expires_at < nowIso);
    const openBreakers = (breakers ?? []).length;
    const status: Status = openBreakers > 2 ? "warn" : "pass";
    checks.push({
      id: 16,
      name: "Self-healing state",
      status,
      detail: `${(health ?? []).length} sources disabled, ${openBreakers} breakers open, ${stuckLocks.length} stale locks`,
      data: { disabled: health, breakers, stuckLocks },
    });
  }

  // 17. Learning loop connected (V4.1): signals/outcomes flowing + profiles evolving.
  {
    const since = new Date(Date.now() - 24 * 3600_000).toISOString();
    const { count: sig } = await sb.from("user_signals").select("id", { count: "exact", head: true }).gte("occurred_at", since);
    const { count: prof } = await sb.from("user_profiles").select("client_id", { count: "exact", head: true });
    const { count: outc } = await sb.from("outcome_events").select("id", { count: "exact", head: true }).gte("created_at", since);
    const { data: recv } = await sb.from("event_log").select("id").eq("event", "signals_received").gte("occurred_at", since).limit(1);
    const flowing = (sig ?? 0) > 0 || (recv ?? []).length > 0;
    const status: Status = flowing ? "pass" : "skip";
    checks.push({
      id: 17,
      name: "Learning loop connected",
      status,
      detail: flowing
        ? `${sig ?? 0} signals/24h, ${outc ?? 0} outcomes/24h, ${prof ?? 0} profiles`
        : "no behavioural signals yet (frontend must call record-signal)",
      data: { signals_24h: sig ?? 0, outcomes_24h: outc ?? 0, profiles: prof ?? 0 },
    });
  }

  const summary = {
    pass: checks.filter((c) => c.status === "pass").length,
    warn: checks.filter((c) => c.status === "warn").length,
    fail: checks.filter((c) => c.status === "fail").length,
    skip: checks.filter((c) => c.status === "skip").length,
  };
  const ok = summary.fail === 0;

  return new Response(
    JSON.stringify({ ok, summary, checks, generated_at: new Date().toISOString() }, null, 2),
    {
      status: ok ? 200 : 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    },
  );
});
