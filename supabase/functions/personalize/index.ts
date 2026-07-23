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

// PERFORMANCE: short-TTL in-memory response cache (per warm edge instance). The
// frontend calls personalize on every feed load / re-render; caching the fully
// computed response for a few seconds collapses bursts into one computation.
// Bypassed when the request carries new searches (those must always be folded).
const RESP_CACHE = new Map<string, { at: number; body: string }>();
const RESP_TTL_MS = 30_000;
function cacheGet(key: string): string | null {
  const hit = RESP_CACHE.get(key);
  if (hit && Date.now() - hit.at < RESP_TTL_MS) return hit.body;
  if (hit) RESP_CACHE.delete(key);
  return null;
}
function cacheSet(key: string, body: string): void {
  RESP_CACHE.set(key, { at: Date.now(), body });
  if (RESP_CACHE.size > 500) { // bound memory
    const cutoff = Date.now() - RESP_TTL_MS;
    for (const [k, v] of RESP_CACHE) if (v.at < cutoff) RESP_CACHE.delete(k);
  }
}

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

  // Response cache: serve a recent identical computation (no new searches).
  const cacheKey = `${clientId ?? "anon"}|${declaredPersona ?? "-"}|${limit}`;
  if (searches.length === 0) {
    const cached = cacheGet(cacheKey);
    if (cached) {
      return new Response(cached, { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });
    }
  }

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

  // 1b. NEVER-EMPTY / freshness guard. The curated feed_items table is only
  // republished when the ingest pipeline runs; if it is thin or stale, supplement
  // from the permanent Content Archive (fresh, high editorial quality, official
  // sources preferred). Reuses the archive — no new pipeline, no mock data.
  const FRESH_DAYS = 4;
  const freshest = stories.reduce((m, s) => Math.max(m, Date.parse(s.published_at ?? "") || 0), 0);
  const stale = freshest > 0 && (Date.now() - freshest) > FRESH_DAYS * 86400_000;
  if (stories.length < limit || stale) {
    const seen = new Set(stories.map((s) => s.id));
    const since = new Date(Date.now() - 21 * 86400_000).toISOString();
    const { data: arch, error: archErr } = await sb
      .from("content_archive")
      .select("id,title,summary,original_url,url,content_type,event_type,editorial_quality_score,trust_score,is_official_source,is_official_company_news,publisher,published_at")
      .eq("archive_status", "active")
      .gte("published_at", since)
      // Only rows that resolve to a REAL publisher article (Google-News RSS links
      // can't be resolved server-side, so exclude rows that only have one).
      .or("original_url.not.is.null,url.not.ilike.%news.google.com%")
      // Official + high quality first, newest as tiebreak.
      .order("is_official_source", { ascending: false })
      .order("editorial_quality_score", { ascending: false, nullsFirst: false })
      .order("published_at", { ascending: false })
      .limit(limit * 3);
    if (archErr) console.error("[personalize] archive supplement failed", archErr.message);
    for (const a of (arch ?? []) as any[]) {
      if (seen.has(a.id) || stories.length >= limit) continue;
      seen.add(a.id);
      const q = Math.max(50, Math.round(a.editorial_quality_score ?? 60));
      stories.push({
        id: a.id,
        title: a.title,
        summary: a.summary ?? "",
        why_it_matters: a.summary ?? "",
        what_happened: a.summary ?? "",
        who_for: "",
        opportunity: a.event_type && a.event_type !== "none" ? `${a.event_type} — worth watching.` : "",
        action: null, risk: null,
        content_category: "Must Know",
        category: a.content_type ?? "news",
        tag: "news",
        url: a.original_url || a.url,
        impact: q >= 80 ? "critical" : "major",
        source_label: a.publisher ?? "Signal archive",
        source_count: 1,
        published_at: a.published_at ?? new Date().toISOString(),
        ranking_reason: a.is_official_source ? "Official company source" : "High-quality archive signal",
        trend_entities: [],
        score: q,
        novelty_score: q, business_impact_score: q, builder_value_score: q,
        adoption_potential_score: q, market_impact_score: q, confidence_score: Math.round(a.trust_score ?? 70),
        opportunity_score: q, corroboration_score: q, leverage_score: 6, trend_score: 0, momentum_score: 0,
        // Carried for ranking below (not part of StoredStory but read via `any`).
        _trust: a.trust_score ?? 70, _official: !!a.is_official_source, _official_news: !!a.is_official_company_news,
      } as unknown as StoredStory);
    }
  }
  const storyIds = stories.map((s) => s.id);
  const entityIds = [...new Set(stories.flatMap((s) => s.trend_entities ?? []))];

  // ── PERFORMANCE: one parallel wave for every read that only needs storyIds /
  //    entityIds / clientId. Previously these were ~10 sequential awaits (~4-5s);
  //    batching them cuts the critical path to a single round-trip.
  const [
    intelRes, trendRes, outcomeRes, storyVecs, globalStats, clusterProfiles, graph, profile0, ue0, userCluster0,
  ] = await Promise.all([
    storyIds.length ? sb.from("story_intelligence").select("feed_item_id,intelligence,degraded").in("feed_item_id", storyIds) : Promise.resolve({ data: [] as any[] }),
    entityIds.length ? sb.from("trend_intelligence").select("entity_id,label,summary,why_it_matters,prediction,direction,confidence").in("entity_id", entityIds) : Promise.resolve({ data: [] as any[] }),
    storyIds.length ? sb.from("recommendation_outcomes").select("feed_item_id,persona,impressions,clicks,saves,shares,ignores").in("feed_item_id", storyIds) : Promise.resolve({ data: [] as any[] }),
    loadStoryVectors(sb, storyIds),
    loadGlobalInfluence(sb, storyIds, "story"),
    loadClusterProfiles(sb),
    loadConceptGraph(sb),
    clientId ? loadProfile(sb, clientId) : Promise.resolve(null),
    clientId ? loadUserEmbedding(sb, clientId) : Promise.resolve(null),
    clientId ? loadUserCluster(sb, clientId) : Promise.resolve(null),
  ]);

  // 2. Cached reusable intelligence (per story + per trend). No LLM here.
  const intelById = new Map<string, { intel: StoryIntelligence; degraded: boolean }>();
  const trendById = new Map<string, any>();
  for (const r of intelRes.data ?? []) intelById.set(r.feed_item_id, { intel: r.intelligence as StoryIntelligence, degraded: !!r.degraded });
  for (const t of trendRes.data ?? []) trendById.set(t.entity_id, t);

  // 5. CAP 5: outcome stats per story (aggregated across personas).
  const outcomeByStory = new Map<string, any>();
  for (const o of outcomeRes.data ?? []) {
    const cur = outcomeByStory.get(o.feed_item_id) ?? { impressions: 0, clicks: 0, saves: 0, shares: 0, ignores: 0 };
    cur.impressions += o.impressions; cur.clicks += o.clicks; cur.saves += o.saves;
    cur.shares += o.shares; cur.ignores += o.ignores;
    outcomeByStory.set(o.feed_item_id, cur);
  }

  // 3. Learning Engine: evolve persistent memory from NEW signals + searches.
  let profile: LearnedProfile | null = profile0;
  if (clientId && profile) {
    if (searches.length > 0) {
      sb.from("user_searches").insert(searches.map((q) => ({ client_id: clientId, query: q })))
        .then(() => {}, () => {});
    }
    let q = sb.from("user_signals")
      .select("feed_item_id,signal_kind,occurred_at,duration_ms")
      .eq("client_id", clientId)
      .order("occurred_at", { ascending: false }).limit(1000);
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

  // 4. CAP 2: expand interests across the concept graph (graph loaded above).
  const propagated = propagateAffinity(effProfile.concept_affinity, graph);

  // V4 CAP 1/2/3: vector similarity + collaborative cluster + global Bayesian
  // (storyVecs / globalStats / clusterProfiles / user embedding loaded above).
  let userVec: number[] = ue0?.vec ?? [];
  let userCluster: { cluster_id: number; similarity: number } | null = userCluster0;
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

    // Intelligence ranking (Phase 4): official-source boost, trust weighting, and
    // natural freshness decay so old stories sink. All from real columns.
    const sa = s as any;
    const ageDays = Math.max(0, (Date.now() - (Date.parse(s.published_at ?? "") || Date.now())) / 86400_000);
    const freshMult = 0.80 + 0.20 * Math.exp(-ageDays / 10);        // ~1.0 today → ~0.8 at 3wk
    // Official-source boost + trust weighting now apply to BOTH archive rows
    // (which carry explicit flags) AND curated feed_items rows (derive official
    // from the source label / ranking reason, trust from the confidence score).
    const officialNews = sa._official_news === true;
    const officialSrc = sa._official === true || /\bofficial\b/i.test(`${s.source_label ?? ""} ${s.ranking_reason ?? ""}`);
    const officialMult = officialNews ? 1.18 : officialSrc ? 1.10 : 1.0;
    const trust = Math.max(50, Math.min(100, Number(sa._trust ?? s.confidence_score ?? 85)));
    const trustMult = 0.92 + (trust - 50) / 250; // 0.92..1.12
    // Phase 11 — broken/redirect URL penalty: a Google-News redirect or a Google
    // image CDN is not a real article, so heavily demote it (never the hero).
    const u = String(card.url ?? "");
    const brokenUrl = /news\.google\.com|googleusercontent\.com|gstatic\.com|\/\/google\.com/.test(u) || !/^https?:\/\//.test(u);
    const urlMult = brokenUrl ? 0.45 : 1.0;

    card.signal_score = Math.round(Math.max(0, Math.min(100,
      card.signal_score * gMult * officialMult * trustMult * freshMult * urlMult * (1 + vRel * 0.15 + cRel * 0.10))));

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

  // Phase 4 — de-dupe + topic diversity: at most 2 cards per primary company and
  // no near-duplicate headlines, so Advisor never repeats the same story/company.
  const storyById = new Map(stories.map((s) => [s.id, s]));
  const perEntity = new Map<string, number>();
  const titleKeys = new Set<string>();
  const diverse: typeof cards = [];
  for (const c of cards) {
    const st = storyById.get(c.id);
    const ent = (st?.trend_entities ?? [])[0]?.toLowerCase() ?? "";
    const tkey = (st?.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().slice(0, 40);
    if (tkey && titleKeys.has(tkey)) continue;
    if (ent && (perEntity.get(ent) ?? 0) >= 2) continue;
    if (ent) perEntity.set(ent, (perEntity.get(ent) ?? 0) + 1);
    if (tkey) titleKeys.add(tkey);
    diverse.push(c);
  }
  // Keep everything (diverse first, then the rest) so counts never shrink to 0.
  const dropped = cards.filter((c) => !diverse.includes(c));
  cards.length = 0;
  cards.push(...diverse, ...dropped);

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

  const responseBody = JSON.stringify({
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
  }, null, 2);

  if (searches.length === 0) cacheSet(cacheKey, responseBody);
  return new Response(responseBody, { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
});
