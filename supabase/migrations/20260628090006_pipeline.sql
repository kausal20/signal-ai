-- Signal — Phase 1 Foundation · 0006 PIPELINE / OPS
CREATE TABLE IF NOT EXISTS public.pipeline_runs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trigger              text NOT NULL,
  status               text NOT NULL DEFAULT 'running'
                         CHECK (status IN ('running','completed','failed','partial')),
  started_at           timestamptz NOT NULL DEFAULT now(),
  ended_at             timestamptz,
  duration_ms          integer,
  sources_processed    integer NOT NULL DEFAULT 0,
  sources_ok           integer NOT NULL DEFAULT 0,
  stories_fetched      integer NOT NULL DEFAULT 0,
  stories_accepted     integer NOT NULL DEFAULT 0,
  stories_rejected     integer NOT NULL DEFAULT 0,
  stories_clustered    integer NOT NULL DEFAULT 0,
  stories_published    integer NOT NULL DEFAULT 0,
  notifications_queued integer NOT NULL DEFAULT 0,
  notifications_sent   integer NOT NULL DEFAULT 0,
  fallback_used        boolean NOT NULL DEFAULT false,
  error_count          integer NOT NULL DEFAULT 0,
  stage_timings        jsonb NOT NULL DEFAULT '{}'::jsonb,
  stage_results        jsonb NOT NULL DEFAULT '{}'::jsonb,
  errors               jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS public.event_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  pipeline_id uuid,
  level       text NOT NULL DEFAULT 'info'
                CHECK (level IN ('debug','info','warn','error')),
  event       text NOT NULL,
  stage       text,
  source      text,
  message     text,
  retry_count integer NOT NULL DEFAULT 0,
  duration_ms integer,
  stack       text,
  context     jsonb
);

CREATE TABLE IF NOT EXISTS public.job_locks (
  job_name   text PRIMARY KEY,
  locked_at  timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  holder     text
);

CREATE TABLE IF NOT EXISTS public.circuit_breakers (
  name                 text PRIMARY KEY,
  state                text NOT NULL DEFAULT 'closed'
                         CHECK (state IN ('closed','open','half_open')),
  consecutive_failures integer NOT NULL DEFAULT 0,
  opened_at            timestamptz,
  reset_at             timestamptz,
  last_error           text,
  updated_at           timestamptz NOT NULL DEFAULT now()
);

DROP TRIGGER IF EXISTS trg_circuit_breakers_updated_at ON public.circuit_breakers;
CREATE TRIGGER trg_circuit_breakers_updated_at
  BEFORE UPDATE ON public.circuit_breakers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
