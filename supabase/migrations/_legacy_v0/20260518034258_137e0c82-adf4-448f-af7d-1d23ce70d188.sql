ALTER TABLE public.push_subscriptions
  ADD COLUMN IF NOT EXISTS importance_level text NOT NULL DEFAULT 'balanced',
  ADD COLUMN IF NOT EXISTS quiet_mode boolean NOT NULL DEFAULT false;