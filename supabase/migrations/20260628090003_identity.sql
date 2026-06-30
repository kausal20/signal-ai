-- ============================================================================
-- Signal — Phase 1 Foundation · 0003 IDENTITY
-- Tables: clients, user_profiles
-- Purpose: the identity spine. `clients` is the anonymous device identity every
-- piece of personalized data hangs off; it links to auth.users when a user
-- eventually signs up (premium). `user_profiles` is the single canonical learned
-- profile, keyed 1:1 to a client.
-- ============================================================================

-- ── clients ────────────────────────────────────────────────────────────────
-- Stores: one row per anonymous device/browser (stable client_id the frontend
-- generates), optionally linked to an authenticated user.
-- Why: bridges anonymous usage → authenticated/premium without losing history.
CREATE TABLE IF NOT EXISTS public.clients (
  client_id    text PRIMARY KEY,
  user_id      uuid REFERENCES auth.users (id) ON DELETE SET NULL,  -- nullable; set on sign-up
  platform     text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.clients IS 'Anonymous device identity; links to auth.users on sign-up. Spine of all per-user data.';
COMMENT ON COLUMN public.clients.user_id IS 'FK auth.users — null until the device signs in (premium).';

-- ── user_profiles ────────────────────────────────────────────────────────────
-- Stores: the evolving learned + declared profile (persona, interest weights,
-- semantic concept affinity, behavioural counters, watermark).
-- Why: lets the Learning Engine personalize without recomputing from scratch.
-- Canonical single definition (no duplicate profile tables).
CREATE TABLE IF NOT EXISTS public.user_profiles (
  client_id        text PRIMARY KEY REFERENCES public.clients (client_id) ON DELETE CASCADE,
  persona          text NOT NULL DEFAULT 'generic',          -- developer|founder|agency|student|researcher|marketer|investor|builder|operator|generic
  inferred_role    text,
  skill_level      text NOT NULL DEFAULT 'intermediate'
                     CHECK (skill_level IN ('beginner','intermediate','advanced')),
  role             text,
  interest_weights jsonb NOT NULL DEFAULT '{}'::jsonb,        -- axis -> running weight
  concept_affinity jsonb NOT NULL DEFAULT '{}'::jsonb,        -- concept -> weight (semantic memory)
  persona_mix      jsonb NOT NULL DEFAULT '{}'::jsonb,        -- persona -> share (multi-persona)
  companies        jsonb NOT NULL DEFAULT '{}'::jsonb,
  technologies     jsonb NOT NULL DEFAULT '{}'::jsonb,
  searches         jsonb NOT NULL DEFAULT '[]'::jsonb,
  revisit_counts   jsonb NOT NULL DEFAULT '{}'::jsonb,
  signal_count     integer NOT NULL DEFAULT 0,
  opened_count     integer NOT NULL DEFAULT 0,
  saved_count      integer NOT NULL DEFAULT 0,
  dismissed_count  integer NOT NULL DEFAULT 0,
  avg_reading_ms   integer NOT NULL DEFAULT 0,
  reading_ms_total bigint  NOT NULL DEFAULT 0,
  last_signal_at   timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.user_profiles IS 'Canonical evolving per-client profile used by the Learning + Personalization engines.';

DROP TRIGGER IF EXISTS trg_user_profiles_updated_at ON public.user_profiles;
CREATE TRIGGER trg_user_profiles_updated_at
  BEFORE UPDATE ON public.user_profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
