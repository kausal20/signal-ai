
-- Push notification subscriptions (anon-friendly, keyed by endpoint)
CREATE TABLE public.push_subscriptions (
  endpoint TEXT PRIMARY KEY,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  user_agent TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  categories TEXT[] NOT NULL DEFAULT ARRAY['tool','news','prompt','use-case'],
  frequency INT NOT NULL DEFAULT 3,
  last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Anyone can read their own (by endpoint) - but we don't expose this client-side, only via edge fn with service role
CREATE POLICY "no direct access" ON public.push_subscriptions FOR SELECT USING (false);

CREATE TABLE public.notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_endpoint TEXT NOT NULL,
  feed_item_id TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'sent',
  UNIQUE (subscription_endpoint, feed_item_id)
);

ALTER TABLE public.notification_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no direct access" ON public.notification_log FOR SELECT USING (false);

CREATE INDEX idx_notif_log_endpoint_day ON public.notification_log (subscription_endpoint, sent_at DESC);

-- Schedule send-notifications every hour
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
