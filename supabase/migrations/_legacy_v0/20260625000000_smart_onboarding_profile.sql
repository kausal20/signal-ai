-- Signal Phase 2: initial User Intelligence Profile from smart onboarding.
-- Additive only. The learning engine keeps evolving these profiles from
-- behavior after onboarding.

ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS primary_role text,
  ADD COLUMN IF NOT EXISTS primary_goal text,
  ADD COLUMN IF NOT EXISTS interests jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS weekly_time_budget text,
  ADD COLUMN IF NOT EXISTS experience_level text,
  ADD COLUMN IF NOT EXISTS onboarding_completed_at timestamptz,
  ADD COLUMN IF NOT EXISTS onboarding_profile jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_profiles_onboarding_completed
  ON public.user_profiles(onboarding_completed_at DESC)
  WHERE onboarding_completed_at IS NOT NULL;
