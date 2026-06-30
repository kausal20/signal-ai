-- Signal — Phase 1 Foundation · 0008 INDEXES
CREATE INDEX IF NOT EXISTS idx_clients_user_id    ON public.clients (user_id);
CREATE INDEX IF NOT EXISTS idx_clients_last_seen  ON public.clients (last_seen_at);

CREATE INDEX IF NOT EXISTS idx_source_connectors_tier    ON public.source_connectors (tier);
CREATE INDEX IF NOT EXISTS idx_source_connectors_enabled ON public.source_connectors (enabled);
CREATE INDEX IF NOT EXISTS idx_source_health_disabled    ON public.source_health (disabled);

CREATE INDEX IF NOT EXISTS idx_raw_items_published   ON public.raw_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_items_canonical   ON public.raw_items (canonical_url);
CREATE INDEX IF NOT EXISTS idx_raw_items_source_time ON public.raw_items (source, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_items_accepted
  ON public.raw_items (published_at DESC) WHERE rejection_reason IS NULL;

CREATE INDEX IF NOT EXISTS idx_fetch_log_ran ON public.fetch_log (ran_at DESC);

CREATE INDEX IF NOT EXISTS idx_feed_items_published    ON public.feed_items (published_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_score        ON public.feed_items (score DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_fetched      ON public.feed_items (fetched_at DESC);
CREATE INDEX IF NOT EXISTS idx_feed_items_tag          ON public.feed_items (tag);
CREATE INDEX IF NOT EXISTS idx_feed_items_content_cat  ON public.feed_items (content_category);

CREATE INDEX IF NOT EXISTS idx_story_clusters_last_seen ON public.story_clusters (last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_story_intel_created ON public.story_intelligence (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_story_intel_trend   ON public.story_intelligence (trend_name);

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON public.pipeline_runs (started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status  ON public.pipeline_runs (status, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_time        ON public.event_log (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_level       ON public.event_log (level, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_pipeline    ON public.event_log (pipeline_id);
