-- Signal Intelligence Engine V2.
-- Two-layer design:
--   1. story_intelligence — deep LLM reasoning computed ONCE per story,
--      reused across every user (8 persona variants live inside one row).
--   2. user_profiles — persistent, continuously-evolving per-user memory so
--      the Learning Engine never recomputes from scratch.
-- Additive only. Existing infra / monitoring / reliability untouched.

-- =============================================================
-- 1. Reusable story-level reasoning (one row per feed_item).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.story_intelligence (
  feed_item_id text PRIMARY KEY,
  intelligence jsonb NOT NULL,          -- full StoryIntelligence object
  significance integer NOT NULL DEFAULT 0,
  trend_name text,
  trend_direction text,
  model text,
  degraded boolean NOT NULL DEFAULT false,   -- true if produced by fallback (no LLM)
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.story_intelligence ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='story_intelligence' AND policyname='public read story intelligence') THEN
    CREATE POLICY "public read story intelligence" ON public.story_intelligence FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_story_intel_created ON public.story_intelligence(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_intel_trend ON public.story_intelligence(trend_name);

-- =============================================================
-- 2. Persistent, evolving user memory (Learning Engine).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.user_profiles (
  client_id text PRIMARY KEY,
  persona text NOT NULL DEFAULT 'generic',
  skill_level text NOT NULL DEFAULT 'intermediate',
  role text,
  -- learned signals — incrementally updated, never wiped:
  interest_weights jsonb NOT NULL DEFAULT '{}'::jsonb,   -- axis -> running weight
  companies jsonb NOT NULL DEFAULT '{}'::jsonb,          -- company -> affinity count
  technologies jsonb NOT NULL DEFAULT '{}'::jsonb,       -- tech -> affinity count
  searches jsonb NOT NULL DEFAULT '[]'::jsonb,           -- recent search terms
  signal_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  saved_count integer NOT NULL DEFAULT 0,
  dismissed_count integer NOT NULL DEFAULT 0,
  avg_reading_ms integer NOT NULL DEFAULT 0,
  last_signal_id uuid,                                   -- watermark: last consumed user_signals.id
  last_signal_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

-- Service-role only (edge functions). No anon access to other users' memory.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_profiles' AND policyname='no direct user profile access') THEN
    CREATE POLICY "no direct user profile access" ON public.user_profiles FOR SELECT USING (false);
  END IF;
END $$;

-- =============================================================
-- 3. Optional search capture (Stage 2 + 8: searches affect interests).
--    Additive; record-signal can write here, personalize reads it.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.user_searches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL,
  query text NOT NULL,
  searched_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_searches ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_searches' AND policyname='no direct user search access') THEN
    CREATE POLICY "no direct user search access" ON public.user_searches FOR SELECT USING (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_searches_client ON public.user_searches(client_id, searched_at DESC);

-- Cleanup: prune old story_intelligence with its parent feed rows.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signal-cleanup') THEN
    PERFORM cron.unschedule('signal-cleanup');
  END IF;
  PERFORM cron.schedule(
    'signal-cleanup',
    '40 3 * * *',
    $cron$
    DELETE FROM public.event_log     WHERE occurred_at < now() - interval '14 days';
    DELETE FROM public.pipeline_runs WHERE started_at  < now() - interval '30 days';
    DELETE FROM public.fetch_log     WHERE ran_at       < now() - interval '14 days';
    DELETE FROM public.raw_items     WHERE fetched_at   < now() - interval '21 days';
    DELETE FROM public.trend_observations WHERE observed_on < current_date - 90;
    DELETE FROM public.notification_queue WHERE status IN ('sent','dead') AND created_at < now() - interval '7 days';
    DELETE FROM public.job_locks     WHERE expires_at  < now() - interval '1 day';
    DELETE FROM public.story_intelligence WHERE created_at < now() - interval '30 days'
      AND feed_item_id NOT IN (SELECT id FROM public.feed_items);
    DELETE FROM public.user_searches WHERE searched_at < now() - interval '90 days';
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cleanup cron skipped: %', SQLERRM;
END $$;
