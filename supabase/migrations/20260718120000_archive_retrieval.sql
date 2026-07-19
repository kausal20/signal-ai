-- Repoint Ask Signal / Advisor retrieval to the permanent Content Archive.
-- ---------------------------------------------------------------------------
-- signal_ask_retrieve previously ranked over feed_items (the curated 12/run) +
-- story_embeddings. It now ranks over content_archive + the entity registry, so
-- Advisor and Ask Signal ground on the FULL archive — any company/model/person,
-- old or new. Signature is unchanged (same arg names/types) so ask_intelligence.ts
-- needs no change. The embedding argument is accepted but unused for now (archive
-- embeddings are a later phase; entity + FTS + fuzzy retrieval stands on its own).
-- Runs after the entity migration (needs entity_article_links / entity_aliases).
-- ---------------------------------------------------------------------------

create or replace function public.signal_ask_retrieve(
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
      nullif(trim(q_ts), '')      as ts_raw,
      lower(coalesce(q_raw, ''))   as raw,
      public.normalize_entity_name(q_raw) as norm,
      array(select public.normalize_entity_name(entity)
              from unnest(coalesce(q_entities, '{}'::text[])) entity
             where public.normalize_entity_name(entity) <> '') as ent_norm
  ),
  query as (
    select case when ts_raw is null then null else to_tsquery('english', ts_raw) end as tsq,
           raw, norm, ent_norm
    from input
  ),
  -- Archive articles linked to an entity that matches the query text OR any of
  -- the caller-supplied entity names (normalized alias/name match + trigram).
  entity_hits as (
    select distinct l.article_id
    from public.entity_article_links l
    join public.entities e on e.id = l.entity_id
    cross join query q
    where (q.norm <> '' or array_length(q.ent_norm, 1) is not null) and (
          e.normalized_name = q.norm
       or e.normalized_name = any (q.ent_norm)
       or (q.norm <> '' and e.normalized_name % q.norm)
       or exists (select 1 from public.entity_aliases ea
                   where ea.entity_id = e.id
                     and (ea.normalized_alias = q.norm or ea.normalized_alias = any (q.ent_norm)))
    )
  ),
  candidates as (
    select
      a.*,
      coalesce(ts_rank_cd(a.search_tsv, q.tsq), 0) as text_rank,
      greatest(
        similarity(lower(a.title), q.raw),
        similarity(lower(coalesce(a.summary, '')), q.raw),
        similarity(lower(coalesce(a.source, '')), q.raw)
      ) as fuzzy_rank,
      case when a.id in (select article_id from entity_hits) then 1 else 0 end as entity_match
    from public.content_archive a
    cross join query q
    where a.archive_status = 'active'
      and (not q_today_only or a.published_at >= date_trunc('day', now()))
      and (
        (q.tsq is not null and a.search_tsv @@ q.tsq)
        or a.title        ilike '%' || q.raw || '%'
        or a.summary      ilike '%' || q.raw || '%'
        or a.full_content ilike '%' || q.raw || '%'
        or a.source       ilike '%' || q.raw || '%'
        or a.id in (select article_id from entity_hits)
      )
  )
  select
    c.id, c.title, c.summary,
    null::text as why_it_matters,
    c.url, c.source, c.source_label,
    c.original_category as category,
    null::text as content_category,
    coalesce(c.editorial_score, c.quality_score, 0) as score,
    c.published_at,
    array(select e.canonical_name
            from public.entity_article_links l
            join public.entities e on e.id = l.entity_id
           where l.article_id = c.id
           order by l.confidence desc
           limit 8) as trend_entities,
    (
      c.text_rank * 100
      + c.fuzzy_rank * 35
      + c.entity_match * 40
      + 20 * exp(-extract(epoch from (now() - c.published_at)) / 86400.0 / 21.0)
      + coalesce(c.editorial_score, c.quality_score, 0) * 0.08
    )::real as rank
  from candidates c
  order by rank desc, c.published_at desc
  limit least(15, greatest(5, max_results));
$$;

revoke all on function public.signal_ask_retrieve(text, text, text[], boolean, integer, text) from public, anon, authenticated;
grant execute on function public.signal_ask_retrieve(text, text, text[], boolean, integer, text) to service_role;

-- ── signal_trending (repointed) — empty-query discovery over the archive ─────
-- The search page's empty-state / no-match fallback. Previously read feed_items;
-- now reads content_archive so ALL search surfaces are archive-backed. Freshest
-- active articles, quality-weighted. Same signature + columns (search/index.ts
-- unchanged).
create or replace function public.signal_trending(max_results int default 12)
returns table (
  id text, title text, summary text, why_it_matters text, url text, tag text,
  source text, source_label text, category text, content_category text,
  score int, published_at timestamptz, trend_entities text[]
)
language sql stable
as $$
  select
    a.id, a.title, a.summary,
    null::text as why_it_matters,
    a.url,
    null::text as tag,
    a.source, a.source_label,
    a.original_category as category,
    null::text as content_category,
    coalesce(a.editorial_score, a.quality_score, 0) as score,
    a.published_at,
    array(select e.canonical_name
            from public.entity_article_links l
            join public.entities e on e.id = l.entity_id
           where l.article_id = a.id
           order by l.confidence desc
           limit 8) as trend_entities
  from public.content_archive a
  where a.archive_status = 'active'
  order by
    (coalesce(a.editorial_score, a.quality_score, 0) * 0.6
     + 40 * exp(- extract(epoch from (now() - a.published_at)) / 86400.0 / 14.0)) desc
  limit greatest(1, max_results);
$$;

grant execute on function public.signal_trending(int) to anon, authenticated;
