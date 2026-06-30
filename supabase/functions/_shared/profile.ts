// Signal Intelligence Engine — User Profile Engine.
// Builds an evolving profile per anonymous client_id from declared interests
// plus behavioural signals (opened / bookmarked / dismissed / shared) already
// captured in user_signals. No new tables — derived at read time.

export type Persona =
  | "developer" | "founder" | "agency" | "student" | "researcher" | "operator" | "generic";

export type SkillLevel = "beginner" | "intermediate" | "advanced";

// Canonical interest axes (map onto content_category + trend_entities).
export const INTEREST_AXES = [
  "coding", "agents", "automation", "models", "business",
  "research", "voice", "video", "design", "infra",
] as const;
export type InterestAxis = typeof INTEREST_AXES[number];

export interface UserProfile {
  persona: Persona;
  skill_level: SkillLevel;
  role: string;
  industry: string;
  goals: string[];
  primary_interests: InterestAxis[];
  secondary_interests: InterestAxis[];
  interest_weights: Record<string, number>;   // axis -> -1..+2 relevance multiplier
  notification_behaviour: "minimal" | "balanced" | "aggressive";
  reading_behaviour: "skim" | "deep";
  saved_count: number;
  signals_seen: number;
}

const PERSONA_DEFAULTS: Record<Persona, { role: string; industry: string; goals: string[]; primary: InterestAxis[] }> = {
  developer:  { role: "Developer", industry: "Software", goals: ["ship faster", "adopt better tools"], primary: ["coding", "agents", "models"] },
  founder:    { role: "Founder", industry: "Startup", goals: ["grow revenue", "find opportunities"], primary: ["business", "models", "agents"] },
  agency:     { role: "Automation agency", industry: "Services", goals: ["win clients", "deliver automation"], primary: ["automation", "agents", "business"] },
  student:    { role: "Student", industry: "Education", goals: ["learn AI", "use free tools"], primary: ["models", "coding", "research"] },
  researcher: { role: "Researcher", industry: "Research", goals: ["track breakthroughs"], primary: ["research", "models", "agents"] },
  operator:   { role: "Operator", industry: "Tech", goals: ["improve efficiency"], primary: ["automation", "business", "agents"] },
  generic:    { role: "AI builder", industry: "Tech", goals: ["stay ahead"], primary: ["models", "agents", "business"] },
};

// Map a story's content_category + trend_entities to interest axes.
export function storyAxes(contentCategory: string, category: string, trendEntities: string[]): InterestAxis[] {
  const axes = new Set<InterestAxis>();
  const cc = (contentCategory || "").toLowerCase();
  const cat = (category || "").toLowerCase();
  if (cat === "coding" || /tool|workflow/.test(cc)) axes.add("coding");
  if (cat === "business" || /founder|market/.test(cc)) axes.add("business");
  if (cat === "automation" || /workflow/.test(cc)) axes.add("automation");
  if (cat === "models" || /must know|research/.test(cc)) axes.add("models");
  if (/research breakthrough/.test(cc)) axes.add("research");
  if (cat === "design") axes.add("design");
  for (const e of trendEntities ?? []) {
    if (/agent|crewai|autogen|langchain|mcp|browser_use|computer_use/.test(e)) axes.add("agents");
    if (/voice|elevenlabs|speech/.test(e)) axes.add("voice");
    if (/video|runway|midjourney|image_gen|pika|luma|suno/.test(e)) axes.add("video");
    if (/inference|long_context|memory/.test(e)) axes.add("infra");
    if (/cursor|replit|v0|bolt|coding_assistants/.test(e)) axes.add("coding");
  }
  return [...axes];
}

interface SignalRow { signal_kind: string; axes: InterestAxis[]; }

// Behavioural weight per interaction kind.
const KIND_WEIGHT: Record<string, number> = {
  bookmarked: 3, shared: 3, clicked_source: 2, opened: 1, dismissed: -2,
};

export function deriveProfile(opts: {
  declared?: Partial<UserProfile>;
  signals?: SignalRow[];
  notification_behaviour?: UserProfile["notification_behaviour"];
}): UserProfile {
  const declaredPersona = (opts.declared?.persona ?? "generic") as Persona;
  const base = PERSONA_DEFAULTS[declaredPersona] ?? PERSONA_DEFAULTS.generic;

  // Start every axis neutral.
  const weights: Record<string, number> = {};
  for (const a of INTEREST_AXES) weights[a] = 0;
  // Declared primary interests get a head start.
  const declaredPrimary = opts.declared?.primary_interests ?? base.primary;
  for (const a of declaredPrimary) weights[a] = (weights[a] ?? 0) + 1;

  // Behavioural inference: accumulate per-axis signal.
  let saved = 0;
  const sigs = opts.signals ?? [];
  for (const s of sigs) {
    if (s.signal_kind === "bookmarked") saved++;
    const w = KIND_WEIGHT[s.signal_kind] ?? 0;
    for (const a of s.axes) weights[a] = (weights[a] ?? 0) + w * 0.25;
  }
  // Clamp to a sane multiplier range.
  for (const a of INTEREST_AXES) weights[a] = Math.max(-1, Math.min(2, Math.round(weights[a] * 100) / 100));

  // Rank axes.
  const ranked = [...INTEREST_AXES].sort((x, y) => (weights[y] - weights[x]));
  const primary = ranked.filter((a) => weights[a] > 0).slice(0, 3);
  const secondary = ranked.filter((a) => weights[a] > 0).slice(3, 6);

  return {
    persona: declaredPersona,
    skill_level: (opts.declared?.skill_level ?? "intermediate"),
    role: opts.declared?.role ?? base.role,
    industry: opts.declared?.industry ?? base.industry,
    goals: opts.declared?.goals ?? base.goals,
    primary_interests: primary.length ? primary : base.primary,
    secondary_interests: secondary,
    interest_weights: weights,
    notification_behaviour: opts.notification_behaviour ?? "balanced",
    reading_behaviour: (opts.declared?.reading_behaviour ?? "skim"),
    saved_count: saved,
    signals_seen: sigs.length,
  };
}

export function defaultProfile(persona: Persona = "generic"): UserProfile {
  return deriveProfile({ declared: { persona } });
}

// Per-axis relevance multiplier for a story given the profile (0.6 .. 1.6).
export function axisRelevance(profile: UserProfile, axes: InterestAxis[]): number {
  if (axes.length === 0) return 1;
  let best = 0;
  for (const a of axes) best = Math.max(best, profile.interest_weights[a] ?? 0);
  // weight in [-1,2] -> multiplier in [0.6,1.6]
  return 1 + Math.max(-0.4, Math.min(0.6, best * 0.3));
}
