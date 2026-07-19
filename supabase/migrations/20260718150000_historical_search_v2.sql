-- Historical intelligence search v2 — refine entity-query behaviour.
-- ---------------------------------------------------------------------------
-- v1 (20260718140000) surfaced entity-linked articles first, then incidental
-- text/source matches. For a token like "github" that also matches source=github
-- on many repo rows, this diluted the company timeline. v2 makes an ENTITY query
-- return ONLY that entity's linked articles — the clean, complete company/product
-- history — ordered strictly published_at DESC (newest first). Free-text queries
-- (no entity match) keep full relevance ranking over the archive text.
--
-- Result: searching "Perplexity" / "Cursor" / "GitHub" returns every archived
-- article ABOUT that entity, newest first, never truncated to recent, never empty
-- just because it hasn't published lately. Same signature + columns.
-- ---------------------------------------------------------------------------

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
      nullif(trim(q_ts), '')             as ts_raw,
      lower(coalesce(q_raw, ''))          as raw,
      public.normalize_entity_name(q_raw)  as norm
  ),
  tsq as (
    select case when (select ts_raw from q) is null then null
                else to_tsquery('english', (select ts_raw from q)) end as query
  ),
  entity_hits as (
    select distinct l.article_id
    from public.entity_article_links l
    join public.entities e on e.id = l.entity_id
    where (select norm from q) <> '' and (
          e.normalized_name = (select norm from q)
       or e.normalized_name % (select norm from q)
       or exists (select 1 from public.entity_aliases ea
                   where ea.entity_id = e.id
                     and ea.normalized_alias = (select norm from q))
    )
  ),
  flags as (select exists (select 1 from entity_hits) as is_entity),
  base as (
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
             limit 8) as trend_entities,
      (
        coalesce(ts_rank_cd(a.search_tsv, (select query from tsq)), 0) * 100
        + greatest(similarity(lower(a.title), (select raw from q)),
                   similarity(lower(coalesce(a.source, '')), (select raw from q))) * 40
        + case when a.id in (select article_id from entity_hits) then 60 else 0 end
        + 20 * exp(- extract(epoch from (now() - a.published_at)) / 86400.0 / 21.0)
        + coalesce(a.editorial_score, a.quality_score, 0) * 0.08
      )::real as rank,
      (select is_entity from flags) as is_entity_query
    from public.content_archive a, tsq
    where a.archive_status = 'active' and (
      case when (select is_entity from flags) then
        -- ENTITY QUERY: the entity's complete linked history, nothing incidental.
        a.id in (select article_id from entity_hits)
      else
        -- FREE-TEXT QUERY: relevance search across archive text.
        (
          (tsq.query is not null and a.search_tsv @@ tsq.query)
          or a.title        ilike '%' || (select raw from q) || '%'
          or a.source       ilike '%' || (select raw from q) || '%'
          or a.summary      ilike '%' || (select raw from q) || '%'
          or a.full_content ilike '%' || (select raw from q) || '%'
          or ((select raw from q) <> '' and (
               similarity(lower(a.title), (select raw from q)) > 0.15
            or similarity(lower(coalesce(a.source, '')), (select raw from q)) > 0.25
          ))
        )
      end
    )
  )
  select
    id, title, summary, why_it_matters, url, tag,
    source, source_label, category, content_category,
    score, published_at, trend_entities, rank
  from base
  order by
    -- Entity query → strict newest-first (historical timeline).
    -- Free-text query → relevance rank (freshness already folded in).
    case when is_entity_query then extract(epoch from published_at) else rank end desc,
    published_at desc
  limit (select case when is_entity then greatest(max_results, 500) else greatest(1, max_results) end from flags);
$$;
