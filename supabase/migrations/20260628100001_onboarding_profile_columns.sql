-- Signal — Phase 2 · onboarding profile columns
-- Purpose: persist the onboarding answers the `save-onboarding-profile` Edge
-- function collects. Phase-1 user_profiles only modelled the learning-loop
-- fields; these add the declared onboarding inputs so the upsert succeeds.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS primary_role          text,
  ADD COLUMN IF NOT EXISTS primary_goal          text,
  ADD COLUMN IF NOT EXISTS interests             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weekly_time_budget    text,
  ADD COLUMN IF NOT EXISTS experience_level      text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_profile    jsonb;

COMMENT ON COLUMN public.user_profiles.primary_role IS 'Declared role from onboarding (founder/developer/…).';
COMMENT ON COLUMN public.user_profiles.primary_goal IS 'Declared primary goal from onboarding.';
COMMENT ON COLUMN public.user_profiles.interests IS 'Declared interest topics (jsonb array) from onboarding.';
COMMENT ON COLUMN public.user_profiles.onboarding_completed_at IS 'Timestamp the user finished onboarding.';
