-- Phase 4 · Module 5 — Continuous Learning (additive, non-destructive).
-- Derived, explainable learning signals persisted alongside the existing
-- learning memory. Extends user_profiles; does NOT change any existing column
-- or the ranking. Computed incrementally after each learn cycle.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS dimension_confidence jsonb  NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS clusters             text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS opportunity_weights  jsonb  NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.user_profiles.dimension_confidence IS 'Module 5 per-dimension confidence 0..100 (developer/founder/investor/...). Derived from interaction evidence.';
COMMENT ON COLUMN public.user_profiles.clusters IS 'Module 5 multi-label user clusters (AI Builder, Agent Developer, Founder, ...).';
COMMENT ON COLUMN public.user_profiles.opportunity_weights IS 'Module 5 opportunity-type affinity 0..100, derived from interest axes.';
