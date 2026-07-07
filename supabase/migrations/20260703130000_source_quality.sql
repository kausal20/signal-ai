-- Phase 4 · Module 2 — Source Quality Engine (additive, non-destructive).
-- Stores the explainable per-story source-quality object. Explanation/observability
-- only — it does NOT change ranking, confidence, or Module 1 scoring.

ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS source_quality jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.feed_items.source_quality IS 'Module 2 SourceQuality {tier,quality_score,confidence,official,bias_risk,original_reporting,verification,spam_risk,reasoning[]}. Additive — never affects ranking.';
