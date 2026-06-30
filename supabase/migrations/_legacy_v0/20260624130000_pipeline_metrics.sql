-- Pipeline metrics: structured run telemetry for the validation checklist.
CREATE TABLE IF NOT EXISTS public.pipeline_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at timestamptz NOT NULL DEFAULT now(),
  curation_mode text NOT NULL,
  raw_count integer NOT NULL DEFAULT 0,
  rejected_count integer NOT NULL DEFAULT 0,
  accepted_count integer NOT NULL DEFAULT 0,
  cluster_count integer NOT NULL DEFAULT 0,
  multi_source_clusters integer NOT NULL DEFAULT 0,
  curated_count integer NOT NULL DEFAULT 0,
  stored_count integer NOT NULL DEFAULT 0,
  sources_ok integer NOT NULL DEFAULT 0,
  sources_total integer NOT NULL DEFAULT 0,
  disabled_sources text[] NOT NULL DEFAULT ARRAY[]::text[],
  duration_ms integer NOT NULL DEFAULT 0,
  ai_gateway_ok boolean NOT NULL DEFAULT true
);

ALTER TABLE public.pipeline_metrics ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'pipeline_metrics'
      AND policyname = 'public read pipeline metrics'
  ) THEN
    CREATE POLICY "public read pipeline metrics" ON public.pipeline_metrics
      FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pipeline_metrics_ran_at
  ON public.pipeline_metrics(ran_at DESC);

-- Convenience view aggregating freshness + last run for dashboards.
CREATE OR REPLACE VIEW public.signal_pipeline_status AS
SELECT
  (SELECT count(*) FROM public.feed_items) AS feed_item_count,
  (SELECT count(*) FROM public.feed_items
     WHERE fetched_at > now() - interval '6 hours') AS fresh_feed_items,
  (SELECT max(fetched_at) FROM public.feed_items) AS last_fetched_at,
  (SELECT count(*) FROM public.raw_items) AS raw_item_count,
  (SELECT count(*) FROM public.story_clusters) AS cluster_count,
  (SELECT count(*) FROM public.story_clusters WHERE source_count >= 2) AS multi_source_clusters,
  (SELECT count(*) FROM public.source_health WHERE disabled) AS disabled_sources,
  (SELECT count(*) FROM public.source_health) AS tracked_sources,
  (SELECT ran_at FROM public.pipeline_metrics ORDER BY ran_at DESC LIMIT 1) AS last_run_at,
  (SELECT curation_mode FROM public.pipeline_metrics ORDER BY ran_at DESC LIMIT 1) AS last_curation_mode;
