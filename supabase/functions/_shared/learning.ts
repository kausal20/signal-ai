// Signal Intelligence Engine V2 — Learning Engine + final personalization.
//
// The Learning Engine keeps a PERSISTENT, continuously-evolving memory per
// client_id in user_profiles. Each request consumes only NEW signals since a
// watermark, decays old weights, and writes the updated memory back — it never
// recomputes from scratch. The final personalization step selects the right
// LLM-reasoned persona variant and applies learned weights. Zero LLM per user.

import { storyAxes, INTEREST_AXES, type InterestAxis } from "./profile.ts";
import { dbWrite } from "./reliability.ts";
import {
  PERSONAS_V2, type PersonaV2, type StoryIntelligence, type IntelOpportunity,
} from "./intelligence_v2.ts";
import { normConcept } from "./semantic.ts";
import type { StoredStory } from "./intelligence_engine.ts";

const DECAY = 0.97;                  // old weight retention per update
// CAP 1: positive + negative reinforcement across the full behaviour spectrum.
const KIND_WEIGHT: Record<string, number> = {
  bookmarked: 3, shared: 3, prompt_copied: 3, workflow_opened: 2.5,
  clicked_source: 2, tool_clicked: 2, notification_opened: 1.5,
  topic_revisit: 1.5, search: 1, opened: 1,
  notification_dismissed: -1, skipped: -1.5, dismissed: -2.5,
};
// reading_time is handled separately (duration-weighted, not a flat constant).

export interface LearnedProfile {
  client_id: string;
  persona: string;
  persona_mix: Record<string, number>;        // CAP 3: multi-persona weights
  inferred_role: string | null;               // CAP 3: dynamic role label
  skill_level: string;
  role: string | null;
  primary_role?: string | null;
  primary_goal?: string | null;
  interests?: string[];
  weekly_time_budget?: string | null;
  experience_level?: string | null;
  onboarding_completed_at?: string | null;
  interest_weights: Record<string, number>;
  concept_affinity: Record<string, number>;   // CAP 2: semantic concept memory
  revisit_counts: Record<string, number>;      // CAP 1: topic revisits
  companies: Record<string, number>;
  technologies: Record<string, number>;
  searches: string[];
  signal_count: number;
  opened_count: number;
  saved_count: number;
  dismissed_count: number;
  reading_ms_total: number;
  last_signal_at: string | null;
}

export function emptyProfile(clientId: string, persona = "generic"): LearnedProfile {
  const w: Record<string, number> = {};
  for (const a of INTEREST_AXES) w[a] = 0;
  return {
    client_id: clientId, persona, persona_mix: {}, inferred_role: null,
    skill_level: "intermediate", role: null, primary_role: null, primary_goal: null,
    interests: [], weekly_time_budget: null, experience_level: null, onboarding_completed_at: null,
    interest_weights: w, concept_affinity: {}, revisit_counts: {},
    companies: {}, technologies: {}, searches: [],
    signal_count: 0, opened_count: 0, saved_count: 0, dismissed_count: 0,
    reading_ms_total: 0, last_signal_at: null,
  };
}

export async function loadProfile(sb: any, clientId: string): Promise<LearnedProfile> {
  try {
    const { data } = await sb.from("user_profiles").select("*").eq("client_id", clientId).maybeSingle();
    if (!data) return emptyProfile(clientId);
    const w: Record<string, number> = {};
    for (const a of INTEREST_AXES) w[a] = Number(data.interest_weights?.[a] ?? 0);
    return {
      client_id: clientId,
      persona: data.persona ?? "generic",
      persona_mix: data.persona_mix ?? {},
      inferred_role: data.inferred_role ?? null,
      skill_level: data.skill_level ?? "intermediate",
      role: data.role ?? null,
      primary_role: data.primary_role ?? null,
      primary_goal: data.primary_goal ?? null,
      interests: Array.isArray(data.interests) ? data.interests : [],
      weekly_time_budget: data.weekly_time_budget ?? null,
      experience_level: data.experience_level ?? null,
      onboarding_completed_at: data.onboarding_completed_at ?? null,
      interest_weights: w,
      concept_affinity: data.concept_affinity ?? {},
      revisit_counts: data.revisit_counts ?? {},
      companies: data.companies ?? {},
      technologies: data.technologies ?? {},
      searches: data.searches ?? [],
      signal_count: data.signal_count ?? 0,
      opened_count: data.opened_count ?? 0,
      saved_count: data.saved_count ?? 0,
      dismissed_count: data.dismissed_count ?? 0,
      reading_ms_total: Number(data.reading_ms_total ?? 0),
      last_signal_at: data.last_signal_at ?? null,
    };
  } catch {
    return emptyProfile(clientId);
  }
}

export interface NewSignal {
  signal_kind: string; occurred_at: string;
  axes: InterestAxis[]; entities: string[]; duration_ms?: number;
}

// Incrementally fold NEW signals into the persisted memory, then write back.
// Returns the evolved profile. Idempotent-ish via the last_signal_at watermark.
export async function learnAndPersist(
  sb: any,
  profile: LearnedProfile,
  newSignals: NewSignal[],
  newSearches: string[],
  declaredPersona?: string,
): Promise<LearnedProfile> {
  if (declaredPersona) profile.persona = declaredPersona;

  if (newSignals.length > 0) {
    // Decay existing interests + concepts once per cycle (recency bias).
    for (const a of INTEREST_AXES) profile.interest_weights[a] *= DECAY;
    for (const c of Object.keys(profile.concept_affinity)) profile.concept_affinity[c] *= DECAY;

    let latest = profile.last_signal_at;
    for (const s of newSignals) {
      // Reading time: long reads are strong positive signal, quick bounces weak.
      let w = KIND_WEIGHT[s.signal_kind] ?? 0;
      if (s.signal_kind === "reading_time") {
        const secs = (s.duration_ms ?? 0) / 1000;
        w = secs >= 25 ? 2.5 : secs >= 8 ? 1 : -0.5;   // engaged vs bounce
        profile.reading_ms_total += Math.max(0, s.duration_ms ?? 0);
      }
      // Interest axes (CAP 1).
      for (const a of s.axes) profile.interest_weights[a] = (profile.interest_weights[a] ?? 0) + w * 0.2;
      // Semantic concept affinity (CAP 2) — entities the user engages with.
      for (const e of s.entities) {
        const c = normConcept(e);
        profile.concept_affinity[c] = (profile.concept_affinity[c] ?? 0) + w * 0.3;
        const bump = w > 0 ? 1 : -1;
        profile.technologies[c] = Math.max(0, (profile.technologies[c] ?? 0) + bump);
      }
      // Topic revisits (CAP 1): returning to a concept compounds interest.
      if (s.signal_kind === "topic_revisit" || s.signal_kind === "search") {
        for (const e of s.entities) {
          const c = normConcept(e);
          profile.revisit_counts[c] = (profile.revisit_counts[c] ?? 0) + 1;
          if ((profile.revisit_counts[c] ?? 0) >= 3) profile.concept_affinity[c] = (profile.concept_affinity[c] ?? 0) + 0.5;
        }
      }
      profile.signal_count++;
      if (s.signal_kind === "opened") profile.opened_count++;
      else if (s.signal_kind === "bookmarked") profile.saved_count++;
      else if (s.signal_kind === "dismissed" || s.signal_kind === "skipped") profile.dismissed_count++;
      if (!latest || s.occurred_at > latest) latest = s.occurred_at;
    }
    profile.last_signal_at = latest;
    for (const a of INTEREST_AXES) profile.interest_weights[a] = clampW(profile.interest_weights[a]);
    for (const c of Object.keys(profile.concept_affinity)) {
      profile.concept_affinity[c] = clampW(profile.concept_affinity[c]);
      if (profile.concept_affinity[c] === 0) delete profile.concept_affinity[c];
    }
    pruneSmall(profile.concept_affinity, 40);
  }

  if (newSearches.length > 0) {
    profile.searches = [...newSearches, ...profile.searches].slice(0, 50);
    for (const q of newSearches) {
      for (const a of searchAxes(q)) profile.interest_weights[a] = clampW((profile.interest_weights[a] ?? 0) + 0.5);
    }
  }

  // CAP 3: recompute adaptive persona mix + inferred role from evolved memory.
  profile.persona_mix = inferPersonaMix(profile);
  profile.inferred_role = inferRole(profile);
  if (!declaredPersona || declaredPersona === "generic") {
    const top = Object.entries(profile.persona_mix).sort((a, b) => b[1] - a[1])[0];
    if (top && profile.signal_count >= 6) profile.persona = top[0];
  }

  await dbWrite("user_profiles.upsert", () => sb.from("user_profiles").upsert({
    client_id: profile.client_id,
    persona: profile.persona,
    persona_mix: profile.persona_mix,
    inferred_role: profile.inferred_role,
    skill_level: profile.skill_level,
    role: profile.role,
    interest_weights: profile.interest_weights,
    concept_affinity: profile.concept_affinity,
    revisit_counts: profile.revisit_counts,
    companies: profile.companies,
    technologies: profile.technologies,
    searches: profile.searches,
    signal_count: profile.signal_count,
    opened_count: profile.opened_count,
    saved_count: profile.saved_count,
    dismissed_count: profile.dismissed_count,
    reading_ms_total: profile.reading_ms_total,
    last_signal_at: profile.last_signal_at,
    updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" }));

  return profile;
}

function clampW(n: number): number { return Math.max(-2, Math.min(3, Math.round(n * 1000) / 1000)); }

function pruneSmall(m: Record<string, number>, keep: number): void {
  const entries = Object.entries(m);
  if (entries.length <= keep) return;
  entries.sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  for (const [k] of entries.slice(keep)) delete m[k];
}

// CAP 3: a user can belong to multiple personas; return normalized weights.
function inferPersonaMix(p: LearnedProfile): Record<string, number> {
  const w = p.interest_weights;
  const raw: Record<string, number> = {
    developer: pos(w.coding) * 1.0 + pos(w.agents) * 0.4,
    builder: pos(w.coding) * 0.6 + pos(w.automation) * 0.6 + pos(w.agents) * 0.5,
    founder: pos(w.business) * 1.0 + pos(w.models) * 0.3,
    agency: pos(w.automation) * 1.0 + pos(w.business) * 0.4,
    researcher: pos(w.research) * 1.0 + pos(w.models) * 0.4,
    marketer: pos(w.video) * 0.8 + pos(w.design) * 0.6 + pos(w.business) * 0.3,
    investor: pos(w.business) * 0.6 + pos(w.models) * 0.3,
    student: (p.signal_count < 6 ? 0.5 : 0) + pos(w.research) * 0.3,
  };
  const total = Object.values(raw).reduce((s, v) => s + v, 0);
  if (total <= 0) return { builder: 1 };
  const mix: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw)) {
    const share = Math.round((v / total) * 100) / 100;
    if (share >= 0.08) mix[k] = share;
  }
  return Object.keys(mix).length ? mix : { builder: 1 };
}

function pos(n: number | undefined): number { return Math.max(0, n ?? 0); }

// CAP 3: human-readable dynamic role, e.g. "Indie Hacker building Automation".
function inferRole(p: LearnedProfile): string {
  const mix = inferPersonaMix(p);
  const top = Object.entries(mix).sort((a, b) => b[1] - a[1]);
  const base: Record<string, string> = {
    developer: "Developer", builder: "Indie Hacker", founder: "Technical Founder",
    agency: "Automation Consultant", researcher: "Research Engineer",
    marketer: "Content Creator", investor: "AI Investor", student: "Learner",
  };
  const w = p.interest_weights;
  const focusAxis = [...INTEREST_AXES].sort((a, b) => (w[b] ?? 0) - (w[a] ?? 0))[0];
  const focus: Record<string, string> = {
    coding: "building dev tools", agents: "building agents", automation: "shipping automation",
    business: "growing a startup", models: "tracking frontier models", research: "tracking research",
    voice: "building voice AI", video: "building media tools", design: "building design tools", infra: "optimizing infra",
  };
  const role = base[top[0]?.[0] ?? "builder"] ?? "AI builder";
  const second = top[1] ? ` / ${base[top[1][0]] ?? ""}`.replace(/ \/ $/, "") : "";
  return `${role}${second} ${focus[focusAxis] ? "— " + focus[focusAxis] : ""}`.trim();
}

function searchAxes(q: string): InterestAxis[] {
  // Light keyword → axis mapping is acceptable for SEARCH terms (the user typed
  // them intentionally); it is not used for story reasoning.
  const s = q.toLowerCase();
  const out: InterestAxis[] = [];
  if (/code|dev|api|sdk|cursor|copilot/.test(s)) out.push("coding");
  if (/agent|mcp|crew|autogen|langchain/.test(s)) out.push("agents");
  if (/automat|workflow|n8n|zapier/.test(s)) out.push("automation");
  if (/fund|revenue|startup|business|market/.test(s)) out.push("business");
  if (/research|paper|benchmark/.test(s)) out.push("research");
  if (/voice|speech|tts/.test(s)) out.push("voice");
  if (/video|image|diffusion/.test(s)) out.push("video");
  if (/model|gpt|claude|gemini|llama/.test(s)) out.push("models");
  return out;
}

export function signalRowAxes(contentCategory: string, category: string, entities: string[]): InterestAxis[] {
  return storyAxes(contentCategory, category, entities);
}

// =====================================================================
// FINAL PERSONALIZATION — pick the LLM-reasoned persona variant + apply
// learned weights. No LLM. This is the only per-user step.
// =====================================================================
function normalizePersona(p: string): PersonaV2 {
  if ((PERSONAS_V2 as readonly string[]).includes(p)) return p as PersonaV2;
  if (p === "operator") return "builder";
  return "builder";
}

const OPP_AXIS: Record<IntelOpportunity["type"], InterestAxis> = {
  Business: "business", Investment: "business", Startup: "business",
  Automation: "automation", Workflow: "automation",
  Learning: "research", Career: "models", Product: "coding",
};

export interface FinalCard {
  id: string;
  headline: string;
  what_happened: string;
  why_it_matters: string;
  who_should_care: string;
  personalized_takeaway: string;
  personalized_why: string;
  opportunity: IntelOpportunity | null;
  opportunities: IntelOpportunity[];
  action: string;
  estimated_impact: StoryIntelligence["impact"];
  confidence: string;
  signal_score: number;
  why_signal_picked_this: string[];
  supporting_evidence: string[];
  trend: StoryIntelligence["trend"];
  content_category: string;
  url: string;
  reasoning_degraded: boolean;
  // V4 strategist fields (CAP 5/7), filled by strategist.applyStrategist:
  roi?: StoryIntelligence["roi"];
  priority?: "High" | "Medium" | "Low";
  effort?: "Low" | "Medium" | "High";
  risk?: "Low" | "Medium" | "High";
  recommendation_reason?: string;
  verification?: StoryIntelligence["verification"];
}

export interface PersonalizeOpts {
  propagatedAffinity?: Record<string, number>;   // CAP 2: semantic-expanded interests
  outcome?: { impressions: number; clicks: number; saves: number; shares: number; ignores: number };
}

export function personalizeCard(
  story: StoredStory,
  intel: StoryIntelligence,
  profile: LearnedProfile,
  degraded: boolean,
  opts: PersonalizeOpts = {},
): FinalCard {
  const persona = normalizePersona(profile.persona);
  const advice = intel.personas[persona];
  const u = intel.understanding;

  // Behavioural multiplier from learned axis weights on this story.
  const axes = storyAxes(story.content_category ?? "", story.category ?? "", story.trend_entities ?? []);
  let bestW = 0;
  for (const a of axes) bestW = Math.max(bestW, profile.interest_weights[a] ?? 0);

  // CAP 2: semantic concept affinity — if the user is into a related concept,
  // this story gets lifted even if its category axis is neutral.
  const affinity = opts.propagatedAffinity ?? profile.concept_affinity;
  let conceptW = 0;
  for (const e of story.trend_entities ?? []) conceptW = Math.max(conceptW, affinity[normConcept(e)] ?? 0);
  const blendedW = Math.max(bestW, conceptW * 0.8);
  const behaviourMult = 1 + Math.max(-0.25, Math.min(0.4, blendedW * 0.15));

  // CAP 3: relevance is a persona-MIX-weighted blend across all persona variants
  // the user belongs to, not a single fixed persona.
  const mix = profile.persona_mix && Object.keys(profile.persona_mix).length ? profile.persona_mix : { [persona]: 1 };
  let relNum = 0, relDen = 0;
  for (const [pk, weight] of Object.entries(mix)) {
    const pv = intel.personas[normalizePersona(pk)];
    if (!pv) continue;
    relNum += (pv.relevance ?? 60) * weight;
    relDen += weight;
  }
  const relevance = relDen > 0 ? relNum / relDen : (advice?.relevance ?? 60);

  // CAP 5: outcome multiplier — stories that similar users actually engage with
  // are boosted; stories that get ignored are dampened.
  const outcomeMult = outcomeMultiplier(opts.outcome);

  // Signal Score: LLM significance + persona-mix relevance + confidence,
  // scaled by learned behaviour AND proven outcomes. Fully explainable.
  const sig = Math.max(1, Math.min(10, u?.significance ?? 5));
  const confBoost = intel.impact?.confidence === "High" ? 10 : intel.impact?.confidence === "Medium" ? 6 : 3;
  let score = sig * 7 + relevance * 0.2 + confBoost;
  score = Math.round(Math.max(0, Math.min(100, score * behaviourMult * outcomeMult)));

  // Rank opportunities by this user's learned interests.
  const opps = [...(intel.opportunities ?? [])].sort((a, b) => {
    const wa = profile.interest_weights[OPP_AXIS[a.type]] ?? 0;
    const wb = profile.interest_weights[OPP_AXIS[b.type]] ?? 0;
    const ia = impactRank(a), ib = impactRank(b);
    return (wb + ib) - (wa + ia);
  });

  return {
    id: story.id,
    headline: story.title,
    what_happened: u?.what_happened ?? story.summary,
    why_it_matters: u?.what_changed ?? story.why_it_matters ?? story.summary,
    who_should_care: (u?.who_benefits ?? []).join(", ") || (story.who_for ?? "AI builders"),
    personalized_takeaway: advice?.takeaway ?? story.summary,
    personalized_why: advice?.why ?? "",
    opportunity: opps[0] ?? null,
    opportunities: opps,
    action: advice?.action ?? "Review the source and decide if it fits your stack this week.",
    estimated_impact: intel.impact,
    confidence: intel.impact?.confidence ?? "Medium",
    signal_score: score,
    why_signal_picked_this: intel.why_picked ?? [],
    supporting_evidence: intel.supporting_evidence ?? [],
    trend: intel.trend,
    content_category: story.content_category ?? "Must Know",
    url: story.url,
    reasoning_degraded: degraded,
  };
}

function impactRank(o: IntelOpportunity): number {
  return (o.potential_impact === "High" ? 1.5 : o.potential_impact === "Medium" ? 1 : 0.5)
    + (o.confidence === "High" ? 0.5 : 0);
}

// CAP 5: convert aggregate engagement outcomes into a ranking multiplier.
// Wilson-style smoothing so low-impression stories aren't over-trusted.
function outcomeMultiplier(o?: { impressions: number; clicks: number; saves: number; shares: number; ignores: number }): number {
  if (!o || o.impressions < 5) return 1;                  // not enough evidence yet
  const positive = o.clicks + o.saves * 2 + o.shares * 2;
  const negative = o.ignores;
  const rate = (positive + 1) / (positive + negative + 2); // Laplace-smoothed success rate
  // rate ~0.5 neutral -> mult 1.0; high engagement -> up to 1.25; ignored -> down to 0.8.
  return Math.max(0.8, Math.min(1.25, 0.8 + rate * 0.7));
}

// =====================================================================
// DAILY AI ADVISOR — strategist brief over the personalized cards.
// =====================================================================
export interface Advisor {
  top_3_things_to_know: Array<{ id: string; headline: string; takeaway: string }>;
  best_opportunity_today: { id: string; headline: string; opportunity: IntelOpportunity } | null;
  tool_worth_trying: { id: string; headline: string; action: string } | null;
  one_action_to_take: string | null;
  one_skill_to_learn: string | null;
  one_trend_to_watch: string | null;
  generated_at: string;
}

export function buildAdvisor(cards: FinalCard[]): Advisor {
  const ranked = [...cards].sort((a, b) => b.signal_score - a.signal_score);
  const top3 = ranked.slice(0, 3).map((c) => ({ id: c.id, headline: c.headline, takeaway: c.personalized_takeaway }));

  let best: Advisor["best_opportunity_today"] = null;
  let bestRank = -1;
  for (const c of ranked) {
    for (const o of c.opportunities) {
      const r = impactRank(o);
      if (r > bestRank) { bestRank = r; best = { id: c.id, headline: c.headline, opportunity: o }; }
    }
  }
  const tool = ranked.find((c) => /tool of the day|underrated tool/i.test(c.content_category));
  const learn = ranked.find((c) => c.estimated_impact?.learning_value === "High");
  const trend = ranked.find((c) => c.trend?.direction === "accelerating" || c.trend?.direction === "emerging");

  return {
    top_3_things_to_know: top3,
    best_opportunity_today: best,
    tool_worth_trying: tool ? { id: tool.id, headline: tool.headline, action: tool.action } : null,
    one_action_to_take: ranked[0]?.action ?? null,
    one_skill_to_learn: learn ? `Learn what powers "${learn.headline}".` : (ranked[0] ? `Study the top story's method.` : null),
    one_trend_to_watch: trend ? `${trend.trend.name} is ${trend.trend.direction}: ${trend.trend.prediction}` : null,
    generated_at: new Date().toISOString(),
  };
}
