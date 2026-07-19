-- Signal Search — full-text + fuzzy search across the ENTIRE feed archive.
-- Additive: adds a generated tsvector, indexes, and read-only search RPCs.
-- Nothing existing is modified or dropped.

create extension if not exists pg_trgm;

-- Weighted full-text vector over every meaningful field (title highest).
-- `array_to_string` is not immutable, so PostgreSQL cannot use this as a
-- generated column. A trigger keeps the searchable document current instead.
alter table public.feed_items
  add column if not exists search_tsv tsvector;

create or replace function public.refresh_feed_item_search_tsv()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.source, '') || ' ' || coalesce(new.source_label, '') || ' ' ||
                                     coalesce(array_to_string(new.trend_entities, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.tag, '') || ' ' || coalesce(new.category, '') || ' ' ||
                                     coalesce(new.content_category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.summary, '') || ' ' || coalesce(new.why_it_matters, '') || ' ' ||
                                     coalesce(new.what_happened, '')), 'D');
  return new;
end;
$$;

drop trigger if exists trg_feed_items_search_tsv on public.feed_items;
create trigger trg_feed_items_search_tsv
before insert or update of title, source, source_label, trend_entities, tag, category,
  content_category, summary, why_it_matters, what_happened
on public.feed_items
for each row execute function public.refresh_feed_item_search_tsv();

update public.feed_items
set search_tsv =
  setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
  setweight(to_tsvector('english', coalesce(source, '') || ' ' || coalesce(source_label, '') || ' ' ||
                                   coalesce(array_to_string(trend_entities, ' '), '')), 'B') ||
  setweight(to_tsvector('english', coalesce(tag, '') || ' ' || coalesce(category, '') || ' ' ||
                                   coalesce(content_category, '')), 'C') ||
  setweight(to_tsvector('english', coalesce(summary, '') || ' ' || coalesce(why_it_matters, '') || ' ' ||
                                   coalesce(what_happened, '')), 'D');

-- Full-text index (fast FTS) + trigram indexes (typo / partial / fuzzy).
create index if not exists idx_feed_items_search_tsv on public.feed_items using gin (search_tsv);
create index if not exists idx_feed_items_title_trgm  on public.feed_items using gin (title gin_trgm_ops);
create index if not exists idx_feed_items_source_trgm on public.feed_items using gin (source gin_trgm_ops);
create index if not exists idx_feed_items_summary_trgm on public.feed_items using gin (summary gin_trgm_ops);

-- ── Ranked search across ALL time ───────────────────────────────────────────
-- Relevance (ts_rank_cd + trigram similarity) → Freshness → Signal Score →
-- Popularity. No date filter: the whole archive is searchable; recency is a
-- boost, not a cut-off. `q_ts` is a pre-expanded OR tsquery ("gpt | openai …").
create or replace function public.signal_search(q_ts text, q_raw text, max_results int default 30)
returns table (
  id text, title text, summary text, why_it_matters text, url text, tag text,
  source text, source_label text, category text, content_category text,
  score int, published_at timestamptz, trend_entities text[], rank real
)
language sql stable
as $$
  with q as (
    select
      nullif(trim(q_ts), '')  as ts_raw,
      lower(coalesce(q_raw, '')) as raw
  ),
  tsq as (
    select case when (select ts_raw from q) is null then null
                else to_tsquery('english', (select ts_raw from q)) end as query
  )
  select
    f.id, f.title, f.summary, f.why_it_matters, f.url, f.tag,
    f.source, f.source_label, f.category, f.content_category,
    f.score, f.published_at, f.trend_entities,
    (
      coalesce(ts_rank_cd(f.search_tsv, (select query from tsq)), 0) * 100
      + greatest(similarity(lower(f.title), (select raw from q)),
                 similarity(lower(coalesce(f.source, '')), (select raw from q))) * 40
      + 20 * exp(- extract(epoch from (now() - f.published_at)) / 86400.0 / 21.0)
      + f.score * 0.08
      + least(10, f.engagement * 0.02)
    )::real as rank
  from public.feed_items f, tsq
  where
    (tsq.query is not null and f.search_tsv @@ tsq.query)
    or f.title   ilike '%' || (select raw from q) || '%'
    or f.source  ilike '%' || (select raw from q) || '%'
    or f.summary ilike '%' || (select raw from q) || '%'
    or (select raw from q) <> '' and (
         similarity(lower(f.title), (select raw from q)) > 0.15
      or similarity(lower(coalesce(f.source, '')), (select raw from q)) > 0.25
    )
  order by rank desc
  limit greatest(1, max_results);
$$;

-- Fallback so the search page is never empty: freshest high-signal stories.
create or replace function public.signal_trending(max_results int default 12)
returns table (
  id text, title text, summary text, why_it_matters text, url text, tag text,
  source text, source_label text, category text, content_category text,
  score int, published_at timestamptz, trend_entities text[]
)
language sql stable
as $$
  select
    f.id, f.title, f.summary, f.why_it_matters, f.url, f.tag,
    f.source, f.source_label, f.category, f.content_category,
    f.score, f.published_at, f.trend_entities
  from public.feed_items f
  order by
    (f.score * 0.6 + 40 * exp(- extract(epoch from (now() - f.published_at)) / 86400.0 / 14.0)) desc
  limit greatest(1, max_results);
$$;

-- These read-only functions run with the caller's rights (SECURITY INVOKER by
-- default). feed_items is already readable by the app roles.
grant execute on function public.signal_search(text, text, int) to anon, authenticated;
grant execute on function public.signal_trending(int) to anon, authenticated;
