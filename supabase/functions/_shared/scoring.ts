// Phase 4 · Module 1 — Smart Scoring Engine (explainable, deterministic).
//
// ADDITIVE EXPLANATION LAYER ONLY. It never changes the ranking score:
// `breakdown.final` is exactly the item's existing `score`. Everything here is
// pure, dependency-free, and deterministic — same input always yields the same
// factors. No LLM, no randomness, no network.
//
// It reconstructs an intuitive, labelled explanation of WHY a story scored the
// way it did, from the dimension scores the pipeline already computed, plus a
// deterministic freshness decay. Each factor carries {label, points,
// description, source} so the UI/Advisor can render "Freshness +18 · Published
// 3h ago" without any recomputation.

export type ConfidenceBand = "Very High" | "High" | "Medium" | "Low";

export interface ScoreFactor {
  /** Short human label, e.g. "Trusted Source". */
  label: string;
  /** Signed contribution to the explanation (illustrative, not the ranking). */
  points: number;
  /** One-line reason, e.g. "Published 3h ago". */
  description: string;
  /** The stored field this factor was derived from, e.g. "published_at". */
  source: string;
}

export interface ScoreBreakdown {
  /** Authoritative ranking score — identical to the item's existing `score`. */
  final: number;
  confidence: number;
  confidence_band: ConfidenceBand;
  freshness: number;          // 0..20 deterministic decay
  source_quality: number;     // 0..15
  developer_value: number;    // 0..100
  founder_value: number;      // 0..100
  investor_value: number;     // 0..100
  learning_value: number;     // 0..100
  factors: ScoreFactor[];     // labelled attribution (explanation only)
}

/** Structural subset of a scored feed item — avoids importing SignalItem. */
export interface ScorableItem {
  score: number;
  confidence_score: number;
  leverage_score: number;
  business_impact_score: number;
  builder_value_score: number;
  novelty_score: number;
  market_impact_score: number;
  adoption_potential_score?: number;
  opportunity_score: number;
  corroboration_score: number;
  trend_score: number;
  momentum_score: number;
  published_at: string;
  source: string;
}

function clamp(n: number, min = 0, max = 100): number {
  return Math.max(min, Math.min(max, Math.round(Number.isFinite(n) ? n : 0)));
}

/** Very High ≥85 · High ≥70 · Medium ≥55 · Low <55. Deterministic bands. */
export function confidenceBand(confidence: number): ConfidenceBand {
  if (confidence >= 85) return "Very High";
  if (confidence >= 70) return "High";
  if (confidence >= 55) return "Medium";
  return "Low";
}

/** Age of a story in whole hours (deterministic, non-negative). */
export function ageHours(publishedAt: string, now = Date.now()): number {
  const t = new Date(publishedAt).getTime();
  if (!Number.isFinite(t)) return 999;
  return Math.max(0, Math.floor((now - t) / 3_600_000));
}

/**
 * Deterministic freshness decay: 20·e^(−ageHours/48), clamped 0..20.
 * ~20 fresh, ~10 at ~1.4 days, ~5 at ~2.8 days. Pure exponential — no buckets.
 */
export function freshnessDecay(publishedAt: string, now = Date.now()): number {
  const h = ageHours(publishedAt, now);
  return clamp(20 * Math.exp(-h / 48), 0, 20);
}

// Source-quality tier by public source string (feed_items has no source_kind).
// Deterministic map; unknown → small default. Mirrors the pipeline's trust idea.
const SOURCE_TIER: Record<string, { q: number; label: string }> = {
  openai: { q: 15, label: "Official lab" }, anthropic: { q: 15, label: "Official lab" },
  google: { q: 15, label: "Official lab" }, deepmind: { q: 15, label: "Official lab" },
  meta: { q: 15, label: "Official lab" }, microsoft: { q: 15, label: "Official lab" },
  nvidia: { q: 14, label: "Official vendor" }, mistral: { q: 14, label: "Official lab" },
  huggingface: { q: 12, label: "Research hub" }, arxiv: { q: 12, label: "Research paper" },
  github: { q: 6, label: "Open-source launch" }, producthunt: { q: 6, label: "Product launch" },
  hn: { q: 3, label: "Community" }, hackernews: { q: 3, label: "Community" },
  reddit: { q: 3, label: "Community" }, blog: { q: 2, label: "Blog" },
};

function sourceQuality(source: string): { q: number; label: string } {
  return SOURCE_TIER[(source ?? "").toLowerCase()] ?? { q: 2, label: "Independent source" };
}

// 0..100 dimension → readable illustrative points (~0..20), so the explanation
// magnitudes line up with freshness/source without implying exact reconstruction.
function pts(dim: number): number {
  return Math.round(clamp(dim) * 0.2);
}

/**
 * Build the explainable breakdown for an already-scored item.
 * `final` is the item's own `score` — the ranking is never recomputed here.
 */
export function buildScoreBreakdown(item: ScorableItem, now = Date.now()): ScoreBreakdown {
  const freshness = freshnessDecay(item.published_at, now);
  const src = sourceQuality(item.source);
  const h = ageHours(item.published_at, now);

  const developer_value = clamp(item.builder_value_score);
  const founder_value = clamp(item.business_impact_score);
  const investor_value = clamp(item.market_impact_score);
  const learning_value = clamp(item.novelty_score);

  const factors: ScoreFactor[] = [];
  const push = (label: string, points: number, description: string, source: string) => {
    if (points > 0) factors.push({ label, points, description, source });
  };

  push("Freshness", freshness, h <= 1 ? "Published in the last hour" : `Published ${h}h ago`, "published_at");
  push("Source quality", src.q, src.label, "source");
  push("Leverage", clamp(item.leverage_score, 0, 10) * 2, "Core leverage from the 10-question editorial test", "leverage_score");
  push("Business value", pts(item.business_impact_score), "Revenue, market, or founder opportunity", "business_impact_score");
  push("Developer value", pts(item.builder_value_score), "Directly useful to builders and engineers", "builder_value_score");
  push("Novelty", pts(item.novelty_score), "Genuinely new capability or approach", "novelty_score");
  push("Trend momentum", pts(Math.max(item.trend_score, item.momentum_score)), "The AI ecosystem is actively moving here", "trend_score");
  push("Opportunity", pts(item.opportunity_score), "Actionable opportunity detected", "opportunity_score");
  push("Corroboration", pts(item.corroboration_score), "Reported by multiple independent sources", "corroboration_score");

  factors.sort((a, b) => b.points - a.points);

  return {
    final: item.score,
    confidence: clamp(item.confidence_score),
    confidence_band: confidenceBand(item.confidence_score),
    freshness,
    source_quality: src.q,
    developer_value,
    founder_value,
    investor_value,
    learning_value,
    factors,
  };
}
