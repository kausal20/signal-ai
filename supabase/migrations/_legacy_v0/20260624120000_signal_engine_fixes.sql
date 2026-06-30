-- Signal engine fixes: unblock publishing, source health, notification durability.

-- 1. Publishing pipeline was storing ZERO rows because the edge function upserts
--    these fields but the columns never existed -> PostgREST rejected the whole batch.
ALTER TABLE public.feed_items
  ADD COLUMN IF NOT EXISTS who_for text,
  ADD COLUMN IF NOT EXISTS usefulness integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vibe_friendly boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS corroboration_score integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS source_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS opportunity_score integer NOT NULL DEFAULT 0;

-- 2. Source health monitoring + automatic disabling of failing sources.
CREATE TABLE IF NOT EXISTS public.source_health (
  source text PRIMARY KEY,
  source_label text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  total_failures integer NOT NULL DEFAULT 0,
  total_runs integer NOT NULL DEFAULT 0,
  disabled boolean NOT NULL DEFAULT false,
  last_status text,
  last_error text,
  last_ok_at timestamptz,
  last_item_count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.source_health ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'source_health'
      AND policyname = 'public read source health'
  ) THEN
    CREATE POLICY "public read source health" ON public.source_health
      FOR SELECT USING (true);
  END IF;
END $$;

-- 3. Notification durability: track delivery attempts.
ALTER TABLE public.notification_log
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS delivered_at timestamptz;

-- 4. Schedule notification delivery independently (was only triggered inline).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'send-signal-notifications') THEN
    PERFORM cron.unschedule('send-signal-notifications');
  END IF;
  PERFORM cron.schedule(
    'send-signal-notifications',
    '15 * * * *',
    $cron$
    SELECT net.http_post(
      url := 'https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/send-notifications',
      headers := '{"Content-Type":"application/json"}'::jsonb,
      body := '{"trigger":"cron"}'::jsonb
    );
    $cron$
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'cron scheduling skipped: %', SQLERRM;
END $$;
