-- Signal Analysis cache — store the full structured analysis (9 sections) as
-- jsonb so re-opening the sheet is instant and the new sections survive caching.
-- Additive; legacy columns on news_intelligence are untouched.

alter table public.news_intelligence add column if not exists analysis jsonb;
