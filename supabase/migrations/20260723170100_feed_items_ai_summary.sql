-- feed_items also gets ai_summary + hash so Home Top Story (which uses
-- curated cluster IDs, not content_archive IDs) can cache its Signal Summary.
alter table public.feed_items
  add column if not exists ai_summary      text,
  add column if not exists ai_summary_hash text;
