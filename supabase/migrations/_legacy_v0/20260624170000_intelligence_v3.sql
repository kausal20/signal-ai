-- Signal Intelligence Engine V3 — five additive capabilities.
-- Keeps V2 intact. No per-user LLM. Additive schema only.

-- =============================================================
-- CAP 1: richer behavioural signals (reading time + new kinds).
-- =============================================================
ALTER TABLE public.user_signals ADD COLUMN IF NOT EXISTS duration_ms integer;
ALTER TABLE public.user_signals ADD COLUMN IF NOT EXISTS meta jsonb;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.constraint_column_usage
             WHERE table_name='user_signals' AND constraint_name='user_signals_signal_kind_check') THEN
    ALTER TABLE public.user_signals DROP CONSTRAINT user_signals_signal_kind_check;
  END IF;
  ALTER TABLE public.user_signals ADD CONSTRAINT user_signals_signal_kind_check
    CHECK (signal_kind IN (
      'opened','skipped','bookmarked','dismissed','shared','clicked_source',
      'reading_time','prompt_copied','tool_clicked','workflow_opened',
      'notification_opened','notification_dismissed','search','topic_revisit'
    ));
END $$;

-- =============================================================
-- CAP 2 + 3: semantic memory + adaptive personas on user_profiles.
-- =============================================================
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS persona_mix jsonb NOT NULL DEFAULT '{}'::jsonb,   -- persona -> weight
  ADD COLUMN IF NOT EXISTS inferred_role text,                              -- e.g. "Indie Hacker building SaaS"
  ADD COLUMN IF NOT EXISTS concept_affinity jsonb NOT NULL DEFAULT '{}'::jsonb, -- entity/concept -> weight
  ADD COLUMN IF NOT EXISTS reading_ms_total bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS revisit_counts jsonb NOT NULL DEFAULT '{}'::jsonb;  -- concept -> revisit count

-- =============================================================
-- CAP 2: concept relationship graph (semantic memory backbone).
-- Built from story co-occurrence; entities that appear together are related.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.concept_edges (
  concept_a text NOT NULL,
  concept_b text NOT NULL,
  weight integer NOT NULL DEFAULT 1,         -- co-occurrence count
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (concept_a, concept_b)
);

ALTER TABLE public.concept_edges ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='concept_edges' AND policyname='public read concept edges') THEN
    CREATE POLICY "public read concept edges" ON public.concept_edges FOR SELECT USING (true);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_concept_edges_a ON public.concept_edges(concept_a, weight DESC);

-- =============================================================
-- CAP 4: trend intelligence (cross-story reasoning, computed once/day).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.trend_intelligence (
  entity_id text PRIMARY KEY,
  label text,
  summary text,
  why_it_matters text,
  prediction text,
  direction text,                            -- accelerating/slowing/emerging/declining/steady
  acceleration numeric NOT NULL DEFAULT 0,   -- week-over-week change
  confidence integer NOT NULL DEFAULT 0,     -- 0..100
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  degraded boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.trend_intelligence ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='trend_intelligence' AND policyname='public read trend intelligence') THEN
    CREATE POLICY "public read trend intelligence" ON public.trend_intelligence FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================================
-- CAP 5: outcome learning — measure whether recommendations worked.
-- Aggregated per story per persona (not per user) so it stays O(stories).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.recommendation_outcomes (
  feed_item_id text NOT NULL,
  persona text NOT NULL DEFAULT 'generic',
  impressions integer NOT NULL DEFAULT 0,
  clicks integer NOT NULL DEFAULT 0,
  saves integer NOT NULL DEFAULT 0,
  shares integer NOT NULL DEFAULT 0,
  ignores integer NOT NULL DEFAULT 0,
  returns integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (feed_item_id, persona)
);

ALTER TABLE public.recommendation_outcomes ENABLE ROW LEVEL SECURITY;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='recommendation_outcomes' AND policyname='public read rec outcomes') THEN
    CREATE POLICY "public read rec outcomes" ON public.recommendation_outcomes FOR SELECT USING (true);
  END IF;
END $$;

-- Atomic outcome counter (avoids read-modify-write races under load).
CREATE OR REPLACE FUNCTION public.bump_outcome(
  p_feed_item_id text, p_persona text, p_field text, p_delta integer
) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.recommendation_outcomes (feed_item_id, persona, impressions, clicks, saves, shares, ignores, returns)
  VALUES (p_feed_item_id, p_persona,
    CASE WHEN p_field='impressions' THEN p_delta ELSE 0 END,
    CASE WHEN p_field='clicks' THEN p_delta ELSE 0 END,
    CASE WHEN p_field='saves' THEN p_delta ELSE 0 END,
    CASE WHEN p_field='shares' THEN p_delta ELSE 0 END,
    CASE WHEN p_field='ignores' THEN p_delta ELSE 0 END,
    CASE WHEN p_field='returns' THEN p_delta ELSE 0 END)
  ON CONFLICT (feed_item_id, persona) DO UPDATE SET
    impressions = public.recommendation_outcomes.impressions + CASE WHEN p_field='impressions' THEN p_delta ELSE 0 END,
    clicks      = public.recommendation_outcomes.clicks      + CASE WHEN p_field='clicks' THEN p_delta ELSE 0 END,
    saves       = public.recommendation_outcomes.saves       + CASE WHEN p_field='saves' THEN p_delta ELSE 0 END,
    shares      = public.recommendation_outcomes.shares      + CASE WHEN p_field='shares' THEN p_delta ELSE 0 END,
    ignores     = public.recommendation_outcomes.ignores     + CASE WHEN p_field='ignores' THEN p_delta ELSE 0 END,
    returns     = public.recommendation_outcomes.returns     + CASE WHEN p_field='returns' THEN p_delta ELSE 0 END,
    updated_at  = now();
END;
$$;

-- =============================================================
-- Cleanup cron: prune V3 ephemera too.
-- =============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'signal-cleanup') THEN
    PERFORM cron.unschedule('signal-cleanup');
  END IF;
  PERFORM cron.schedule(
    'signal-cleanup', '40 3 * * *',
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
    DELETE FROM public.recommendation_outcomes WHERE updated_at < now() - interval '45 days'
      AND feed_item_id NOT IN (SELECT id FROM public.feed_items);
    DELETE FROM public.concept_edges WHERE updated_at < now() - interval '60 days';
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cleanup cron skipped: %', SQLERRM;
END $$;
