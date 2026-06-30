-- Reliability layer: structured event log, detailed pipeline runs, job locks,
-- self-healing source health, cleanup cron.

-- =============================================================
-- 1. Structured event log (Phase 4 + 9). One row per important event.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.event_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  pipeline_id uuid,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('debug','info','warn','error')),
  event text NOT NULL,                  -- 'fetch_started', 'source_failed', 'ai_fallback_used', ...
  stage text,                           -- pipeline stage name
  source text,                          -- connector / source involved
  message text,
  retry_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  stack text,
  context jsonb
);

ALTER TABLE public.event_log ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='event_log' AND policyname='public read event log') THEN
    CREATE POLICY "public read event log" ON public.event_log FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_event_log_time ON public.event_log(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_level ON public.event_log(level, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_event_log_pipeline ON public.event_log(pipeline_id);

-- =============================================================
-- 2. Detailed pipeline runs (Phase 3). Queryable per-execution record.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger text NOT NULL,                -- 'fetch-feed' | 'publish-feed' | 'ingest:fast' ...
  status text NOT NULL DEFAULT 'running' CHECK (status IN ('running','completed','failed','partial')),
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  duration_ms integer,
  sources_processed integer NOT NULL DEFAULT 0,
  sources_ok integer NOT NULL DEFAULT 0,
  stories_fetched integer NOT NULL DEFAULT 0,
  stories_accepted integer NOT NULL DEFAULT 0,
  stories_rejected integer NOT NULL DEFAULT 0,
  stories_clustered integer NOT NULL DEFAULT 0,
  stories_published integer NOT NULL DEFAULT 0,
  notifications_queued integer NOT NULL DEFAULT 0,
  notifications_sent integer NOT NULL DEFAULT 0,
  fallback_used boolean NOT NULL DEFAULT false,
  error_count integer NOT NULL DEFAULT 0,
  stage_timings jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage_results jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors jsonb NOT NULL DEFAULT '[]'::jsonb
);

ALTER TABLE public.pipeline_runs ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='pipeline_runs' AND policyname='public read pipeline runs') THEN
    CREATE POLICY "public read pipeline runs" ON public.pipeline_runs FOR SELECT USING (true);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_pipeline_runs_started ON public.pipeline_runs(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_runs_status ON public.pipeline_runs(status, started_at DESC);

-- =============================================================
-- 3. Job locks (Phase 8). Prevent overlapping / duplicate executions.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.job_locks (
  job_name text PRIMARY KEY,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  holder text
);

ALTER TABLE public.job_locks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='job_locks' AND policyname='no direct job lock access') THEN
    CREATE POLICY "no direct job lock access" ON public.job_locks FOR SELECT USING (false);
  END IF;
END $$;

-- Atomic acquire: insert if absent OR steal if expired. Returns true if acquired.
CREATE OR REPLACE FUNCTION public.acquire_job_lock(p_job text, p_ttl_seconds int, p_holder text)
RETURNS boolean
LANGUAGE plpgsql
AS $$
DECLARE
  got boolean := false;
BEGIN
  INSERT INTO public.job_locks(job_name, locked_at, expires_at, holder)
  VALUES (p_job, now(), now() + make_interval(secs => p_ttl_seconds), p_holder)
  ON CONFLICT (job_name) DO UPDATE
    SET locked_at = now(),
        expires_at = now() + make_interval(secs => p_ttl_seconds),
        holder = p_holder
    WHERE public.job_locks.expires_at < now()   -- only steal an expired lock
  RETURNING true INTO got;
  RETURN COALESCE(got, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.release_job_lock(p_job text)
RETURNS void
LANGUAGE sql
AS $$
  DELETE FROM public.job_locks WHERE job_name = p_job;
$$;

-- =============================================================
-- 4. Self-healing source health (Phase 2 + 11).
-- =============================================================
ALTER TABLE public.source_health
  ADD COLUMN IF NOT EXISTS last_failed_at timestamptz,
  ADD COLUMN IF NOT EXISTS recovered_at timestamptz,
  ADD COLUMN IF NOT EXISTS disabled_until timestamptz,
  ADD COLUMN IF NOT EXISTS uptime_pct numeric NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS duplicate_rate numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS items_fetched_total integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS circuit_state text NOT NULL DEFAULT 'closed'
    CHECK (circuit_state IN ('closed','open','half_open'));

-- =============================================================
-- 5. Circuit breaker state for external dependencies (AI gateway etc).
-- =============================================================
CREATE TABLE IF NOT EXISTS public.circuit_breakers (
  name text PRIMARY KEY,                -- 'ai_gateway' | 'github' | 'reddit' ...
  state text NOT NULL DEFAULT 'closed' CHECK (state IN ('closed','open','half_open')),
  consecutive_failures integer NOT NULL DEFAULT 0,
  opened_at timestamptz,
  reset_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.circuit_breakers ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='circuit_breakers' AND policyname='public read circuit breakers') THEN
    CREATE POLICY "public read circuit breakers" ON public.circuit_breakers FOR SELECT USING (true);
  END IF;
END $$;

-- =============================================================
-- 6. Notification queue (Phase 1 + 12). Decouple decision from delivery.
-- =============================================================
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_item_id text NOT NULL,
  subscription_endpoint text NOT NULL,
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','sent','failed','dead')),
  attempts integer NOT NULL DEFAULT 0,
  last_attempt_at timestamptz,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_error text,
  UNIQUE (feed_item_id, subscription_endpoint)
);

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='notification_queue' AND policyname='no direct notif queue access') THEN
    CREATE POLICY "no direct notif queue access" ON public.notification_queue FOR SELECT USING (false);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_notif_queue_due ON public.notification_queue(status, next_attempt_at);

-- =============================================================
-- 7. Cleanup cron (Phase 8): prune old logs / raw items nightly.
-- =============================================================
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
    DELETE FROM public.trend_observations WHERE observed_on < current_date - 60;
    DELETE FROM public.notification_queue WHERE status IN ('sent','dead') AND created_at < now() - interval '7 days';
    DELETE FROM public.job_locks     WHERE expires_at  < now() - interval '1 day';
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cleanup cron skipped: %', SQLERRM;
END $$;
