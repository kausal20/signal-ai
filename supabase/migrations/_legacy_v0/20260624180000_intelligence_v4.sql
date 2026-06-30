-- Signal Intelligence Engine V4. Additive. Keeps V1-V3 intact.
-- pgvector semantic memory + collaborative clusters + global Bayesian graph
-- + multi-agent reasoning cache + ROI + long-term outcome learning.

CREATE EXTENSION IF NOT EXISTS vector;

-- =============================================================
-- CAP 1: vector semantic memory (1536-dim, provider-normalized).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.story_embeddings (
  feed_item_id text PRIMARY KEY,
  embedding vector(1536) NOT NULL,
  model text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.concept_embeddings (
  concept text PRIMARY KEY,
  embedding vector(1536) NOT NULL,
  model text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_embeddings (
  client_id text PRIMARY KEY,
  embedding vector(1536) NOT NULL,
  sample_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  CREATE INDEX IF NOT EXISTS idx_story_emb_ivf ON public.story_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
  CREATE INDEX IF NOT EXISTS idx_concept_emb_ivf ON public.concept_embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'ivfflat skipped: %', SQLERRM; END $$;

ALTER TABLE public.story_embeddings   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.concept_embeddings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_embeddings    ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='story_embeddings' AND policyname='no direct story emb') THEN
    CREATE POLICY "no direct story emb" ON public.story_embeddings FOR SELECT USING (false); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='concept_embeddings' AND policyname='no direct concept emb') THEN
    CREATE POLICY "no direct concept emb" ON public.concept_embeddings FOR SELECT USING (false); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_embeddings' AND policyname='no direct user emb') THEN
    CREATE POLICY "no direct user emb" ON public.user_embeddings FOR SELECT USING (false); END IF;
END $$;

-- Vector similarity search (k nearest stories to a query embedding).
CREATE OR REPLACE FUNCTION public.match_stories(query_embedding vector(1536), match_count int)
RETURNS TABLE (feed_item_id text, similarity float)
LANGUAGE sql STABLE AS $$
  SELECT feed_item_id, 1 - (embedding <=> query_embedding) AS similarity
  FROM public.story_embeddings
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;

-- =============================================================
-- CAP 2: anonymous behavioural clusters (collaborative filtering).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.cluster_profiles (
  cluster_id integer PRIMARY KEY,
  centroid vector(1536) NOT NULL,
  member_count integer NOT NULL DEFAULT 0,
  top_concepts jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.user_clusters (
  client_id text PRIMARY KEY,
  cluster_id integer NOT NULL,
  similarity numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cluster_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_clusters    ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='cluster_profiles' AND policyname='public read clusters') THEN
    CREATE POLICY "public read clusters" ON public.cluster_profiles FOR SELECT USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='user_clusters' AND policyname='no direct user cluster') THEN
    CREATE POLICY "no direct user cluster" ON public.user_clusters FOR SELECT USING (false); END IF;
END $$;

-- =============================================================
-- CAP 3 + 6: global intelligence graph with Bayesian confidence + decay.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.global_intelligence (
  key text NOT NULL,            -- feed_item_id or concept id
  kind text NOT NULL,           -- 'story' | 'concept'
  alpha numeric NOT NULL DEFAULT 1,   -- Beta(alpha,beta) successes+1
  beta numeric NOT NULL DEFAULT 1,    -- failures+1
  influence numeric NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (key, kind)
);
ALTER TABLE public.global_intelligence ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='global_intelligence' AND policyname='public read global intel') THEN
    CREATE POLICY "public read global intel" ON public.global_intelligence FOR SELECT USING (true); END IF;
END $$;

-- Bayesian update: success bumps alpha, failure bumps beta. Weighted.
CREATE OR REPLACE FUNCTION public.bump_bayes(p_key text, p_kind text, p_success numeric, p_fail numeric)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO public.global_intelligence (key, kind, alpha, beta)
  VALUES (p_key, p_kind, 1 + p_success, 1 + p_fail)
  ON CONFLICT (key, kind) DO UPDATE SET
    alpha = public.global_intelligence.alpha + p_success,
    beta  = public.global_intelligence.beta  + p_fail,
    influence = (public.global_intelligence.alpha + p_success)
              / (public.global_intelligence.alpha + p_success + public.global_intelligence.beta + p_fail),
    updated_at = now();
END;
$$;

-- =============================================================
-- CAP 6: long-term success events (built / implemented / revenue / ...).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.outcome_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text,
  feed_item_id text NOT NULL,
  outcome_kind text NOT NULL,   -- built|implemented|ignored|saved|revenue|time_saved|adoption|feedback
  value numeric,                -- revenue $, hours saved, team size, rating ...
  note text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.outcome_events ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='outcome_events' AND policyname='no direct outcome events') THEN
    CREATE POLICY "no direct outcome events" ON public.outcome_events FOR SELECT USING (false); END IF;
END $$;
CREATE INDEX IF NOT EXISTS idx_outcome_events_item ON public.outcome_events(feed_item_id);

-- =============================================================
-- Cron: daily global decay (CAP 3) + user clustering (CAP 2).
-- =============================================================
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='signal-global-decay') THEN PERFORM cron.unschedule('signal-global-decay'); END IF;
  PERFORM cron.schedule('signal-global-decay', '50 3 * * *', $cron$
    UPDATE public.global_intelligence
      SET alpha = 1 + (alpha - 1) * 0.97, beta = 1 + (beta - 1) * 0.97, updated_at = now()
      WHERE updated_at < now() - interval '1 day';
  $cron$);

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname='cluster-users') THEN PERFORM cron.unschedule('cluster-users'); END IF;
  PERFORM cron.schedule('cluster-users', '0 4 * * *',
    'select net.http_post(url:=''https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/cluster-users'', headers:=''{"Content-Type":"application/json"}''::jsonb) as request_id;');
EXCEPTION WHEN OTHERS THEN RAISE NOTICE 'v4 cron skipped: %', SQLERRM; END $$;
