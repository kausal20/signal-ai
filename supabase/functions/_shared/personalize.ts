// Signal Intelligence Engine v2.
//
// Everything in this module is pure compute — no extra LLM calls. The
// editorial stage already produced the canonical story; this layer turns one
// story + one user archetype into:
//   - Signal Score 2.0 (multi-dimensional breakdown)
//   - Opportunities (typed, ranked)
//   - Personalized takeaway / action / impact estimate
//   - "Why Signal picked this" transparency line
//
// Persisted at write time inside the existing `signal_v2` jsonb column;
// per-user personalization is applied on read.

import { clampScore } from "./text.ts";
import {
  MAJOR_CAPABILITY_RX, BUSINESS_RX, BUILDER_RX, RESEARCH_RX,
  MARKETING_RX, PRIORITY_ENTITY_RX,
} from "./regex.ts";
import type { ContentCategory, SignalItem, StoryCluster } from "./types.ts";

// ---------------------------------------------------------------------------
// Archetype registry. Each archetype defines: relevance weights per content
// category, weights per signal-2.0 dimension, voice for personalized copy.
// ---------------------------------------------------------------------------
export type Archetype =
  | "developer" | "founder" | "agency" | "student" | "researcher" | "operator" | "generic";

interface ArchetypeProfile {
  label: string;
  voice: string;                     // first-person hint surfaced in why-picked
  categoryWeights: Record<ContentCategory, number>;
  dimensionFocus: Array<keyof SignalScoreV2["dimensions"]>; // which dims matter most
}

const PROFILES: Record<Archetype, ArchetypeProfile> = {
  developer: {
    label: "developer",
    voice: "a working AI developer",
    categoryWeights: {
      "Must Know": 1.0, "Tool of the Day": 1.5, "Workflow of the Day": 1.3,
      "Founder Opportunity": 0.6, "Underrated Tool": 1.4,
      "Market Shift": 0.7, "Research Breakthrough": 1.0,
    },
    dimensionFocus: ["builder_value", "automation_potential", "time_saving", "learning_value"],
  },
  founder: {
    label: "founder",
    voice: "an AI founder shipping a product",
    categoryWeights: {
      "Must Know": 1.2, "Tool of the Day": 1.0, "Workflow of the Day": 1.0,
      "Founder Opportunity": 1.6, "Underrated Tool": 0.9,
      "Market Shift": 1.5, "Research Breakthrough": 0.7,
    },
    dimensionFocus: ["founder_value", "business_value", "news_importance", "opportunity_strength"],
  },
  agency: {
    label: "automation agency",
    voice: "an AI automation agency",
    categoryWeights: {
      "Must Know": 1.0, "Tool of the Day": 1.3, "Workflow of the Day": 1.6,
      "Founder Opportunity": 1.3, "Underrated Tool": 1.4,
      "Market Shift": 1.0, "Research Breakthrough": 0.6,
    },
    dimensionFocus: ["automation_potential", "business_value", "builder_value", "time_saving"],
  },
  student: {
    label: "student",
    voice: "a student learning AI",
    categoryWeights: {
      "Must Know": 1.3, "Tool of the Day": 1.2, "Workflow of the Day": 1.0,
      "Founder Opportunity": 0.7, "Underrated Tool": 1.1,
      "Market Shift": 0.8, "Research Breakthrough": 1.4,
    },
    dimensionFocus: ["learning_value", "news_importance", "builder_value", "career_value"],
  },
  researcher: {
    label: "researcher",
    voice: "an applied ML researcher",
    categoryWeights: {
      "Must Know": 1.1, "Tool of the Day": 0.7, "Workflow of the Day": 0.7,
      "Founder Opportunity": 0.5, "Underrated Tool": 0.8,
      "Market Shift": 0.7, "Research Breakthrough": 1.7,
    },
    dimensionFocus: ["learning_value", "news_importance", "source_reliability"],
  },
  operator: {
    label: "operator",
    voice: "an operator at an AI company",
    categoryWeights: {
      "Must Know": 1.2, "Tool of the Day": 1.0, "Workflow of the Day": 1.2,
      "Founder Opportunity": 1.0, "Underrated Tool": 0.9,
      "Market Shift": 1.4, "Research Breakthrough": 0.8,
    },
    dimensionFocus: ["business_value", "news_importance", "time_saving"],
  },
  generic: {
    label: "AI reader",
    voice: "an AI builder",
    categoryWeights: {
      "Must Know": 1.0, "Tool of the Day": 1.0, "Workflow of the Day": 1.0,
      "Founder Opportunity": 1.0, "Underrated Tool": 1.0,
      "Market Shift": 1.0, "Research Breakthrough": 1.0,
    },
    dimensionFocus: ["builder_value", "business_value", "news_importance"],
  },
};

export function profileFor(archetype: string | null | undefined): ArchetypeProfile {
  const key = (archetype ?? "generic") as Archetype;
  return PROFILES[key] ?? PROFILES.generic;
}

// ---------------------------------------------------------------------------
// Signal Score 2.0 — multi-dimensional breakdown + overall.
// Derived deterministically from the editor's existing 0-100 axis scores so
// no extra AI call is needed.
// ---------------------------------------------------------------------------
export interface SignalScoreV2 {
  overall: number;
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
}

export function computeSignalScoreV2(
  item: Pick<SignalItem,
    "score" | "novelty_score" | "business_impact_score" | "builder_value_score"
    | "adoption_potential_score" | "market_impact_score" | "confidence_score"
    | "opportunity_score" | "corroboration_score" | "leverage_score"
    | "content_category"
  >,
  cluster?: StoryCluster,
  blob?: string,
): SignalScoreV2 {
  const text = (blob ?? "").toLowerCase();
  const builder = item.builder_value_score;
  const business = item.business_impact_score;
  const novelty = item.novelty_score;
  const adoption = item.adoption_potential_score;
  const market = item.market_impact_score;
  const opp = item.opportunity_score;
  const confidence = item.confidence_score;
  const corrob = item.corroboration_score;

  // Derived dimensions (0-100 each).
  const news_importance = clampScore(item.score * 0.7 + novelty * 0.2 + market * 0.1);
  const automation_potential = clampScore(
    (builder * 0.4) + (/agent|workflow|automation|n8n|zapier|browser use|computer use|autonomous/.test(text) ? 35 : 0),
  );
  const career_value = clampScore(
    builder * 0.5 + business * 0.2 + (/hiring|skills|career|salary|jobs/.test(text) ? 25 : 0)
    + (item.content_category === "Tool of the Day" || item.content_category === "Workflow of the Day" ? 10 : 0),
  );
  const founder_value = clampScore(
    business * 0.55 + opp * 0.25 + market * 0.15
    + (item.content_category === "Founder Opportunity" || item.content_category === "Market Shift" ? 15 : 0),
  );
  const learning_value = clampScore(
    novelty * 0.4 + (RESEARCH_RX.test(text) ? 25 : 0)
    + (item.content_category === "Research Breakthrough" || item.content_category === "Must Know" ? 25 : 0),
  );
  const time_saving = clampScore(
    builder * 0.5 + (/cuts|saves|reduces|automate|one[- ]click|background|hours? per|minutes? per/.test(text) ? 30 : 0),
  );
  const source_reliability = clampScore(
    confidence * 0.6 + corrob * 0.3
    + (cluster && cluster.members.some((m) => m.sourceKind === "official") ? 10 : 0),
  );
  const opportunity_strength = clampScore(opp * 0.7 + adoption * 0.2 + business * 0.1);

  const overall = clampScore(
    news_importance * 0.15 + business * 0.15 + builder * 0.15 +
    automation_potential * 0.10 + founder_value * 0.10 +
    opportunity_strength * 0.10 + time_saving * 0.08 +
    source_reliability * 0.08 + learning_value * 0.05 + career_value * 0.04,
  );

  return {
    overall,
    dimensions: {
      news_importance, business_value: business, builder_value: builder,
      automation_potential, career_value, founder_value, learning_value,
      time_saving, confidence, source_reliability, opportunity_strength,
    },
  };
}

// ---------------------------------------------------------------------------
// Opportunity engine — typed opportunities ranked by relevance to the story.
// ---------------------------------------------------------------------------
export type OpportunityKind =
  | "business" | "automation" | "career" | "learning"
  | "investment" | "startup" | "workflow" | "product";

export interface Opportunity {
  kind: OpportunityKind;
  title: string;
  explanation: string;
  difficulty: "low" | "medium" | "high";
  potential_impact: "low" | "medium" | "high";
  confidence: number;        // 0-100
}

export function detectOpportunitiesV2(
  category: ContentCategory,
  blob: string,
  scores: SignalScoreV2,
): Opportunity[] {
  const lower = blob.toLowerCase();
  const out: Opportunity[] = [];

  // Business — pricing/distribution/strategy wedge.
  if (scores.dimensions.business_value >= 60 ||
      category === "Founder Opportunity" || category === "Market Shift") {
    out.push({
      kind: "business",
      title: "Reposition pricing or distribution",
      explanation: "The platform default is shifting; capture the wedge before incumbents notice.",
      difficulty: "medium",
      potential_impact: scores.dimensions.business_value >= 80 ? "high" : "medium",
      confidence: scores.dimensions.confidence,
    });
  }

  // Automation — agent / hands-off workflow.
  if (scores.dimensions.automation_potential >= 60 ||
      /agent|automation|browser use|computer use|n8n|zapier|workflow/.test(lower)) {
    out.push({
      kind: "automation",
      title: "Hand a recurring task to an agent",
      explanation: "This pattern removes a manual step you currently do every week.",
      difficulty: "low",
      potential_impact: scores.dimensions.automation_potential >= 80 ? "high" : "medium",
      confidence: scores.dimensions.confidence,
    });
  }

  // Career — skills/role advantage.
  if (scores.dimensions.career_value >= 65 || /skills|hiring|career|jobs/.test(lower)) {
    out.push({
      kind: "career",
      title: "Build a portfolio piece around this",
      explanation: "Early hands-on experience with this becomes a hiring signal.",
      difficulty: "medium",
      potential_impact: "medium",
      confidence: clampScore(scores.dimensions.confidence - 5),
    });
  }

  // Learning — capability worth understanding.
  if (scores.dimensions.learning_value >= 60 ||
      category === "Research Breakthrough" || category === "Must Know") {
    out.push({
      kind: "learning",
      title: "Read the source and run one experiment",
      explanation: "Understand the mechanism now; it becomes table stakes within a quarter.",
      difficulty: "low",
      potential_impact: "medium",
      confidence: scores.dimensions.source_reliability,
    });
  }

  // Investment — funding / market signal.
  if (/funding|raises|series [abc]|valuation|acquisition|ipo/.test(lower)) {
    out.push({
      kind: "investment",
      title: "Watch this category for capital flow",
      explanation: "Capital tells you which niches investors believe will compound next.",
      difficulty: "low",
      potential_impact: "medium",
      confidence: scores.dimensions.confidence,
    });
  }

  // Startup — wedge for a new venture.
  if (scores.dimensions.founder_value >= 65 || category === "Founder Opportunity") {
    out.push({
      kind: "startup",
      title: "Build a wedge product around the gap",
      explanation: "The adjacent niche is unstaffed by the incumbent — first-mover advantage of 6-12 months.",
      difficulty: "high",
      potential_impact: scores.dimensions.founder_value >= 80 ? "high" : "medium",
      confidence: clampScore(scores.dimensions.confidence - 8),
    });
  }

  // Workflow — repeatable pattern.
  if (category === "Workflow of the Day" || /workflow|pipeline|integrat|orchestrat/.test(lower)) {
    out.push({
      kind: "workflow",
      title: "Replicate this workflow in your stack",
      explanation: "Repeatable agent pattern compounds across your next 3 projects.",
      difficulty: "low",
      potential_impact: "medium",
      confidence: scores.dimensions.confidence,
    });
  }

  // Product — shipping feature upgrade.
  if (scores.dimensions.builder_value >= 65 &&
      (category === "Tool of the Day" || category === "Underrated Tool" ||
       /api|sdk|launch|model release|open weights/.test(lower))) {
    out.push({
      kind: "product",
      title: "Ship a feature your competitors don't have yet",
      explanation: "Drop this into your current product before the rest of the market notices.",
      difficulty: "medium",
      potential_impact: scores.dimensions.builder_value >= 80 ? "high" : "medium",
      confidence: scores.dimensions.confidence,
    });
  }

  // Rank by potential_impact then confidence; cap at 4 so the UI stays scannable.
  const order = { low: 1, medium: 2, high: 3 } as const;
  return out
    .sort((a, b) => (order[b.potential_impact] - order[a.potential_impact]) || (b.confidence - a.confidence))
    .slice(0, 4);
}

// ---------------------------------------------------------------------------
// Impact estimator — never invent exact revenue numbers; return ranges.
// ---------------------------------------------------------------------------
export interface ImpactEstimate {
  time_saved: string;            // "5-15%" / "2-4 hours/week"
  cost_reduction: string;
  productivity_gain: string;
  business_value: "low" | "medium" | "high";
  learning_value: "low" | "medium" | "high";
  automation_value: "low" | "medium" | "high";
  difficulty: "low" | "medium" | "high";
  confidence: number;
}

function band(score: number): "low" | "medium" | "high" {
  if (score >= 75) return "high";
  if (score >= 50) return "medium";
  return "low";
}

export function estimateImpact(scores: SignalScoreV2, category: ContentCategory): ImpactEstimate {
  const d = scores.dimensions;
  const timeSavedRange =
    d.time_saving >= 80 ? "20-40% on the targeted task" :
    d.time_saving >= 60 ? "10-25%" :
    d.time_saving >= 40 ? "5-15%" : "marginal";
  const costRange =
    d.business_value >= 80 ? "10-30% on inference / per-seat costs" :
    d.business_value >= 60 ? "5-15%" : "minimal";
  const productivityRange =
    d.builder_value >= 80 ? "2-4x on the workflow it replaces" :
    d.builder_value >= 60 ? "1.5-2x" :
    d.builder_value >= 40 ? "modest improvement" : "negligible";
  const difficulty =
    category === "Research Breakthrough" || category === "Founder Opportunity" ? "high" :
    category === "Workflow of the Day" || category === "Tool of the Day" ? "low" : "medium";

  return {
    time_saved: timeSavedRange,
    cost_reduction: costRange,
    productivity_gain: productivityRange,
    business_value: band(d.business_value),
    learning_value: band(d.learning_value),
    automation_value: band(d.automation_potential),
    difficulty,
    confidence: d.confidence,
  };
}

// ---------------------------------------------------------------------------
// "Why Signal picked this" — transparent ranking explanation.
// ---------------------------------------------------------------------------
export function whyPicked(item: Pick<SignalItem,
  "leverage_score" | "score" | "confidence_score" | "source_count"
  | "source_label" | "content_category" | "trend_score" | "momentum_score"
>, cluster?: StoryCluster): string {
  const reasons: string[] = [];
  if (item.leverage_score >= 9) reasons.push("Top of the leverage scale (9-10).");
  else if (item.leverage_score >= 8) reasons.push("High leverage signal (8/10).");
  if ((item.source_count ?? 1) >= 3) reasons.push(`Confirmed by ${item.source_count} sources.`);
  else if ((item.source_count ?? 1) >= 2) reasons.push("Confirmed by multiple sources.");
  if (cluster?.members.some((m) => m.sourceKind === "official")) {
    reasons.push(`Direct from ${item.source_label}.`);
  }
  if (item.momentum_score >= 70) reasons.push("Riding a fast-rising trend.");
  if (item.content_category === "Must Know" && item.score >= 88) {
    reasons.push("Industry-defining capability shift.");
  }
  if (item.content_category === "Founder Opportunity") reasons.push("Direct business wedge for founders.");
  if (item.content_category === "Tool of the Day") reasons.push("Tangible builder upgrade this week.");
  if (item.confidence_score >= 85) reasons.push("Very high source confidence.");
  return reasons.slice(0, 4).join(" ") || "Editorial pick for AI builders.";
}

// ---------------------------------------------------------------------------
// Per-user personalized layer — pure compute from archetype + signal_v2.
// Different archetypes produce different copy for the SAME story.
// ---------------------------------------------------------------------------
export interface PersonalizedView {
  takeaway: string;          // "What does this mean for YOU?"
  action: string;            // "What should I do this week?"
  relevance: number;         // 0-100, drives the per-user re-rank
  why_for_you: string;       // short transparency line
}

export function personalizeStory(
  story: Pick<SignalItem,
    "title" | "what_happened" | "opportunity" | "content_category"
    | "trend_entities" | "source_label" | "leverage_score" | "score" | "confidence_score"
  > & { signal_v2: SignalScoreV2 },
  archetype: Archetype,
  entityWeights: Record<string, number> = {},
  categoryWeights: Record<string, number> = {},
): PersonalizedView {
  const profile = profileFor(archetype);
  const d = story.signal_v2.dimensions;

  // Dimension-weighted relevance: pull the dims this archetype cares about.
  const focusAvg = profile.dimensionFocus.reduce((s, k) => s + d[k], 0) / profile.dimensionFocus.length;
  const catWeight =
    (categoryWeights[story.content_category] ?? profile.categoryWeights[story.content_category] ?? 1);
  const entityBoost = story.trend_entities.reduce((s, e) => s + (entityWeights[e] ?? 0), 0);
  const relevance = clampScore(focusAvg * catWeight + entityBoost * 8);

  const takeaway = takeawayFor(archetype, story.content_category, d);
  const action = actionFor(archetype, story.content_category, story.opportunity);
  const why_for_you = whyForYou(archetype, story.content_category, d, story.trend_entities, entityWeights);

  return { takeaway, action, relevance, why_for_you };
}

function takeawayFor(a: Archetype, category: ContentCategory, d: SignalScoreV2["dimensions"]): string {
  if (a === "developer") {
    if (d.time_saving >= 70) return "Cuts a recurring task you do most days.";
    if (d.builder_value >= 75) return "Lets you ship something today that was hard yesterday.";
    if (category === "Research Breakthrough") return "Add this to your reading list — it lands in APIs next quarter.";
    return "Worth a 30-minute prototype this week.";
  }
  if (a === "founder") {
    if (category === "Founder Opportunity" || category === "Market Shift") return "Opens a wedge you can ship a product around.";
    if (d.business_value >= 75) return "Moves your revenue math — cheaper inference or new SKU.";
    if (d.news_importance >= 80) return "Investors will reprice this category; show up before they do.";
    return "Affects your roadmap conversation this week.";
  }
  if (a === "agency") {
    if (d.automation_potential >= 70) return "Productize this as a client retainer offer.";
    if (category === "Workflow of the Day") return "Wrap this workflow into a packaged service.";
    return "Lead with this in your next client pitch.";
  }
  if (a === "student") {
    if (category === "Research Breakthrough" || d.learning_value >= 70) return "Top learning ROI of the day.";
    if (d.builder_value >= 70) return "Build a portfolio project around this on the free tier.";
    return "Watch and bookmark — fundamentals are shifting.";
  }
  if (a === "researcher") {
    if (category === "Research Breakthrough") return "Read the paper; run the eval against your benchmark.";
    if (d.news_importance >= 80) return "Industry baseline moved — citation-worthy.";
    return "Useful context for your current line of work.";
  }
  if (a === "operator") {
    if (d.business_value >= 75 || category === "Market Shift") return "Brief your CEO — this changes our positioning.";
    if (d.time_saving >= 70) return "Pilot this in one team before rolling org-wide.";
    return "Add to next week's strategy sync.";
  }
  return "Worth understanding now, not next month.";
}

function actionFor(a: Archetype, category: ContentCategory, opportunity: string): string {
  // Trim the existing "Try this:" prefix produced by the editor.
  const seed = (opportunity || "").replace(/^try this:\s*/i, "").trim();
  const prefix =
    a === "developer" ? "This week: prototype it in a throwaway branch." :
    a === "founder" ? "This week: write the one-paragraph wedge memo." :
    a === "agency" ? "This week: draft a one-page client offer." :
    a === "student" ? "This week: build a tiny demo and share it." :
    a === "researcher" ? "This week: rerun your strongest eval against this." :
    a === "operator" ? "This week: nominate one team for a 2-week pilot." :
    "This week: spend 30 minutes hands-on.";
  if (!seed) return prefix;
  return `${prefix} Concretely: ${seed.charAt(0).toLowerCase() + seed.slice(1)}`.slice(0, 280);
}

function whyForYou(
  a: Archetype, category: ContentCategory, d: SignalScoreV2["dimensions"],
  entities: string[], entityWeights: Record<string, number>,
): string {
  const bits: string[] = [];
  const profile = profileFor(a);
  const topDim = profile.dimensionFocus.reduce((b, k) => d[k] > d[b] ? k : b, profile.dimensionFocus[0]);
  bits.push(`Matches your ${profile.label} profile (${topDim.replace(/_/g, " ")} ${d[topDim]}/100).`);
  const hot = entities.filter((e) => (entityWeights[e] ?? 0) >= 1.2);
  if (hot.length > 0) bits.push(`You read ${hot[0]} stories often.`);
  if (profile.categoryWeights[category] >= 1.3) bits.push(`"${category}" is one of your top categories.`);
  return bits.join(" ");
}

// ---------------------------------------------------------------------------
// Profile inference: walk user_signals -> derive category + entity weights.
// Called by upsert-profile / personalize-feed. Pure compute over raw signals.
// ---------------------------------------------------------------------------
export interface SignalAggregate {
  opens: number; bookmarks: number; dismisses: number; shares: number;
  perCategory: Record<string, { opens: number; bookmarks: number; dismisses: number }>;
  perEntity: Record<string, number>;     // weighted: bookmark=3, share=4, open=1, dismiss=-2
}

export function aggregateSignals(rows: Array<{
  signal_kind: string; content_category: string | null; trend_entities: string[] | null;
}>): SignalAggregate {
  const agg: SignalAggregate = { opens: 0, bookmarks: 0, dismisses: 0, shares: 0, perCategory: {}, perEntity: {} };
  for (const r of rows) {
    const k = r.signal_kind;
    if (k === "opened") agg.opens++;
    else if (k === "bookmarked") agg.bookmarks++;
    else if (k === "dismissed") agg.dismisses++;
    else if (k === "shared") agg.shares++;

    const cat = r.content_category;
    if (cat) {
      const c = agg.perCategory[cat] ?? (agg.perCategory[cat] = { opens: 0, bookmarks: 0, dismisses: 0 });
      if (k === "opened") c.opens++;
      else if (k === "bookmarked") c.bookmarks++;
      else if (k === "dismissed") c.dismisses++;
    }
    const weight =
      k === "bookmarked" ? 3 :
      k === "shared" ? 4 :
      k === "opened" ? 1 :
      k === "dismissed" ? -2 : 0;
    for (const e of r.trend_entities ?? []) {
      agg.perEntity[e] = (agg.perEntity[e] ?? 0) + weight;
    }
  }
  return agg;
}

export function inferCategoryWeights(agg: SignalAggregate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [cat, c] of Object.entries(agg.perCategory)) {
    // Smoothed: weight rises with bookmarks/opens, falls with dismisses.
    const positive = c.bookmarks * 3 + c.opens;
    const negative = c.dismisses * 2;
    const w = 1 + (positive - negative) / Math.max(8, positive + negative + 8);
    out[cat] = Math.max(0.3, Math.min(2.0, Number(w.toFixed(2))));
  }
  return out;
}

export function inferEntityWeights(agg: SignalAggregate): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [e, score] of Object.entries(agg.perEntity)) {
    // Map raw +/- score into a multiplier centered on 1.0.
    const w = 1 + Math.tanh(score / 8) * 0.6;
    out[e] = Number(w.toFixed(2));
  }
  return out;
}
