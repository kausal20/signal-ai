
CREATE TABLE public.feed_items (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  why_it_matters TEXT,
  url TEXT NOT NULL,
  tag TEXT NOT NULL,
  source TEXT NOT NULL,
  category TEXT NOT NULL,
  score INT NOT NULL DEFAULT 0,
  engagement INT NOT NULL DEFAULT 0,
  underrated BOOLEAN DEFAULT false,
  growth TEXT,
  published_at TIMESTAMPTZ NOT NULL,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_feed_items_published ON public.feed_items (published_at DESC);
CREATE INDEX idx_feed_items_tag ON public.feed_items (tag);

ALTER TABLE public.feed_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read feed" ON public.feed_items FOR SELECT USING (true);

CREATE TABLE public.fetch_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL,
  status TEXT NOT NULL,
  items_fetched INT DEFAULT 0,
  error TEXT
);

ALTER TABLE public.fetch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read fetch log" ON public.fetch_log FOR SELECT USING (true);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
