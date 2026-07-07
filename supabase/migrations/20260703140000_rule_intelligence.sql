-- Phase 4 · Module 8 — Rule Engine (additive, non-destructive).
-- Stores merged rule intelligence + matched rule ids. Explanation/observability
-- only — it does NOT change ranking, confidence, Module 1, or Module 2.

ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS rule_intelligence jsonb  NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS matched_rules     text[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.feed_items.rule_intelligence IS 'Module 8 MergedIntelligence {matched_rules,opportunity_boost,developer/founder/investor/learning_value,urgency,tags,categories,recommendations,reasoning,conflicts}. Additive — never affects ranking.';
COMMENT ON COLUMN public.feed_items.matched_rules IS 'Rule ids that matched (queryable index of rule hits).';
