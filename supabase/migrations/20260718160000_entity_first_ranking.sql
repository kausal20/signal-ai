-- Entity-first search ranking — primary company articles outrank generic
-- mentions, GitHub repos, comparison/list posts.
-- ---------------------------------------------------------------------------
-- For an ENTITY query, results are ordered by an entity_relevance score (not raw
-- recency), then newest-first within a tier:
--   +100  the searched entity is the article's PRIMARY entity
--   + 40  it is a product-type mention
--   + 30×confidence  strength of the link
--   + 60  the entity name is in the TITLE
--   + 20  the entity name is in the SUMMARY
--   − up to 50  generic list/aggregator penalty: articles linked to many
--               entities (repos like "system-prompts-and-models-of-ai-tools",
--               comparison round-ups) are demoted.
-- Free-text queries keep the existing relevance ranking. Same signature/columns.
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
  -- Per-article link to the SEARCHED entity: strongest mention_type + confidence.
  entity_hits as (
    select
      l.article_id,
      max(case l.mention_type when 'primary' then 3 when 'product' then 2 else 1 end) as mtype_rank,
      max(l.confidence) as conf
    from public.entity_article_links l
    join public.entities e on e.id = l.entity_id
    where (select norm from q) <> '' and (
          e.normalized_name = (select norm from q)
       or e.normalized_name % (select norm from q)
       or exists (select 1 from public.entity_aliases ea
                   where ea.entity_id = e.id
                     and ea.normalized_alias = (select norm from q))
    )
    group by l.article_id
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
      (select is_entity from flags) as is_entity_query,
      -- Entity-first relevance: primacy ▶ strength ▶ title/summary ▶ list penalty.
      (
          case eh.mtype_rank when 3 then 100 when 2 then 40 else 0 end
        + 30 * coalesce(eh.conf, 0)
        + case when a.title   ilike '%' || (select raw from q) || '%' then 60 else 0 end
        + case when a.summary ilike '%' || (select raw from q) || '%' then 20 else 0 end
        - least(50, greatest(0, lc.n - 8) * 5)
      )::real as entity_relevance
    from public.content_archive a
    cross join tsq
    left join entity_hits eh on eh.article_id = a.id
    left join lateral (
      select count(*)::int as n from public.entity_article_links l2 where l2.article_id = a.id
    ) lc on true
    where a.archive_status = 'active' and (
      case when (select is_entity from flags) then
        a.id in (select article_id from entity_hits)
      else
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
    -- Entity query → entity-first relevance, newest-first within a tier.
    -- Free-text query → relevance rank.
    case when is_entity_query then entity_relevance else rank end desc,
    published_at desc
  limit (select case when is_entity then greatest(max_results, 500) else greatest(1, max_results) end from flags);
$$;
