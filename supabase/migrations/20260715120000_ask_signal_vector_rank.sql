-- Adds the stored Signal story-vector signal to Ask Signal's hybrid retrieval.
-- The Edge Function supplies a deterministic vector using the same fallback
-- representation used by the ingestion pipeline, so no second AI provider is
-- called on a user request.

drop function if exists public.signal_ask_retrieve(text, text, text[], boolean, integer);

create function public.signal_ask_retrieve(
  q_ts text,
  q_raw text,
  q_entities text[] default '{}'::text[],
  q_today_only boolean default false,
  max_results integer default 12,
  q_embedding text default null
)
returns table (
  id text,
  title text,
  summary text,
  why_it_matters text,
  url text,
  source text,
  source_label text,
  category text,
  content_category text,
  score integer,
  published_at timestamptz,
  trend_entities text[],
  rank real
)
language sql
stable
set search_path = public
as $$
  with input as (
    select
      nullif(trim(q_ts), '') as ts_raw,
      lower(coalesce(q_raw, '')) as raw,
      array(select lower(trim(entity)) from unnest(coalesce(q_entities, '{}'::text[])) entity where trim(entity) <> '') as entities,
      case when nullif(q_embedding, '') is null then null else q_embedding::vector end as embedding
  ), query as (
    select case when ts_raw is null then null else to_tsquery('english', ts_raw) end as tsq, raw, entities, embedding
    from input
  ), candidates as (
    select
      f.*,
      coalesce(ts_rank_cd(f.search_tsv, q.tsq), 0) as text_rank,
      greatest(
        similarity(lower(f.title), q.raw),
        similarity(lower(coalesce(f.summary, '')), q.raw),
        similarity(lower(coalesce(f.source, '')), q.raw)
      ) as fuzzy_rank,
      case when se.model = 'hash:fallback' and q.embedding is not null
        then greatest(0, 1 - (se.embedding <=> q.embedding)) else 0 end as semantic_rank,
      case when exists (
        select 1
        from unnest(coalesce(f.trend_entities, '{}'::text[])) item_entity
        join unnest(q.entities) query_entity
          on lower(item_entity) = query_entity
          or lower(item_entity) like '%' || query_entity || '%'
          or query_entity like '%' || lower(item_entity) || '%'
      ) then 1 else 0 end as entity_match
    from public.feed_items f
    cross join query q
    left join public.story_embeddings se on se.feed_item_id = f.id
    where
      (not q_today_only or f.published_at >= date_trunc('day', now()))
      and (
        (q.tsq is not null and f.search_tsv @@ q.tsq)
        or f.title ilike '%' || q.raw || '%'
        or f.summary ilike '%' || q.raw || '%'
        or f.source ilike '%' || q.raw || '%'
        or exists (
          select 1
          from unnest(coalesce(f.trend_entities, '{}'::text[])) item_entity
          join unnest(q.entities) query_entity
            on lower(item_entity) = query_entity
            or lower(item_entity) like '%' || query_entity || '%'
            or query_entity like '%' || lower(item_entity) || '%'
        )
      )
  )
  select
    id, title, summary, why_it_matters, url, source, source_label,
    category, content_category, score, published_at, trend_entities,
    (
      semantic_rank * 45
      + text_rank * 100
      + fuzzy_rank * 35
      + entity_match * 30
      + 20 * exp(-extract(epoch from (now() - published_at)) / 86400.0 / 21.0)
      + score * 0.08
    )::real as rank
  from candidates
  order by rank desc, published_at desc
  limit least(15, greatest(5, max_results));
$$;

revoke all on function public.signal_ask_retrieve(text, text, text[], boolean, integer, text) from public, anon, authenticated;
grant execute on function public.signal_ask_retrieve(text, text, text[], boolean, integer, text) to service_role;
