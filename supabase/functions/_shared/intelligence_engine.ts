// Signal Intelligence Engine — turns a stored, editor-approved story into a
// per-user DECISION: what it means for THIS user and what to do next.
//
// Pure deterministic compute over already-AI-generated fields. ZERO new AI
// calls — reuses the editorial output stored on feed_items. Runs at read time
// inside the `personalize` function, so every user gets a different result.

import { type UserProfile, type Persona, type InterestAxis, storyAxes, axisRelevance } from "./profile.ts";

// Subset of feed_items columns the engine needs.
export interface StoredStory {
  id: string;
  title: string;
  summary: string;
  what_happened?: string | null;
  why_it_matters?: string | null;
  who_for?: string | null;
  opportunity?: string | null;
  action?: string | null;
  risk?: string | null;
  who_benefits?: string | null;
  expected_impact?: string | null;
  time_horizon?: string | null;
  content_category?: string | null;
  category?: string | null;
  tag?: string | null;
  url: string;
  impact?: string | null;
  source_label?: string | null;
  source_count?: number | null;
  published_at: string;
  ranking_reason?: string | null;
  trend_entities?: string[] | null;
  // raw dimensions
  score?: number | null;
  novelty_score?: number | null;
  business_impact_score?: number | null;
  builder_value_score?: number | null;
  adoption_potential_score?: number | null;
  market_impact_score?: number | null;
  confidence_score?: number | null;
  opportunity_score?: number | null;
  corroboration_score?: number | null;
  leverage_score?: number | null;
  trend_score?: number | null;
  momentum_score?: number | null;
}

export type Level = "Low" | "Medium" | "High";
function level(n: number): Level { return n >= 70 ? "High" : n >= 40 ? "Medium" : "Low"; }
function range(lowPct: number, highPct: number): string { return `${lowPct}–${highPct}%`; }
function clamp(n: number): number { return Math.max(0, Math.min(100, Math.round(n))); }

// =====================================================================
// SIGNAL SCORE 2.0 — multi-dimensional, persona-weighted.
// =====================================================================
export interface SignalScore2 {
  dimensions: {
    news_importance: number;
    business_value: number;
    builder_value: number;
    automation_potential: number;
    career_value: number;
    founder_value: number;
    learning_value: number;
    time_saving: number;
    confidence: number;
    source_reliability: number;
    opportunity_strength: number;
  };
  overall: number;          // persona-weighted 0..100
}

function automationPotential(s: StoredStory): number {
  const blob = `${s.summary} ${s.what_happened ?? ""} ${(s.trend_entities ?? []).join(" ")}`.toLowerCase();
  let n = (s.builder_value_score ?? 0) * 0.5;
  if (/agent|automation|workflow|n8n|zapier|browser use|computer use|autonomous|background/.test(blob)) n += 40;
  return clamp(n);
}

export function signalScore2(s: StoredStory, profile: UserProfile): SignalScore2 {
  const novelty = s.novelty_score ?? 0;
  const business = s.business_impact_score ?? 0;
  const builder = s.builder_value_score ?? 0;
  const adoption = s.adoption_potential_score ?? 0;
  const market = s.market_impact_score ?? 0;
  const confidence = s.confidence_score ?? 0;
  const corroboration = s.corroboration_score ?? 0;
  const opportunity = s.opportunity_score ?? 0;
  const leverage = (s.leverage_score ?? 0) * 10;

  const dims = {
    news_importance: clamp(leverage * 0.6 + (s.impact === "critical" ? 40 : s.impact === "major" ? 25 : 10)),
    business_value: clamp(business),
    builder_value: clamp(builder),
    automation_potential: automationPotential(s),
    career_value: clamp(builder * 0.4 + novelty * 0.3 + adoption * 0.3),
    founder_value: clamp(business * 0.6 + opportunity * 0.4),
    learning_value: clamp(novelty * 0.6 + (/(research|benchmark|paper)/i.test(s.content_category ?? "") ? 35 : 10)),
    time_saving: clamp(builder * 0.5 + automationPotential(s) * 0.4),
    confidence: clamp(confidence),
    source_reliability: clamp(corroboration * 0.6 + confidence * 0.4),
    opportunity_strength: clamp(opportunity),
  };

  // Persona weights over the 11 dimensions.
  const W = personaWeights(profile.persona);
  let num = 0, den = 0;
  for (const k of Object.keys(dims) as (keyof typeof dims)[]) {
    const w = W[k] ?? 1;
    num += dims[k] * w;
    den += w;
  }
  let overall = den ? num / den : 0;
  // Interest-fit multiplier from behaviour.
  const axes = storyAxes(s.content_category ?? "", s.category ?? "", s.trend_entities ?? []);
  overall *= axisRelevance(profile, axes);
  return { dimensions: dims, overall: clamp(overall) };
}

function personaWeights(p: Persona): Record<string, number> {
  switch (p) {
    case "developer":  return { builder_value: 3, time_saving: 2.5, automation_potential: 1.5, learning_value: 1.5, news_importance: 1.5, confidence: 1, source_reliability: 1, business_value: 0.5, founder_value: 0.3, career_value: 1, opportunity_strength: 1 };
    case "founder":    return { business_value: 3, founder_value: 3, opportunity_strength: 2.5, news_importance: 1.5, market_value: 1, automation_potential: 1, builder_value: 1, confidence: 1.2, source_reliability: 1.2, time_saving: 1, learning_value: 0.6, career_value: 0.6 };
    case "agency":     return { automation_potential: 3, opportunity_strength: 2.5, business_value: 2, builder_value: 1.5, time_saving: 2, news_importance: 1, confidence: 1, source_reliability: 1, founder_value: 1, learning_value: 0.6, career_value: 0.6 };
    case "student":    return { learning_value: 3, builder_value: 1.5, news_importance: 1.5, time_saving: 1, career_value: 2, confidence: 1, source_reliability: 1, business_value: 0.5, opportunity_strength: 0.8, automation_potential: 0.8, founder_value: 0.4 };
    case "researcher": return { learning_value: 3, news_importance: 2, confidence: 2, source_reliability: 2, builder_value: 1, business_value: 0.5, opportunity_strength: 0.6, automation_potential: 0.6, time_saving: 0.6, career_value: 1, founder_value: 0.4 };
    case "operator":   return { automation_potential: 2.5, time_saving: 2.5, business_value: 2, opportunity_strength: 1.5, builder_value: 1.5, news_importance: 1, confidence: 1, source_reliability: 1, founder_value: 1, learning_value: 0.8, career_value: 0.8 };
    default:           return { news_importance: 1.5, business_value: 1, builder_value: 1, opportunity_strength: 1, confidence: 1, source_reliability: 1, automation_potential: 1, time_saving: 1, learning_value: 1, career_value: 1, founder_value: 1 };
  }
}

// =====================================================================
// PERSONALIZED TAKEAWAY — "What does this mean for YOU?"
// =====================================================================
export function personalizedTakeaway(s: StoredStory, profile: UserProfile): string {
  const blob = `${s.summary} ${s.what_happened ?? ""} ${s.opportunity ?? ""}`.toLowerCase();
  const subject = topicLabel(blob, s);
  switch (profile.persona) {
    case "developer":
      return `${subject} can cut your build time — wire it into your stack and ship the next feature faster.`;
    case "founder":
      return `${subject} could lower your operating cost or open a new revenue line — worth a same-week evaluation.`;
    case "agency":
      return `${subject} is a packageable client service — productize it before competitors notice the demand.`;
    case "student":
      return `${subject} makes learning AI cheaper and faster — a low-cost way to build a portfolio project.`;
    case "researcher":
      return `${subject} is worth tracking for your work — check whether the method transfers to your benchmarks.`;
    case "operator":
      return `${subject} can remove a recurring manual step — pilot it on one workflow and measure the hours saved.`;
    default:
      return `${subject} matters for how you build and operate — test it before it becomes table stakes.`;
  }
}

function topicLabel(blob: string, s: StoredStory): string {
  if (/voice|speech|tts|stt/.test(blob)) return "This voice-AI move";
  if (/video|image|generative|diffusion/.test(blob)) return "This generative-media update";
  if (/agent|automation|workflow|mcp/.test(blob)) return "This agent/automation update";
  if (/model|gpt|claude|gemini|llama/.test(blob)) return "This model update";
  if (/funding|raise|acquisition|revenue/.test(blob)) return "This market move";
  return `This ${(s.content_category ?? "AI").toLowerCase()} update`;
}

// =====================================================================
// OPPORTUNITY ENGINE — up to 8 typed opportunities.
// =====================================================================
export type OpportunityType =
  | "Business" | "Automation" | "Career" | "Learning"
  | "Investment" | "Startup" | "Workflow" | "Product";

export interface Opportunity {
  type: OpportunityType;
  title: string;
  explanation: string;
  difficulty: Level;
  potential_impact: Level;
  confidence: Level;
}

export function detectOpportunities(s: StoredStory): Opportunity[] {
  const blob = `${s.summary} ${s.what_happened ?? ""} ${s.opportunity ?? ""} ${(s.trend_entities ?? []).join(" ")}`.toLowerCase();
  const conf = level(s.confidence_score ?? 0);
  const out: Opportunity[] = [];
  const add = (type: OpportunityType, title: string, explanation: string, diff: Level, imp: Level) =>
    out.push({ type, title, explanation, difficulty: diff, potential_impact: imp, confidence: conf });

  if (/business|revenue|pricing|enterprise|gtm|customer|sales|market/.test(blob) || (s.business_impact_score ?? 0) >= 60)
    add("Business", "New revenue or cost angle", "Use this shift to reprice, cut a cost, or open a new line.", "Medium", level(s.business_impact_score ?? 0));
  if (/agent|automation|workflow|n8n|zapier|browser use|computer use|autonomous/.test(blob))
    add("Automation", "Automate a recurring task", "Hand a repetitive process to an agent and reclaim hours.", "Medium", level((s.builder_value_score ?? 0)));
  if (/skill|learn|tutorial|course|technique|model|reasoning/.test(blob) || (s.novelty_score ?? 0) >= 60)
    add("Learning", "Skill worth picking up", "Understand this now; it becomes a baseline expectation soon.", "Low", level(s.novelty_score ?? 0));
  if (/api|sdk|tool|launch|open weights|framework/.test(blob))
    add("Workflow", "Upgrade your build workflow", "Slot this into your pipeline to ship faster than manual teams.", "Low", level(s.builder_value_score ?? 0));
  if (/funding|raise|acquisition|valuation|series|seed/.test(blob))
    add("Investment", "Capital-flow signal", "Where money moves signals which categories will compound.", "High", level(s.market_impact_score ?? 0));
  if (/startup|founder|niche|gap|launch hn|yc/.test(blob) || (s.content_category ?? "") === "Founder Opportunity")
    add("Startup", "Wedge for a new startup", "An underserved niche opens here — build before incumbents react.", "High", level(s.opportunity_score ?? 0));
  if (/product|feature|ux|consumer|app/.test(blob))
    add("Product", "Product feature to add", "Fold this capability into your product to differentiate.", "Medium", level(s.adoption_potential_score ?? 0));
  if (/career|hiring|role|job|in-demand|engineer/.test(blob))
    add("Career", "Career positioning", "Skills around this are increasingly in demand — position early.", "Low", level(s.adoption_potential_score ?? 0));

  // Always guarantee at least one opportunity so the card is never empty.
  if (out.length === 0) {
    add("Learning", "Stay-ahead signal", "Track this so you are not caught off-guard as it spreads.", "Low", level(s.score ?? 50));
  }
  return out.slice(0, 8);
}

// =====================================================================
// ACTION ENGINE — "What should I do this week?"
// =====================================================================
export function actionForUser(s: StoredStory, profile: UserProfile): string {
  // Prefer the editor's concrete "Try this:" action when present.
  const stored = (s.action ?? "").replace(/^try this:\s*/i, "").trim();
  const blob = `${s.summary} ${s.what_happened ?? ""}`.toLowerCase();
  const verb = profile.persona === "founder" ? "Evaluate"
    : profile.persona === "agency" ? "Package"
    : profile.persona === "student" ? "Learn"
    : profile.persona === "researcher" ? "Test"
    : "Try";
  if (stored) return `${verb}: ${stored}`.slice(0, 240);
  if (/voice|tts|stt/.test(blob)) return `${verb} replacing your speech pipeline with this and benchmark latency.`;
  if (/agent|mcp|automation/.test(blob)) return `${verb} this in one agent workflow this week and measure time saved.`;
  if (/model|gpt|claude|gemini/.test(blob)) return `${verb} this model on a real task (e.g. support replies) before switching defaults.`;
  return `${verb} this on a small project this week and decide if it earns a place in your stack.`;
}

// =====================================================================
// IMPACT ESTIMATOR — realistic ranges, never invented exact numbers.
// =====================================================================
export interface ImpactEstimate {
  time_saved: string;
  cost_reduction: string;
  productivity_gain: string;
  business_value: Level;
  learning_value: Level;
  automation_value: Level;
  difficulty: Level;
  confidence: Level;
}

export function estimateImpact(s: StoredStory): ImpactEstimate {
  const builder = s.builder_value_score ?? 0;
  const auto = automationPotential(s);
  const business = s.business_impact_score ?? 0;
  const time = Math.max(builder, auto);
  return {
    time_saved: time >= 70 ? range(20, 40) : time >= 40 ? range(10, 25) : range(5, 15),
    cost_reduction: business >= 70 ? range(15, 35) : business >= 40 ? range(8, 20) : range(3, 10),
    productivity_gain: range(Math.round(time * 0.15) + 5, Math.round(time * 0.3) + 15),
    business_value: level(business),
    learning_value: level(s.novelty_score ?? 0),
    automation_value: level(auto),
    difficulty: time >= 70 ? "Low" : time >= 40 ? "Medium" : "High",
    confidence: level(s.confidence_score ?? 0),
  };
}

// =====================================================================
// WHY SIGNAL PICKED THIS — transparent explanation.
// =====================================================================
export function whyPicked(s: StoredStory): string[] {
  const reasons: string[] = [];
  if ((s.source_count ?? 1) >= 3) reasons.push("Confirmed by multiple trusted sources.");
  else if ((s.corroboration_score ?? 0) >= 60) reasons.push("Corroborated across independent sources.");
  if ((s.confidence_score ?? 0) >= 80) reasons.push("High source confidence.");
  if (s.impact === "critical") reasons.push("Major AI development.");
  if ((s.business_impact_score ?? 0) >= 70) reasons.push("Creates immediate business opportunities.");
  if ((s.builder_value_score ?? 0) >= 70) reasons.push("High impact for builders and developers.");
  if ((s.adoption_potential_score ?? 0) >= 70) reasons.push("Rapid market adoption likely.");
  if ((s.momentum_score ?? 0) >= 70) reasons.push("Part of a fast-rising trend.");
  if ((s.leverage_score ?? 0) >= 9) reasons.push("Passed the highest editorial leverage bar.");
  if (reasons.length === 0) reasons.push("Cleared Signal's editorial quality gate.");
  return reasons.slice(0, 4);
}

// Pipeline-time, persona-agnostic enrichment: stamp the transparent
// "Why Signal Picked This" into ranking_reason so it's stored with the story.
// Operates in-place on the editorial SignalItem objects (same numeric fields).
export function annotateDecisionReadiness(items: Array<Record<string, unknown>>): void {
  for (const it of items) {
    const reasons = whyPicked(it as unknown as StoredStory);
    const why = reasons.join(" ");
    const existing = String((it as any).ranking_reason ?? "");
    // Keep the leverage tag, prepend the transparent reasons. Cap to 280.
    const leverageTag = existing.match(/^\[\d+\/10 leverage\]/)?.[0] ?? "";
    (it as any).ranking_reason = `${leverageTag} ${why}`.trim().slice(0, 280);
  }
}

// =====================================================================
// FULL DECISION CARD per story per user.
// =====================================================================
export interface IntelligenceCard {
  id: string;
  headline: string;
  what_happened: string;
  why_it_matters: string;
  who_should_care: string;
  personalized_takeaway: string;
  opportunities: Opportunity[];
  action: string;
  estimated_impact: ImpactEstimate;
  confidence: Level;
  signal_score: number;
  signal_score_breakdown: SignalScore2["dimensions"];
  why_signal_picked_this: string[];
  url: string;
  content_category: string;
  trend_note?: string;
}

export function buildCard(s: StoredStory, profile: UserProfile): IntelligenceCard {
  const score2 = signalScore2(s, profile);
  return {
    id: s.id,
    headline: s.title,
    what_happened: s.what_happened ?? s.summary,
    why_it_matters: (s.why_it_matters ?? "").replace(/\s*Opportunity:.*$/i, "").trim() || s.summary,
    who_should_care: s.who_for ?? "AI builders",
    personalized_takeaway: personalizedTakeaway(s, profile),
    opportunities: detectOpportunities(s),
    action: actionForUser(s, profile),
    estimated_impact: estimateImpact(s),
    confidence: level(s.confidence_score ?? 0),
    signal_score: score2.overall,
    signal_score_breakdown: score2.dimensions,
    why_signal_picked_this: whyPicked(s),
    url: s.url,
    content_category: s.content_category ?? "Must Know",
    trend_note: futureMemoryNote(s),
  };
}

// =====================================================================
// FUTURE MEMORY — context note carried from the editorial trend layer.
// expected_impact already holds the trend insight (rankItems prepends it).
// =====================================================================
export function futureMemoryNote(s: StoredStory): string | undefined {
  const ei = s.expected_impact ?? "";
  const m = ei.match(/^[^.]*(fastest-rising|signal in the last two weeks|momentum is cooling)[^.]*\./i);
  return m ? m[0] : undefined;
}

// =====================================================================
// DAILY AI ADVISOR — strategist-style end-of-day brief.
// =====================================================================
export interface DailyAdvisor {
  top_3_things_to_know: Array<{ id: string; headline: string; takeaway: string }>;
  best_opportunity_today: { id: string; opportunity: Opportunity; headline: string } | null;
  tool_worth_trying: { id: string; headline: string; action: string } | null;
  one_action_to_take: string | null;
  one_skill_to_learn: string | null;
  one_trend_to_watch: string | null;
  generated_at: string;
}

export function dailyAdvisor(cards: IntelligenceCard[], stories: StoredStory[]): DailyAdvisor {
  const byId = new Map(stories.map((s) => [s.id, s]));
  const ranked = [...cards].sort((a, b) => b.signal_score - a.signal_score);

  const top3 = ranked.slice(0, 3).map((c) => ({
    id: c.id, headline: c.headline, takeaway: c.personalized_takeaway,
  }));

  // Best opportunity = highest impact across all cards.
  let best: DailyAdvisor["best_opportunity_today"] = null;
  let bestRank = -1;
  for (const c of ranked) {
    for (const o of c.opportunities) {
      const r = (o.potential_impact === "High" ? 3 : o.potential_impact === "Medium" ? 2 : 1)
        + (o.confidence === "High" ? 1.5 : o.confidence === "Medium" ? 1 : 0.5);
      if (r > bestRank) { bestRank = r; best = { id: c.id, opportunity: o, headline: c.headline }; }
    }
  }

  const tool = ranked.find((c) => {
    const s = byId.get(c.id);
    return s && (s.tag === "tool" || /tool of the day|underrated tool/i.test(c.content_category));
  });
  const toolPick = tool ? { id: tool.id, headline: tool.headline, action: tool.action } : null;

  const oneAction = ranked[0]?.action ?? null;
  const learn = ranked.find((c) => c.signal_score_breakdown.learning_value >= 55);
  const oneSkill = learn ? `Learn what powers "${learn.headline}".` : (ranked[0] ? `Skim the top story and note one new concept.` : null);
  const trendCard = cards.find((c) => c.trend_note);
  const oneTrend = trendCard?.trend_note ?? (ranked[0] ? `Watch ${ranked[0].content_category.toLowerCase()} momentum this week.` : null);

  return {
    top_3_things_to_know: top3,
    best_opportunity_today: best,
    tool_worth_trying: toolPick,
    one_action_to_take: oneAction,
    one_skill_to_learn: oneSkill,
    one_trend_to_watch: oneTrend,
    generated_at: new Date().toISOString(),
  };
}
