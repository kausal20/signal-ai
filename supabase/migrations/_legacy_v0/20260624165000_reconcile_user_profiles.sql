-- =====================================================================
-- HOTFIX: reconcile the user_profiles schema after a duplicate-version
-- migration conflict (two files both versioned 20260624160000 created
-- incompatible user_profiles tables).
--
-- Resolution:
--   * Canonical schema = the V2 "learning" model (persona / interest_weights /
--     companies / technologies / searches / *_count / last_signal_at ...) which
--     is the ONLY schema the runtime (_shared/learning.ts) reads and writes.
--   * The other (archetype / category_weights / entity_weights / *_total) model
--     is referenced by NO runtime DB query.
--
-- This migration is idempotent and runs on every database regardless of which
-- 160000 variant was applied (or none, on a fresh DB where 160000 already
-- created the canonical table). It ADDs any missing canonical columns, backfills
-- data from the legacy archetype columns if they exist (preserving user data),
-- and re-creates the additive feed_items.signal_v2 / why_picked columns that
-- the legacy migration contributed. No application logic is changed. No data is
-- dropped.
-- =====================================================================

-- 0. Guarantee the table exists (no-op if a 160000 variant already created it).
CREATE TABLE IF NOT EXISTS public.user_profiles (
  client_id text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- 1. Ensure every CANONICAL column exists (these are what learning.ts upserts).
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS persona text NOT NULL DEFAULT 'generic',
  ADD COLUMN IF NOT EXISTS skill_level text NOT NULL DEFAULT 'intermediate',
  ADD COLUMN IF NOT EXISTS role text,
  ADD COLUMN IF NOT EXISTS interest_weights jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS companies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS technologies jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS searches jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS signal_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS opened_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS saved_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS dismissed_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS avg_reading_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_signal_id uuid,
  ADD COLUMN IF NOT EXISTS last_signal_at timestamptz,
  ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- V3/V4 columns are added by their own later migrations (170000+) with
-- IF NOT EXISTS; nothing to do here for those.

-- 2. Preserve user data from the legacy archetype schema, if that variant ran.
--    Only fills canonical columns that are still at their default, so re-runs
--    and mixed states are safe.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='user_profiles' AND column_name='archetype') THEN
    UPDATE public.user_profiles
       SET persona = archetype
     WHERE (persona IS NULL OR persona = 'generic')
       AND archetype IS NOT NULL AND archetype <> 'generic';
  END IF;

  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='user_profiles' AND column_name='opens_total') THEN
    UPDATE public.user_profiles SET opened_count = GREATEST(opened_count, opens_total)
      WHERE opens_total > opened_count;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='user_profiles' AND column_name='bookmarks_total') THEN
    UPDATE public.user_profiles SET saved_count = GREATEST(saved_count, bookmarks_total)
      WHERE bookmarks_total > saved_count;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name='user_profiles' AND column_name='dismisses_total') THEN
    UPDATE public.user_profiles SET dismissed_count = GREATEST(dismissed_count, dismisses_total)
      WHERE dismisses_total > dismissed_count;
  END IF;
  -- Roll the running signal_count forward from whatever totals exist.
  UPDATE public.user_profiles
     SET signal_count = GREATEST(signal_count, opened_count + saved_count + dismissed_count)
   WHERE signal_count < opened_count + saved_count + dismissed_count;
END $$;

-- 3. Canonical RLS policy (service-role only). Idempotent.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
                 AND tablename='user_profiles' AND policyname='no direct user profile access') THEN
    CREATE POLICY "no direct user profile access" ON public.user_profiles FOR SELECT USING (false);
  END IF;
END $$;

-- 4. Preserve the additive feed_items columns the legacy migration contributed
--    (so databases that never ran it still get them). Harmless + additive.
ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS signal_v2 jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS why_picked text;
CREATE INDEX IF NOT EXISTS idx_feed_items_signal_v2_gin
  ON public.feed_items USING gin (signal_v2);
