-- Phase 4 · Module 1 — explainable scoring (additive, non-destructive).
-- Adds an explanation layer to feed_items WITHOUT touching the ranking score.
-- `score` remains the authoritative ranking value; these columns only explain it.

ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS score_factors    jsonb   NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS freshness_score  integer,
  ADD COLUMN IF NOT EXISTS confidence_band  text,
  ADD COLUMN IF NOT EXISTS developer_value  integer,
  ADD COLUMN IF NOT EXISTS founder_value    integer,
  ADD COLUMN IF NOT EXISTS investor_value   integer,
  ADD COLUMN IF NOT EXISTS learning_value   integer;

COMMENT ON COLUMN public.feed_items.score_factors IS 'Explainable per-factor score attribution [{label,points,description,source}]. Explanation only — never affects ranking.';
COMMENT ON COLUMN public.feed_items.confidence_band IS 'Very High | High | Medium | Low, derived from confidence_score.';
