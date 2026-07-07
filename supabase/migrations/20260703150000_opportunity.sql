-- Phase 4 · Module 4 — Opportunity Intelligence (additive, non-destructive).
-- Caches the story-level actionable Opportunity object. Named `opportunity_intel`
-- to avoid colliding with the existing `opportunity` TEXT column (editorial
-- sentence). Personalization is read-time over this cache. Explanation only —
-- never affects ranking or Modules 1/2/8.

ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS opportunity_intel jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS opportunity_type  text;

COMMENT ON COLUMN public.feed_items.opportunity_intel IS 'Module 4 Opportunity {type,recommended_action,who_should_act,urgency,time_window,values,risk,reasoning[]}. Cached once/story; personalized read-time. Additive — never affects ranking. Distinct from the existing `opportunity` text column.';
COMMENT ON COLUMN public.feed_items.opportunity_type IS 'Primary opportunity type (queryable). NULL when no actionable opportunity.';
