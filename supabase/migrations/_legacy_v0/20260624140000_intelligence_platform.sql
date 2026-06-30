-- Intelligence Platform migration: trend memory, source connectors,
-- per-story editorial audits, learning signals, expanded feed columns,
-- tiered ingestion cron.

-- =============================================================
-- 1. Source connector registry (Stage 1)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.source_connectors (
  source text PRIMARY KEY,
  source_label text NOT NULL,
  source_kind text NOT NULL,
  tier text NOT NULL DEFAULT 'medium' CHECK (tier IN ('fast', 'medium', 'slow')),
  source_weight numeric NOT NULL DEFAULT 1,
  rss_url text,
  news_query text,
  enabled boolean NOT NULL DEFAULT true,
  trust_score integer NOT NULL DEFAULT 70 CHECK (trust_score BETWEEN 0 AND 100),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.source_connectors ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='source_connectors'
      AND policyname='public read source connectors'
  ) THEN
    CREATE POLICY "public read source connectors" ON public.source_connectors
      FOR SELECT USING (true);
  END IF;
END $$;

-- Extend source_health with avg response time + trust derived metric.
ALTER TABLE public.source_health
  ADD COLUMN IF NOT EXISTS avg_response_ms integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS success_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier text NOT NULL DEFAULT 'medium';

-- =============================================================
-- 2. Trend memory (Stage 10)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.trend_entities (
  id text PRIMARY KEY,                -- normalized slug e.g. 'openai', 'agents'
  label text NOT NULL,                -- display label
  kind text NOT NULL,                 -- 'company' | 'product' | 'model' | 'framework' | 'topic' | 'startup'
  aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  total_mentions integer NOT NULL DEFAULT 0,
  rolling_7d integer NOT NULL DEFAULT 0,
  rolling_14d integer NOT NULL DEFAULT 0,
  momentum numeric NOT NULL DEFAULT 0,
  trend_state text NOT NULL DEFAULT 'flat' CHECK (trend_state IN ('rising','flat','declining','dormant'))
);

ALTER TABLE public.trend_entities ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='trend_entities'
      AND policyname='public read trend entities'
  ) THEN
    CREATE POLICY "public read trend entities" ON public.trend_entities
      FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_trend_entities_momentum
  ON public.trend_entities(momentum DESC, last_seen_at DESC);

CREATE TABLE IF NOT EXISTS public.trend_observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id text NOT NULL REFERENCES public.trend_entities(id) ON DELETE CASCADE,
  observed_on date NOT NULL DEFAULT current_date,
  mentions integer NOT NULL DEFAULT 0,
  source_count integer NOT NULL DEFAULT 0,
  UNIQUE (entity_id, observed_on)
);

CREATE INDEX IF NOT EXISTS idx_trend_observations_day
  ON public.trend_observations(observed_on DESC);

-- =============================================================
-- 3. Editorial audit log (Stage 8)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.editorial_audits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id text,
  cluster_id text,
  curated_at timestamptz NOT NULL DEFAULT now(),
  leverage_score integer,
  q_founder boolean,
  q_builder boolean,
  q_agency boolean,
  q_vibe_coder boolean,
  q_saves_time boolean,
  q_creates_business boolean,
  q_changes_workflow boolean,
  q_remember_tomorrow boolean,
  q_recommend boolean,
  one_sentence boolean,
  teen_understandable boolean,
  action_required text,
  rejection_reason text,
  raw_payload jsonb
);

ALTER TABLE public.editorial_audits ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='editorial_audits'
      AND policyname='public read editorial audits'
  ) THEN
    CREATE POLICY "public read editorial audits" ON public.editorial_audits
      FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_editorial_audits_curated_at
  ON public.editorial_audits(curated_at DESC);

-- =============================================================
-- 4. User signals (Stage: self-improvement)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.user_signals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id text NOT NULL,
  signal_kind text NOT NULL CHECK (signal_kind IN ('opened','bookmarked','dismissed','shared','clicked_source')),
  client_id text,
  occurred_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_signals ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='user_signals'
      AND policyname='no direct user signal access'
  ) THEN
    CREATE POLICY "no direct user signal access" ON public.user_signals
      FOR SELECT USING (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_user_signals_item ON public.user_signals(feed_item_id);
CREATE INDEX IF NOT EXISTS idx_user_signals_kind_time ON public.user_signals(signal_kind, occurred_at DESC);

-- Aggregated learning weights per source/category — recomputed on a schedule.
CREATE TABLE IF NOT EXISTS public.ranking_weights (
  scope text PRIMARY KEY,             -- e.g. 'source:openai' | 'category:Must Know'
  open_rate numeric NOT NULL DEFAULT 0,
  bookmark_rate numeric NOT NULL DEFAULT 0,
  dismiss_rate numeric NOT NULL DEFAULT 0,
  share_rate numeric NOT NULL DEFAULT 0,
  sample_size integer NOT NULL DEFAULT 0,
  weight numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ranking_weights ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='public' AND tablename='ranking_weights'
      AND policyname='public read ranking weights'
  ) THEN
    CREATE POLICY "public read ranking weights" ON public.ranking_weights
      FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================================
-- 5. Expand feed_items with intelligence + opportunity columns
--    (Stage 9 outputs and Stage 7 leverage_score, trend, momentum).
-- =============================================================
ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS leverage_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS trend_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS momentum_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS action_label text,
  ADD COLUMN IF NOT EXISTS action text,
  ADD COLUMN IF NOT EXISTS risk text,
  ADD COLUMN IF NOT EXISTS who_benefits text,
  ADD COLUMN IF NOT EXISTS who_should_ignore text,
  ADD COLUMN IF NOT EXISTS expected_impact text,
  ADD COLUMN IF NOT EXISTS time_horizon text,
  ADD COLUMN IF NOT EXISTS trend_entities text[] NOT NULL DEFAULT ARRAY[]::text[];

-- Pipeline metrics gains per-stage timings + acceptance rate.
ALTER TABLE public.pipeline_metrics
  ADD COLUMN IF NOT EXISTS stage_timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS acceptance_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS rewrite_success_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS tier text;

-- =============================================================
-- 6. Tiered ingestion cron + trend job
-- =============================================================
DO $$
BEGIN
  -- Remove the legacy single-shot job if present.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'refresh-ai-feed') THEN
    PERFORM cron.unschedule('refresh-ai-feed');
  END IF;

  -- Tier-fast: frontier labs every 10 min.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-fast') THEN
    PERFORM cron.unschedule('ingest-fast');
  END IF;
  PERFORM cron.schedule(
    'ingest-fast',
    '*/10 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/ingest-tier',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"tier":"fast"}'::jsonb
    );
    $cron$
  );

  -- Tier-medium: community + launches every 30 min.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-medium') THEN
    PERFORM cron.unschedule('ingest-medium');
  END IF;
  PERFORM cron.schedule(
    'ingest-medium',
    '*/30 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/ingest-tier',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"tier":"medium"}'::jsonb
    );
    $cron$
  );

  -- Tier-slow: research/funding/newsletter every 2 hours.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'ingest-slow') THEN
    PERFORM cron.unschedule('ingest-slow');
  END IF;
  PERFORM cron.schedule(
    'ingest-slow',
    '0 */2 * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/ingest-tier',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"tier":"slow"}'::jsonb
    );
    $cron$
  );

  -- Publish runs every 30 min (cluster + edit + publish).
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'publish-feed') THEN
    PERFORM cron.unschedule('publish-feed');
  END IF;
  PERFORM cron.schedule(
    'publish-feed',
    '*/30 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/publish-feed',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );

  -- Trend memory recompute hourly.
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'update-trends') THEN
    PERFORM cron.unschedule('update-trends');
  END IF;
  PERFORM cron.schedule(
    'update-trends',
    '20 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/update-trends',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{}'::jsonb
    );
    $cron$
  );

EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron scheduling partial: %', SQLERRM;
END $$;

-- =============================================================
-- 7. Seed connector registry (idempotent upsert).
-- =============================================================
INSERT INTO public.source_connectors (source, source_label, source_kind, tier, source_weight, rss_url, news_query, trust_score) VALUES
  ('openai',       'OpenAI',           'official',  'fast',   1.55, 'https://openai.com/news/rss.xml',                           'OpenAI GPT model release OR ChatGPT agents when:14d',                                95),
  ('anthropic',    'Anthropic',        'official',  'fast',   1.55, 'https://www.anthropic.com/rss.xml',                          'Anthropic Claude model release OR Claude Code OR Claude agents when:14d',            95),
  ('google_ai',    'Google AI',        'official',  'fast',   1.45, 'https://blog.google/technology/ai/rss/',                     'Google AI Gemini model release when:14d',                                            90),
  ('deepmind',     'Google DeepMind',  'official',  'fast',   1.48, 'https://blog.google/technology/google-deepmind/rss/',        'Google DeepMind Gemini OR AlphaFold research when:14d',                              92),
  ('meta_ai',      'Meta AI',          'official',  'fast',   1.42, 'https://ai.meta.com/blog/rss/',                              'Meta AI Llama model release open weights when:14d',                                  90),
  ('microsoft_ai', 'Microsoft AI',     'official',  'fast',   1.35, NULL,                                                         'Microsoft AI Copilot Azure AI agents model release when:14d',                        85),
  ('cursor',       'Cursor',           'official',  'fast',   1.30, 'https://www.cursor.com/blog/rss.xml',                        'Cursor AI code editor update OR feature when:21d',                                   88),
  ('perplexity',   'Perplexity',       'official',  'fast',   1.28, 'https://www.perplexity.ai/blog/rss.xml',                     'Perplexity AI launch OR feature OR model when:21d',                                  85),
  ('replit',       'Replit',           'official',  'fast',   1.22, 'https://blog.replit.com/feed.xml',                           'Replit AI Agent OR feature OR launch when:21d',                                      82),
  ('elevenlabs',   'ElevenLabs',       'official',  'fast',   1.22, 'https://elevenlabs.io/blog/rss.xml',                         'ElevenLabs voice AI launch OR model OR feature when:21d',                            82),
  ('runway',       'Runway',           'official',  'fast',   1.20, NULL,                                                         'Runway AI video model OR Gen-4 OR feature when:21d',                                 80),
  ('midjourney',   'Midjourney',       'official',  'fast',   1.18, NULL,                                                         'Midjourney new version OR model OR feature when:21d',                                78),
  ('huggingface',  'Hugging Face',     'official',  'medium', 1.18, 'https://huggingface.co/blog/feed.xml',                       'Hugging Face model release dataset when:14d',                                        80),
  ('github',       'GitHub AI projects','launch',   'medium', 1.00, NULL,                                                         NULL,                                                                                  70),
  ('producthunt',  'Product Hunt',     'launch',    'medium', 0.95, 'https://www.producthunt.com/feed',                           NULL,                                                                                  72),
  ('hn',           'Hacker News',      'community', 'medium', 1.02, NULL,                                                         NULL,                                                                                  76),
  ('reddit',       'Reddit AI',        'community', 'medium', 0.92, NULL,                                                         NULL,                                                                                  70),
  ('arxiv',        'arXiv',            'research',  'slow',   1.00, NULL,                                                         NULL,                                                                                  78),
  ('yc_discussions','YC / HN founders','startup',   'slow',   1.08, NULL,                                                         NULL,                                                                                  78),
  ('ai_startups',  'AI startup launches','startup', 'slow',   1.12, NULL,                                                         '"AI startup" (launches OR raises OR "YC" OR "agent startup" OR acquisition) when:7d', 76),
  ('ai_funding',   'AI funding',       'startup',   'slow',   1.15, NULL,                                                         'AI startup ("raises" OR "Series A" OR "Series B" OR "seed round" OR funding) when:7d', 78),
  ('yc_launches',  'YC launches',      'startup',   'slow',   1.14, NULL,                                                         '"Y Combinator" AI OR "YC" AI startup launch when:14d',                               78),
  ('ai_founders',  'AI founders',      'startup',   'slow',   1.05, NULL,                                                         'AI founder OR "AI operator" building OR shipped when:7d',                            72),
  ('ai_market',    'AI market signals','startup',   'slow',   1.08, NULL,                                                         '"AI agents" market OR "AI automation" startup OR "AI workflow" business opportunity when:7d', 72)
ON CONFLICT (source) DO UPDATE SET
  source_label = EXCLUDED.source_label,
  source_kind  = EXCLUDED.source_kind,
  tier         = EXCLUDED.tier,
  source_weight= EXCLUDED.source_weight,
  rss_url      = EXCLUDED.rss_url,
  news_query   = EXCLUDED.news_query,
  trust_score  = EXCLUDED.trust_score,
  updated_at   = now();
