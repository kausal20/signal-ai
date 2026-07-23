-- signal_search v6 — surface source intelligence + rank OFFICIAL above MEDIA.
-- ---------------------------------------------------------------------------
-- Adds source_type, is_official_source, trust_score to the result. Within every
-- section, a company's OWN source (Perplexity Blog, Official GitHub, Official
-- Research) now ranks above third-party media coverage (TechCrunch, Bloomberg),
-- which ranks above lower-trust community — official never REPLACES media, both
-- are returned. Editorial sections + relevance are otherwise unchanged.
-- ---------------------------------------------------------------------------

drop function if exists public.signal_search(text, text, int);

create function public.signal_search(q_ts text, q_raw text, max_results int default 30)
returns table (
  id text, title text, summary text, why_it_matters text, url text, tag text,
  source text, source_label text, category text, content_category text,
  score int, published_at timestamptz, trend_entities text[], rank real,
  content_type text, publisher text, publisher_domain text, original_url text,
  section text, is_official_company_news boolean, event_type text, editorial_quality_score int,
  source_type text, is_official_source boolean, trust_score int
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
      coalesce(a.content_type, 'news') as content_type,
      a.publisher, a.publisher_domain,
      coalesce(a.original_url, a.url) as original_url,
      coalesce(a.is_official_company_news, false) as is_official,
      a.event_type, a.editorial_quality_score,
      coalesce(a.source_type, 'INDUSTRY_MEDIA') as source_type,
      coalesce(a.is_official_source, false) as is_official_source,
      coalesce(a.trust_score, 90) as trust_score,
      coalesce(eh.mtype_rank, 0) as mtype_rank,
      (select is_entity from flags) as is_entity_query
    from public.content_archive a
    cross join tsq
    left join entity_hits eh on eh.article_id = a.id
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
  ),
  sectioned as (
    select *,
      case
        when not is_entity_query then null
        when is_official then 'official'
        when mtype_rank < 3 then 'mentioned'
        when content_type = 'tutorial' then 'tutorial'
        when content_type = 'opinion' then 'opinion'
        when content_type = 'review' then 'review'
        when content_type = 'comparison' then 'comparison'
        when content_type in ('repo','documentation') then 'repo'
        when content_type = 'benchmark' then 'benchmark'
        when content_type = 'listicle' then 'list'
        else 'analysis'
      end as section
    from base
  )
  select
    id, title, summary, why_it_matters, url, tag,
    source, source_label, category, content_category,
    score, published_at, trend_entities, rank,
    content_type, publisher, publisher_domain, original_url,
    section, is_official as is_official_company_news, event_type, editorial_quality_score,
    source_type, is_official_source, trust_score
  from sectioned
  order by
    case section
      when 'official' then 0 when 'analysis' then 1 when 'review' then 2
      when 'comparison' then 3 when 'tutorial' then 4 when 'benchmark' then 5
      when 'list' then 6 when 'repo' then 7 when 'opinion' then 8
      when 'mentioned' then 9 else 0
    end asc,
    -- Official company sources rank above media; higher trust first.
    is_official_source desc,
    trust_score desc,
    case when is_entity_query then extract(epoch from published_at) else rank end desc,
    published_at desc
  limit (select case when is_entity then greatest(max_results, 500) else greatest(1, max_results) end from flags);
$$;

grant execute on function public.signal_search(text, text, int) to anon, authenticated;
