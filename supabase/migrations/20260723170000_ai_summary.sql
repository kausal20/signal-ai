-- ============================================================================
-- SIGNAL SUMMARY · per-article grounded AI summary (Top Story card + reuse)
-- ----------------------------------------------------------------------------
-- Adds a dedicated `ai_summary` column on content_archive so the Top Story card
-- (and any surface that wants a "what this article is about" line) reads a
-- cached, factual 3-4 line summary instead of the raw article introduction.
-- Regenerated only when the article changes (guarded via ai_summary_hash).
-- ============================================================================

alter table public.content_archive
  add column if not exists ai_summary               text,
  add column if not exists ai_summary_generated_at  timestamptz,
  add column if not exists ai_summary_hash          text;   -- md5(title|full_content) at generation time

create index if not exists idx_ca_needs_summary
  on public.content_archive (published_at desc)
  where ai_summary is null and archive_status = 'active';

-- Extend signal_search RETURNS TABLE to include ai_summary (nullable) so any
-- entity/free-text query can render the AI summary when present.
-- Postgres refuses to CREATE OR REPLACE when RETURNS TABLE changes — drop first.
drop function if exists public.signal_search(text, text, integer);
create function public.signal_search(q_ts text, q_raw text, max_results integer default 30)
returns table(
  id text, title text, summary text, why_it_matters text, url text, tag text,
  source text, source_label text, category text, content_category text,
  score integer, published_at timestamptz, trend_entities text[], rank real,
  content_type text, publisher text, publisher_domain text, original_url text,
  section text, is_official_company_news boolean, event_type text,
  editorial_quality_score integer, source_type text, is_official_source boolean, trust_score integer,
  ai_summary text
)
language sql stable as $function$
  with q as (
    select nullif(trim(q_ts), '') as ts_raw,
           lower(coalesce(q_raw, '')) as raw,
           public.normalize_entity_name(q_raw) as norm
  ),
  tsq as (
    select case when (select ts_raw from q) is null then null
                else to_tsquery('english', (select ts_raw from q)) end as query
  ),
  resolved as (select r.entity_id from public.resolve_entity(q_raw) r),
  entity_hits as (
    select l.article_id,
           max(case l.mention_type when 'primary' then 3 when 'product' then 2 else 1 end) as mtype_rank,
           max(l.confidence) as conf
    from public.entity_article_links l
    join public.entities e on e.id = l.entity_id
    where (select norm from q) <> '' and (
          e.normalized_name = (select norm from q)
       or e.normalized_name % (select norm from q)
       or exists (select 1 from public.entity_aliases ea
                   where ea.entity_id = e.id and ea.normalized_alias = (select norm from q))
    )
    group by l.article_id
  ),
  flags as (select exists (select 1 from entity_hits) as is_entity, (select entity_id from resolved) as rid),
  base as (
    select
      a.id, a.title, a.summary, null::text as why_it_matters, a.url, null::text as tag,
      a.source, a.source_label, a.original_category as category, null::text as content_category,
      coalesce(a.editorial_score, a.quality_score, 0) as score, a.published_at,
      array(select e.canonical_name from public.entity_article_links l
              join public.entities e on e.id = l.entity_id
             where l.article_id = a.id order by l.confidence desc limit 8) as trend_entities,
      (
        coalesce(ts_rank_cd(a.search_tsv, (select query from tsq)), 0) * 100
        + greatest(similarity(lower(a.title), (select raw from q)),
                   similarity(lower(coalesce(a.source, '')), (select raw from q))) * 40
        + case when a.id in (select article_id from entity_hits) then 60 else 0 end
        + coalesce(eh.conf, 0) * 20
        + 20 * exp(- extract(epoch from (now() - a.published_at)) / 86400.0 / 21.0)
        + coalesce(a.editorial_score, a.quality_score, 0) * 0.08
        + case when a.official_entity_id is not null and a.official_entity_id = (select rid from flags) then 120
               when coalesce(a.is_official_source, false) then 20 else 0 end
      )::real as rank,
      coalesce(a.content_type, 'news') as content_type,
      a.publisher, a.publisher_domain, coalesce(a.original_url, a.url) as original_url,
      coalesce(a.is_official_company_news, false) as is_official_event,
      a.event_type, a.editorial_quality_score,
      coalesce(a.source_type, 'INDUSTRY_MEDIA') as source_type,
      coalesce(a.is_official_source, false) as is_official_source,
      coalesce(a.trust_score, 90) as trust_score,
      a.ai_summary,
      coalesce(eh.mtype_rank, 0) as mtype_rank,
      a.official_entity_id,
      (select is_entity from flags) as is_entity_query
    from public.content_archive a
    cross join tsq
    left join entity_hits eh on eh.article_id = a.id
    where a.archive_status = 'active' and (
      case when (select is_entity from flags) then a.id in (select article_id from entity_hits)
      else (
        (tsq.query is not null and a.search_tsv @@ tsq.query)
        or a.title ilike '%' || (select raw from q) || '%'
        or a.source ilike '%' || (select raw from q) || '%'
        or a.summary ilike '%' || (select raw from q) || '%'
        or a.full_content ilike '%' || (select raw from q) || '%'
        or ((select raw from q) <> '' and (
             similarity(lower(a.title), (select raw from q)) > 0.15
          or similarity(lower(coalesce(a.source, '')), (select raw from q)) > 0.25))
      ) end
    )
  ),
  sectioned as (
    select *,
      case
        when not is_entity_query then null
        when official_entity_id is not null and official_entity_id = (select rid from flags) then 'official'
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
    id, title, summary, why_it_matters, url, tag, source, source_label, category, content_category,
    score, published_at, trend_entities, rank, content_type, publisher, publisher_domain, original_url,
    section, is_official_event as is_official_company_news, event_type, editorial_quality_score,
    source_type, is_official_source, trust_score, ai_summary
  from sectioned
  order by
    case section
      when 'official' then 0 when 'analysis' then 1 when 'review' then 2 when 'comparison' then 3
      when 'tutorial' then 4 when 'benchmark' then 5 when 'list' then 6 when 'repo' then 7
      when 'opinion' then 8 when 'mentioned' then 9 else 0 end asc,
    rank desc,
    published_at desc
  limit (select case when is_entity then greatest(max_results, 500) else greatest(1, max_results) end from flags);
$function$;
