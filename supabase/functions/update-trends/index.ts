// Stage 10: trend memory updater. Walks recent raw_items, counts entity
// mentions, refreshes trend_entities + trend_observations + momentum scores.
// Cron: every hour at :20.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { detectEntities, computeMomentum } from "../_shared/trends.ts";
import { buildConceptEdges } from "../_shared/semantic.ts";
import { reasonTrends, persistTrendIntelligence, computeAcceleration } from "../_shared/trend_intel.ts";
import { CircuitBreaker } from "../_shared/reliability.ts";
import type { TrendEntity } from "../_shared/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const runStart = Date.now();

  const today = new Date();
  const since14 = new Date(Date.now() - 14 * 24 * 3600_000).toISOString();
  const since7 = new Date(Date.now() - 7 * 24 * 3600_000).toISOString();

  // Pull recent raw_items in 14d window — fields we need are small.
  const { data: rows, error } = await sb
    .from("raw_items")
    .select("id,raw_title,raw_text,source,published_at")
    .gte("published_at", since14)
    .is("rejection_reason", null)
    .limit(8000);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  type Bucket = {
    id: string; label: string; kind: string;
    mentions14: number; mentions7: number;
    sources: Set<string>;
    todayMentions: number; todaySources: Set<string>;
    lastSeen: string; headlines: string[];
  };
  const buckets = new Map<string, Bucket>();
  const todayStr = today.toISOString().slice(0, 10);

  for (const r of rows ?? []) {
    const text = `${r.raw_title ?? ""} ${r.raw_text ?? ""}`;
    const inWindow7 = new Date(r.published_at) >= new Date(since7);
    const isToday = String(r.published_at).slice(0, 10) === todayStr;
    for (const e of detectEntities(text)) {
      let b = buckets.get(e.id);
      if (!b) {
        b = { id: e.id, label: e.label, kind: e.kind, mentions14: 0, mentions7: 0, sources: new Set(), todayMentions: 0, todaySources: new Set(), lastSeen: r.published_at, headlines: [] };
        buckets.set(e.id, b);
      }
      b.mentions14++;
      if (inWindow7) b.mentions7++;
      b.sources.add(r.source);
      if (inWindow7 && b.headlines.length < 5 && r.raw_title) b.headlines.push(String(r.raw_title).slice(0, 140));
      if (isToday) {
        b.todayMentions++;
        b.todaySources.add(r.source);
      }
      if (new Date(r.published_at) > new Date(b.lastSeen)) b.lastSeen = r.published_at;
    }
  }

  // Upsert trend_entities + insert today's observations.
  const entityRows = [...buckets.values()].map((b) => {
    const { momentum, state } = computeMomentum(b.mentions7, b.mentions14);
    return {
      id: b.id,
      label: b.label,
      kind: b.kind,
      aliases: [],
      last_seen_at: b.lastSeen,
      total_mentions: b.mentions14,
      rolling_7d: b.mentions7,
      rolling_14d: b.mentions14,
      momentum,
      trend_state: state,
    };
  });
  if (entityRows.length > 0) {
    try { await sb.from("trend_entities").upsert(entityRows, { onConflict: "id" }); }
    catch (e) { console.error("trend_entities upsert", e); }
  }

  const observationRows = [...buckets.values()]
    .filter((b) => b.todayMentions > 0)
    .map((b) => ({
      entity_id: b.id,
      observed_on: todayStr,
      mentions: b.todayMentions,
      source_count: b.todaySources.size,
    }));
  if (observationRows.length > 0) {
    try { await sb.from("trend_observations").upsert(observationRows, { onConflict: "entity_id,observed_on" }); }
    catch (e) { console.error("trend_observations upsert", e); }
  }

  // CAP 2: refresh the concept relationship graph (cheap, deterministic).
  let edges = 0;
  try { edges = await buildConceptEdges(sb); } catch (e) { console.error("buildConceptEdges", e); }

  // CAP 4: reason across stories once per day (UTC 02:00) to keep AI cost ~1/day.
  // Other hourly runs only refresh momentum + edges (no LLM).
  let trendsReasoned = 0;
  const doReason = new Date().getUTCHours() === 2;
  if (doReason) {
    const breaker = new CircuitBreaker({ name: "ai_gateway", failureThreshold: 3, cooldownMs: 120_000 });
    await breaker.load(sb);
    // Top movers: rising/declining or large week-over-week acceleration.
    const inputs = [...buckets.values()]
      .map((b) => {
        const { momentum, state } = computeMomentum(b.mentions7, b.mentions14);
        const entity: TrendEntity = {
          id: b.id, label: b.label, kind: b.kind as TrendEntity["kind"], aliases: [],
          last_seen_at: b.lastSeen, total_mentions: b.mentions14,
          rolling_7d: b.mentions7, rolling_14d: b.mentions14, momentum, trend_state: state,
        };
        const accel = computeAcceleration(b.mentions7, Math.max(0, b.mentions14 - b.mentions7));
        return { entity, acceleration: accel, sampleHeadlines: b.headlines };
      })
      .filter((i) => i.entity.rolling_14d >= 3)
      .sort((a, b) => (b.entity.momentum + Math.abs(b.acceleration) * 20) - (a.entity.momentum + Math.abs(a.acceleration) * 20))
      .slice(0, 10);
    try {
      const { insights } = await reasonTrends(inputs, LOVABLE_API_KEY, breaker);
      await persistTrendIntelligence(sb, insights);
      trendsReasoned = insights.length;
    } catch (e) { console.error("reasonTrends", e); }
  }

  return new Response(JSON.stringify({
    ok: true,
    entities_tracked: entityRows.length,
    observations_recorded: observationRows.length,
    concept_edges: edges,
    trends_reasoned: trendsReasoned,
    rising: entityRows.filter((r) => r.trend_state === "rising").map((r) => ({ id: r.id, momentum: r.momentum })),
    ms: Date.now() - runStart,
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
