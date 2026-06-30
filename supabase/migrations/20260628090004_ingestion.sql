-- ============================================================================
-- Signal — Phase 1 Foundation · 0004 INGESTION
-- Tables: source_connectors, source_health, raw_items, fetch_log
-- Purpose: the front of the pipeline — where stories enter the system, plus the
-- telemetry that keeps sources healthy and self-disabling.
-- ============================================================================

-- ── source_connectors ───────────────────────────────────────────────────────
-- Stores: the registry of news/data sources (tier, weight, trust, fetch config).
-- Why: lets the source list + cadence change without redeploying code.
CREATE TABLE IF NOT EXISTS public.source_connectors (
  source        text PRIMARY KEY,
  source_label  text NOT NULL,
  source_kind   text NOT NULL
                  CHECK (source_kind IN ('official','research','community','launch','startup')),
  tier          text NOT NULL DEFAULT 'medium'
                  CHECK (tier IN ('fast','medium','slow')),
  source_weight numeric NOT NULL DEFAULT 1,
  trust_score   numeric NOT NULL DEFAULT 1,
  rss_url       text,
  news_query    text,
  enabled       boolean NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.source_connectors IS 'Source registry: tier, weight, trust, fetch config. Drives ingestion.';

DROP TRIGGER IF EXISTS trg_source_connectors_updated_at ON public.source_connectors;
CREATE TRIGGER trg_source_connectors_updated_at
  BEFORE UPDATE ON public.source_connectors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── source_health ────────────────────────────────────────────────────────────
-- Stores: rolling per-source reliability (failures, uptime, latency, circuit).
-- Why: self-healing — auto-disable failing sources with exponential backoff and
-- auto-recover. One row per connector.
CREATE TABLE IF NOT EXISTS public.source_health (
  source              text PRIMARY KEY REFERENCES public.source_connectors (source) ON DELETE CASCADE,
  consecutive_failures integer NOT NULL DEFAULT 0,
  total_failures      integer NOT NULL DEFAULT 0,
  total_runs          integer NOT NULL DEFAULT 0,
  disabled            boolean NOT NULL DEFAULT false,
  disabled_until      timestamptz,
  last_status         text,
  last_error          text,
  last_ok_at          timestamptz,
  last_failed_at      timestamptz,
  recovered_at        timestamptz,
  last_item_count     integer NOT NULL DEFAULT 0,
  items_fetched_total integer NOT NULL DEFAULT 0,
  avg_response_ms     integer NOT NULL DEFAULT 0,
  success_rate        numeric NOT NULL DEFAULT 0,
  uptime_pct          numeric NOT NULL DEFAULT 100,
  duplicate_rate      numeric NOT NULL DEFAULT 0,
  circuit_state       text NOT NULL DEFAULT 'closed'
                        CHECK (circuit_state IN ('closed','open','half_open')),
  tier                text NOT NULL DEFAULT 'medium',
  updated_at          timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.source_health IS 'Self-healing per-source telemetry: uptime, latency, circuit state, auto-disable window.';

DROP TRIGGER IF EXISTS trg_source_health_updated_at ON public.source_health;
CREATE TRIGGER trg_source_health_updated_at
  BEFORE UPDATE ON public.source_health
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── raw_items ────────────────────────────────────────────────────────────────
-- Stores: normalized fetched items BEFORE curation (with rejection reason).
-- Why: the working set the pipeline dedupes/clusters/curates from; also feeds
-- trend counting. `source` is intentionally NOT an FK (Google-News-derived /
-- ad-hoc sources have no connector row). Time-partition candidate at scale.
CREATE TABLE IF NOT EXISTS public.raw_items (
  id               text PRIMARY KEY,
  canonical_url    text NOT NULL,
  raw_title        text NOT NULL,
  raw_text         text,
  url              text NOT NULL,
  source           text,
  source_label     text,
  source_kind      text,
  source_weight    numeric NOT NULL DEFAULT 1,
  engagement       integer NOT NULL DEFAULT 0,
  published_at     timestamptz NOT NULL,
  cluster_key      text,
  rejection_reason text,
  fetched_at       timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.raw_items IS 'Normalized pre-curation items. rejection_reason NULL = accepted into clustering.';

-- ── fetch_log ────────────────────────────────────────────────────────────────
-- Stores: one row per source fetch attempt (status + count + error).
-- Why: ingestion audit / debugging. Short retention (added in a later phase).
CREATE TABLE IF NOT EXISTS public.fetch_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source        text NOT NULL,
  status        text NOT NULL,
  items_fetched integer NOT NULL DEFAULT 0,
  error         text,
  ran_at        timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE public.fetch_log IS 'Per-fetch audit log (source, status, items, error).';
