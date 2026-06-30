// Signal Intelligence Engine V3 endpoint.
// POST { client_id?, persona?, skill_level?, searches?, limit? }
//   -> personalized decision cards + evolving profile + Daily AI Advisor.
//
// Cost: ZERO LLM calls here. Story reasoning (story_intelligence) and trend
// reasoning (trend_intelligence) were computed once upstream and reused. This
// endpoint only: evolves user memory (CAP 1/2/3), propagates semantic interest
// (CAP 2), applies outcome learning (CAP 5), and personalizes the final stage.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  loadProfile, learnAndPersist, personalizeCard, buildAdvisor,
  signalRowAxes, type LearnedProfile, type NewSignal,
} from "../_shared/learning.ts";
import { fallbackStoryIntel, type StoryIntelligence } from "../_shared/intelligence_v2.ts";
import { loadConceptGraph, propagateAffinity, normConcept } from "../_shared/semantic.ts";
import { loadStoryVectors, loadUserEmbedding, updateUserEmbedding, vectorRelevance } from "../_shared/vector_store.ts";
import { loadClusterProfiles, loadUserCluster, assignCluster, collaborativeRelevance } from "../_shared/collaborative.ts";
import { loadGlobalInfluence, globalMultiplier } from "../_shared/global_graph.ts";
import { applyStrategist } from "../_shared/strategist.ts";
import type { StoredStory } from "../_shared/intelligence_engine.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const VALID_PERSONAS = new Set(["developer", "founder", "agency", "student", "researcher", "marketer", "investor", "builder", "operator", "generic"]);

const STORY_COLS =
  "id,title,summary,what_happened,why_it_matters,who_for,opportunity,action,risk,who_benefits,expected_impact,time_horizon,content_category,category,tag,url,impact,source_label,source_count,published_at,ranking_reason,trend_entities,score,novelty_score,business_impact_score,builder_value_score,adoption_potential_score,market_impact_score,confidence_score,opportunity_score,corroboration_score,leverage_score,trend_score,momentum_score";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: any = {};
  if (req.method === "POST") { try { body = await req.json(); } catch { body = {}; } }

  const clientId = body.client_id ? String(body.client_id).slice(0, 80) : null;
  const declaredPersona = VALID_PERSONAS.has(body.persona) ? String(body.persona) : undefined;
  const searches: string[] = Array.isArray(body.searches)
    ? body.searches.map((s: any) => String(s).slice(0, 120)).slice(0, 10) : [];
  const limit = Math.max(1, Math.min(20, Number(body.limit) || 12));

  // 1. Published feed.
  const { data: rows, error } = await sb
    .from("feed_items").select(STORY_COLS)
    .order("score", { ascending: false }).limit(limit);
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const stories = (rows ?? []) as StoredStory[];
  const storyIds = stories.map((s) => s.id);

  // 2. Cached reusable intelligence (per story + per trend). No LLM here.
  const intelById = new Map<string, { intel: StoryIntelligence; degraded: boolean }>();
  const trendById = new Map<string, any>();
  if (stories.length > 0) {
    const entityIds = [...new Set(stories.flatMap((s) => s.trend_entities ?? []))];
    const [{ data: intelRows }, { data: trendRows }] = await Promise.all([
      sb.from("story_intelligence").select("feed_item_id,intelligence,degraded").in("feed_item_id", storyIds),
      entityIds.length > 0
        ? sb.from("trend_intelligence").select("entity_id,label,summary,why_it_matters,prediction,direction,confidence").in("entity_id", entityIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    for (const r of intelRows ?? []) intelById.set(r.feed_item_id, { intel: r.intelligence as StoryIntelligence, degraded: !!r.degraded });
    for (const t of trendRows ?? []) trendById.set(t.entity_id, t);
  }

  // 3. Learning Engine: evolve persistent memory from NEW signals + searches.
  let profile: LearnedProfile | null = null;
  if (clientId) {
    profile = await loadProfile(sb, clientId);
    if (searches.length > 0) {
      await sb.from("user_searches").insert(searches.map((q) => ({ client_id: clientId, query: q })))
        .then(() => {}, () => {});
    }
    let q = sb.from("user_signals")
      .select("feed_item_id,signal_kind,occurred_at,duration_ms")
      .eq("client_id", clientId)
      .order("occurred_at", { ascending: true }).limit(1000);
    if (profile.last_signal_at) q = q.gt("occurred_at", profile.last_signal_at);
    const { data: sig } = await q;

    const ids = [...new Set((sig ?? []).map((r: any) => r.feed_item_id).filter((x: string) => x && x !== "_none"))];
    const metaById = new Map<string, { cc: string; cat: string; ents: string[] }>();
    for (const s of stories) metaById.set(s.id, { cc: s.content_category ?? "", cat: s.category ?? "", ents: s.trend_entities ?? [] });
    const missing = ids.filter((id) => !metaById.has(id));
    if (missing.length > 0) {
      const { data: hist } = await sb.from("feed_items")
        .select("id,content_category,category,trend_entities").in("id", missing);
      for (const h of hist ?? []) metaById.set(h.id, { cc: h.content_category ?? "", cat: h.category ?? "", ents: h.trend_entities ?? [] });
    }
    const newSignals: NewSignal[] = (sig ?? []).map((r: any) => {
      const m = metaById.get(r.feed_item_id) ?? { cc: "", cat: "", ents: [] };
      return {
        signal_kind: r.signal_kind, occurred_at: r.occurred_at, duration_ms: r.duration_ms ?? undefined,
        axes: signalRowAxes(m.cc, m.cat, m.ents), entities: m.ents,
      };
    });
    profile = await learnAndPersist(sb, profile, newSignals, searches, declaredPersona);
  }

  const effProfile: LearnedProfile = profile ?? {
    client_id: "anon", persona: declaredPersona ?? "generic", persona_mix: {}, inferred_role: null,
    skill_level: "intermediate", role: null, primary_role: null, primary_goal: null,
    interests: [], weekly_time_budget: null, experience_level: null, onboarding_completed_at: null,
    interest_weights: {}, concept_affinity: {},
    revisit_counts: {}, companies: {}, technologies: {}, searches: [],
    signal_count: 0, opened_count: 0, saved_count: 0, dismissed_count: 0,
    reading_ms_total: 0, last_signal_at: null,
  };

  // 4. CAP 2: expand interests across the concept graph.
  const graph = await loadConceptGraph(sb);
  const propagated = propagateAffinity(effProfile.concept_affinity, graph);

  // 5. CAP 5: outcome stats per story for the user's dominant persona.
  const outcomeByStory = new Map<string, any>();
  if (storyIds.length > 0) {
    const { data: outs } = await sb.from("recommendation_outcomes")
      .select("feed_item_id,persona,impressions,clicks,saves,shares,ignores")
      .in("feed_item_id", storyIds);
    // Aggregate across personas (proven engagement from similar users).
    for (const o of outs ?? []) {
      const cur = outcomeByStory.get(o.feed_item_id) ?? { impressions: 0, clicks: 0, saves: 0, shares: 0, ignores: 0 };
      cur.impressions += o.impressions; cur.clicks += o.clicks; cur.saves += o.saves;
      cur.shares += o.shares; cur.ignores += o.ignores;
      outcomeByStory.set(o.feed_item_id, cur);
    }
  }

  // V4 CAP 1/2/3: vector similarity + collaborative cluster + global Bayesian.
  const storyVecs = await loadStoryVectors(sb, storyIds);
  const globalStats = await loadGlobalInfluence(sb, storyIds, "story");
  const clusterProfiles = await loadClusterProfiles(sb);
  let userVec: number[] = [];
  let userCluster: { cluster_id: number; similarity: number } | null = null;
  if (clientId) {
    const ue = await loadUserEmbedding(sb, clientId);
    if (ue) userVec = ue.vec;
    userCluster = await loadUserCluster(sb, clientId);
  }
  if (userVec.length === 0 && clusterProfiles.length === 0) { /* cold: no vectors yet */ }
  if (!userCluster && userVec.length > 0) userCluster = assignCluster(userVec, clusterProfiles);
  const clusterProfile = userCluster ? clusterProfiles.find((c) => c.cluster_id === userCluster!.cluster_id) : undefined;

  // 6. Final personalization (no LLM). CAP 4 trend + CAP 7 strategist.
  const cards = stories.map((s) => {
    const cached = intelById.get(s.id);
    const intel = cached?.intel ?? fallbackStoryIntel(s);
    const card = personalizeCard(s, intel, effProfile, cached?.degraded ?? true, {
      propagatedAffinity: propagated,
      outcome: outcomeByStory.get(s.id),
    });
    const bestTrend = (s.trend_entities ?? [])
      .map((e) => trendById.get(e)).filter(Boolean)
      .sort((a, b) => (b.confidence ?? 0) - (a.confidence ?? 0))[0];
    if (bestTrend) {
      card.trend = { name: bestTrend.label ?? bestTrend.entity_id, direction: bestTrend.direction ?? "steady", evidence: bestTrend.summary ?? "", prediction: bestTrend.prediction ?? "" };
    }

    // Blend in semantic + collaborative + global signals.
    const vRel = userVec.length ? vectorRelevance(userVec, storyVecs, s.id) : 0;
    const cRel = collaborativeRelevance(storyVecs.get(s.id) ?? [], clusterProfile);
    const gMult = globalMultiplier(globalStats.get(s.id));
    card.signal_score = Math.round(Math.max(0, Math.min(100,
      card.signal_score * gMult * (1 + vRel * 0.15 + cRel * 0.10))));

    // CAP 7: strategist fields + reason referencing real interests.
    const matched = (s.trend_entities ?? [])
      .map((e) => normConcept(e))
      .filter((c) => (propagated[c] ?? 0) > 0.3);
    applyStrategist(card, s, intel, effProfile, {
      vectorRelevance: vRel, collaborativeRelevance: cRel, globalMultiplier: gMult,
      matchedConcepts: matched, clusterId: userCluster?.cluster_id ?? null,
    });
    return card;
  });
  cards.sort((a, b) => b.signal_score - a.signal_score);

  // CAP 1: refresh the user's interest embedding from engaged stories (uses
  // already-stored story vectors — no embedding API call on this path).
  if (clientId && storyVecs.size > 0) {
    const engagedVecs = [...storyVecs.values()].filter((v) => v.length > 0).slice(0, 50);
    if (engagedVecs.length >= 3) updateUserEmbedding(sb, clientId, engagedVecs).then(() => {}, () => {});
  }

  // 7. CAP 5: log impressions for what we actually showed (atomic, async).
  if (clientId) {
    const persona = effProfile.persona;
    for (const c of cards.slice(0, limit)) {
      sb.rpc("bump_outcome", { p_feed_item_id: c.id, p_persona: persona, p_field: "impressions", p_delta: 1 })
        .then(() => {}, () => {});
    }
  }

  // 8. Daily AI Advisor.
  const advisor = buildAdvisor(cards);

  return new Response(JSON.stringify({
    ok: true,
    profile: {
      persona: effProfile.persona,
      persona_mix: effProfile.persona_mix,
      inferred_role: effProfile.inferred_role,
      skill_level: effProfile.skill_level,
      primary_role: effProfile.primary_role ?? effProfile.role,
      primary_goal: effProfile.primary_goal ?? null,
      interests: effProfile.interests ?? [],
      weekly_time_budget: effProfile.weekly_time_budget ?? null,
      experience_level: effProfile.experience_level ?? effProfile.skill_level,
      onboarding_completed_at: effProfile.onboarding_completed_at ?? null,
      top_interests: Object.entries(effProfile.interest_weights)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .filter(([, w]) => (w as number) > 0).slice(0, 5).map(([a]) => a),
      top_concepts: Object.entries(propagated)
        .sort((a, b) => (b[1] as number) - (a[1] as number))
        .filter(([, w]) => (w as number) > 0).slice(0, 8).map(([c]) => c),
      signal_count: effProfile.signal_count,
      saved_count: effProfile.saved_count,
    },
    advisor,
    cards,
    reasoning_ready: intelById.size,
    generated_at: new Date().toISOString(),
  }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
