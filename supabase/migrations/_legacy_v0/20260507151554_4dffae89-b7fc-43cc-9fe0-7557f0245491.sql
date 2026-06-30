ALTER TABLE public.feed_items 
  ADD COLUMN IF NOT EXISTS who_for text,
  ADD COLUMN IF NOT EXISTS vibe_friendly boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS usefulness integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS humanized boolean DEFAULT false;

-- Clear existing technical/raw items so the new humanized pipeline repopulates
DELETE FROM public.feed_items;