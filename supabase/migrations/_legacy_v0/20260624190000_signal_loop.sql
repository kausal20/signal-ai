-- V4.1 — connect the learning loop. Additive only. Enables batched, deduped,
-- retry-safe behavioural capture from the frontend. No intelligence-engine /
-- personalization logic is changed by this migration.

-- Client-generated idempotency key so retried / duplicated uploads never
-- double-count. Nullable (legacy single-event callers omit it).
ALTER TABLE public.user_signals ADD COLUMN IF NOT EXISTS event_id text;

-- Dedupe: a given client event lands at most once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_signals_event_id
  ON public.user_signals(event_id) WHERE event_id IS NOT NULL;

-- Same idempotency for outcome events.
ALTER TABLE public.outcome_events ADD COLUMN IF NOT EXISTS event_id text;
CREATE UNIQUE INDEX IF NOT EXISTS uq_outcome_events_event_id
  ON public.outcome_events(event_id) WHERE event_id IS NOT NULL;

-- Helpful index for the Learning Engine's per-client watermark scan.
CREATE INDEX IF NOT EXISTS idx_user_signals_client_time
  ON public.user_signals(client_id, occurred_at);
