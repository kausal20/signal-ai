ALTER TABLE public.feed_items ADD COLUMN IF NOT EXISTS impact text NOT NULL DEFAULT 'useful';
CREATE INDEX IF NOT EXISTS idx_feed_items_impact ON public.feed_items(impact);
CREATE INDEX IF NOT EXISTS idx_feed_items_published ON public.feed_items(published_at DESC);