ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS content_category text NOT NULL DEFAULT 'Must Know',
  ADD COLUMN IF NOT EXISTS what_happened text,
  ADD COLUMN IF NOT EXISTS opportunity text,
  ADD COLUMN IF NOT EXISTS source_label text,
  ADD COLUMN IF NOT EXISTS source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS novelty_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS business_impact_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS builder_value_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adoption_potential_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS market_impact_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confidence_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ranking_reason text,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

ALTER TABLE public.feed_items
  DROP CONSTRAINT IF EXISTS feed_items_content_category_check,
  ADD CONSTRAINT feed_items_content_category_check CHECK (
    content_category IN (
      'Must Know',
      'Tool of the Day',
      'Workflow of the Day',
      'Founder Opportunity',
      'Underrated Tool',
      'Market Shift',
      'Research Breakthrough'
    )
  );

ALTER TABLE public.feed_items
  DROP CONSTRAINT IF EXISTS feed_items_scores_check,
  ADD CONSTRAINT feed_items_scores_check CHECK (
    score BETWEEN 0 AND 100
    AND novelty_score BETWEEN 0 AND 100
    AND business_impact_score BETWEEN 0 AND 100
    AND builder_value_score BETWEEN 0 AND 100
    AND adoption_potential_score BETWEEN 0 AND 100
    AND market_impact_score BETWEEN 0 AND 100
    AND confidence_score BETWEEN 0 AND 100
  );

CREATE INDEX IF NOT EXISTS idx_feed_items_category_score
  ON public.feed_items(content_category, score DESC);

CREATE INDEX IF NOT EXISTS idx_feed_items_score_published
  ON public.feed_items(score DESC, published_at DESC);

CREATE TABLE IF NOT EXISTS public.raw_items (
  id text PRIMARY KEY,
  canonical_url text NOT NULL,
  raw_title text NOT NULL,
  raw_text text,
  url text NOT NULL,
  source text NOT NULL,
  source_label text NOT NULL,
  source_kind text NOT NULL,
  source_weight numeric NOT NULL DEFAULT 1,
  engagement integer NOT NULL DEFAULT 0,
  published_at timestamptz NOT NULL,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  cluster_key text,
  rejection_reason text
);

ALTER TABLE public.raw_items ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'raw_items'
      AND policyname = 'no direct raw item access'
  ) THEN
    CREATE POLICY "no direct raw item access" ON public.raw_items
      FOR SELECT USING (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_raw_items_source_published
  ON public.raw_items(source, published_at DESC);

CREATE INDEX IF NOT EXISTS idx_raw_items_cluster_key
  ON public.raw_items(cluster_key);

CREATE INDEX IF NOT EXISTS idx_raw_items_canonical_url
  ON public.raw_items(canonical_url);

CREATE TABLE IF NOT EXISTS public.story_clusters (
  id text PRIMARY KEY,
  canonical_title text NOT NULL,
  canonical_url text NOT NULL,
  content_category text,
  source_count integer NOT NULL DEFAULT 1,
  confidence_score integer NOT NULL DEFAULT 0,
  best_score integer NOT NULL DEFAULT 0,
  source_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.story_clusters ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'story_clusters'
      AND policyname = 'no direct story cluster access'
  ) THEN
    CREATE POLICY "no direct story cluster access" ON public.story_clusters
      FOR SELECT USING (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_story_clusters_score
  ON public.story_clusters(best_score DESC, last_seen_at DESC);
