// Phase 4 · Module 5 — Continuous Learning Engine (deterministic, no LLM).
//
// EXTENDS learning.ts (does not rewrite it). learning.ts already does the
// incremental interest/concept fold + decay. This module adds the derived,
// explainable layer on TOP of the evolved profile:
//   • explicit action→weight table (explainable)
//   • time-based decay (30d→60%, 90d→30%)
//   • per-dimension confidence (from interaction evidence)
//   • multi-label user clusters
//   • opportunity-type weights
//   • behavior-based recommendation explanations
// All pure functions over a profile snapshot — incremental, never rebuilt,
// never blocks the feed. Zero LLM.

// Minimal read-only shape (avoids importing learning.ts → keeps this testable).
export interface ProfileLike {
  persona: string;
  persona_mix: Record<string, number>;
  interest_weights: Record<string, number>;
  concept_affinity: Record<string, number>;
  revisit_counts: Record<string, number>;
  searches: string[];
  signal_count: number;
  opened_count: number;
  saved_count: number;
  dismissed_count: number;
}

// ── Explicit, explainable action weights (the canonical learning table) ──────
// Keyed by DB signal_kind. Positive = interest, negative = disinterest.
export const ACTION_WEIGHT: Record<string, number> = {
  project_completed: 20, implemented: 20,
  project_started: 15, built: 15,
  advisor_action: 10, action_completed: 10,
  topic_revisit: 8,          // repeated search / return to a topic
  shared: 6,
  bookmarked: 5, saved: 5,
  completed: 4, prompt_copied: 4,
  search: 3, tool_clicked: 3, workflow_opened: 3, clicked_source: 3,
  opened: 2, notification_opened: 2,
  notification_dismissed: -2,
  skipped: -3,
  dismissed: -4,
  hidden: -10, hide_topic: -10,
};

export function actionWeight(kind: string): number {
  return ACTION_WEIGHT[kind] ?? 0;
}

// ── Time-based decay ─────────────────────────────────────────────────────────
// Deterministic piecewise: 1.0 at 0d, 0.6 at 30d, 0.3 at 90d, slow tail after.
export function timeDecay(days: number): number {
  if (days <= 0) return 1;
  if (days <= 30) return round3(1 - 0.4 * (days / 30));
  if (days <= 90) return round3(0.6 - 0.3 * ((days - 30) / 60));
  return round3(Math.max(0.05, 0.3 * (90 / days)));
}
function round3(n: number): number { return Math.round(n * 1000) / 1000; }
function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));
}
function pos(n: number | undefined): number { return Math.max(0, n ?? 0); }

// ── Confidence: more evidence → higher confidence (saturating) ───────────────
// evidence = persona-mix share × total signals. confidence = 100·(1−e^(−ev/6)).
function confFrom(evidence: number): number {
  return clamp(100 * (1 - Math.exp(-Math.max(0, evidence) / 6)));
}

const DIMENSIONS = ["developer", "builder", "founder", "agency", "researcher", "marketer", "investor", "student"] as const;
export type Dimension = typeof DIMENSIONS[number];

/** Per-dimension confidence 0..100 from persona mix + signal volume. */
export function computeConfidence(p: ProfileLike): Record<Dimension, number> {
  const n = p.signal_count;
  const out = {} as Record<Dimension, number>;
  for (const d of DIMENSIONS) {
    const share = pos(p.persona_mix?.[d]);
    out[d] = confFrom(share * n);
  }
  return out;
}

// ── User clusters (multi-label) ──────────────────────────────────────────────
export type Cluster =
  | "AI Builder" | "Researcher" | "Founder" | "Student" | "Investor"
  | "Automation Expert" | "Prompt Engineer" | "Enterprise Leader" | "Agent Developer";

/** Deterministic multi-label cluster classification from the evolved profile. */
export function classifyClusters(p: ProfileLike): Cluster[] {
  const w = p.interest_weights ?? {};
  const ca = p.concept_affinity ?? {};
  const mix = p.persona_mix ?? {};
  const conceptMax = (...keys: string[]) => Math.max(0, ...keys.map((k) => ca[k] ?? 0));

  const scores: Record<Cluster, number> = {
    "AI Builder": pos(w.coding) + pos(mix.developer) * 2 + pos(mix.builder) * 2,
    "Agent Developer": pos(w.agents) * 1.5 + conceptMax("agents", "mcp", "langchain", "crewai", "autogen"),
    "Automation Expert": pos(w.automation) * 1.5 + conceptMax("n8n", "zapier", "automation"),
    "Researcher": pos(w.research) * 1.5 + pos(mix.researcher) * 2,
    "Founder": pos(w.business) + pos(mix.founder) * 2,
    "Investor": pos(mix.investor) * 2 + pos(w.business) * 0.5,
    "Student": (p.signal_count < 6 ? 1.2 : 0) + pos(mix.student) * 2,
    "Prompt Engineer": conceptMax("prompt", "prompting") + (p.opened_count > 0 ? pos(w.coding) * 0.3 : 0),
    "Enterprise Leader": conceptMax("enterprise", "compliance", "sso") + pos(w.business) * 0.4,
  };

  const clusters = (Object.entries(scores) as [Cluster, number][])
    .filter(([, s]) => s >= 1.0)
    .sort((a, b) => b[1] - a[1])
    .map(([c]) => c);
  return clusters.length ? clusters : ["AI Builder"];   // never empty
}

// ── Opportunity-type weights (interest axis → opportunity types) ─────────────
const AXIS_OPP: Record<string, string[]> = {
  coding: ["Developer Opportunity", "Tool Opportunity", "Framework Opportunity", "API Release"],
  agents: ["AI Agent Opportunity", "Developer Opportunity"],
  automation: ["Automation Opportunity", "Business Opportunity"],
  business: ["Business Opportunity", "Startup Opportunity", "Investment Opportunity", "Market Opportunity"],
  research: ["Research Breakthrough", "Learning Opportunity"],
  models: ["Developer Opportunity", "Research Breakthrough"],
};

/** Opportunity-type affinity 0..100 accumulated from interest-axis weights. */
export function computeOpportunityWeights(p: ProfileLike): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [axis, types] of Object.entries(AXIS_OPP)) {
    const wv = pos(p.interest_weights?.[axis]);
    if (wv <= 0) continue;
    for (const t of types) out[t] = clamp((out[t] ?? 0) + wv * 25);
  }
  return out;
}

// ── Behavior-based recommendation explanation (read-time) ────────────────────
/** "Recommended because you bookmarked similar / searched X / follow OpenAI." */
export function explainRecommendation(
  p: ProfileLike,
  story: { axes?: string[]; entities?: string[]; content_category?: string },
): string[] {
  const out: string[] = [];
  const entities = (story.entities ?? []).map((e) => e.toLowerCase());
  const axes = story.axes ?? [];

  if (p.saved_count > 0 && axes.some((a) => pos(p.interest_weights?.[a]) > 0.3)) {
    out.push("You bookmarked similar stories");
  }
  const searchedEntity = entities.find((e) => p.searches.some((s) => s.toLowerCase().includes(e)));
  if (searchedEntity) out.push(`You searched ${searchedEntity} recently`);

  const followed = entities.find((e) => (p.concept_affinity?.[e] ?? 0) >= 0.6);
  if (followed) out.push(`You frequently engage with ${followed}`);

  const revisited = entities.find((e) => (p.revisit_counts?.[e] ?? 0) >= 3);
  if (revisited) out.push(`You keep returning to ${revisited}`);

  const topDim = (Object.entries(p.persona_mix ?? {}).sort((a, b) => b[1] - a[1])[0] ?? [])[0];
  if (topDim && axes.length) out.push(`You're a ${topDim} and this fits your focus`);

  return out.slice(0, 5);
}

export interface DerivedLearning {
  dimension_confidence: Record<Dimension, number>;
  clusters: Cluster[];
  opportunity_weights: Record<string, number>;
}

/** One call producing all derived signals from the evolved profile. */
export function deriveLearning(p: ProfileLike): DerivedLearning {
  return {
    dimension_confidence: computeConfidence(p),
    clusters: classifyClusters(p),
    opportunity_weights: computeOpportunityWeights(p),
  };
}
