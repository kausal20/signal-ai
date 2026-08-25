-- ============================================================================
-- Search fix, part 2: "why did sources disappear?" — the fix in
-- 20260731030000 (own-domain rows always rank #1) exposed a pre-existing
-- frontend behavior: SearchPage renders a collapsed, bucketed "entity mode"
-- view (secondary sections default to 3 visible items behind "See all")
-- whenever ANY result row carries a non-null `section`. Two things were
-- forcing that mode on far more queries than intended:
--
--   1. entity_hits matched ANY entity type, including noisy auto-extracted
--      rows ("chat agent", "Agent blueprint", "agent loop", "Computer Use
--      API") — typing a common word fuzzy-matched one of these.
--   2. A bare exact-name match (confidence>=90) alone was enough to force
--      entity mode — a standalone noise entity literally named "Agent"
--      (type=product, no domain) exact-matched the word "agent".
--
-- Neither case has a real domain to point to, so labeling results "official"
-- was never honest for them anyway. Fix: entity/official mode now requires a
-- REAL signal — either genuine company-type article history, or a known
-- domain. No domain, no company history → graceful flat fallback: every
-- result keeps rank/order but section=null, so the frontend shows the normal
-- uncollapsed list. Nothing is ever excluded from the result set by this
-- change — verified firecrawl/docker/agent all keep their full row counts,
-- just unsectioned.
-- ============================================================================

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
  resolved as (
    select r.r_entity_id as entity_id, r.r_official_domain as official_domain,
           r.r_confidence as confidence, r.r_canonical_name as canonical_name
    from public.resolve_query(q_raw, 1) r
    order by r.r_confidence desc
    limit 1
  ),
  -- Scoped to publisher-like types only — real companies keep a
  -- company/organization/lab-typed row even when a noisier product/model
  -- duplicate also exists (verified: Cursor, Perplexity, Runway, ElevenLabs,
  -- Lovable all do), so this loses no genuine company match.
  entity_hits as (
    select l.article_id,
           max(case l.mention_type when 'primary' then 3 when 'product' then 2 else 1 end) as mtype_rank,
           max(l.confidence) as conf
    from public.entity_article_links l
    join public.entities e on e.id = l.entity_id
    where (select norm from q) <> ''
      and e.type in ('company','organization','lab','research_lab','startup','cloud_provider','investor')
      and (
          e.normalized_name = (select norm from q)
       or e.normalized_name % (select norm from q)
       or exists (select 1 from public.entity_aliases ea
                   where ea.entity_id = e.id and ea.normalized_alias = (select norm from q))
    )
    group by l.article_id
  ),
  flags as (
    select
      -- Graceful fallback: entity/official mode ONLY when there's a real
      -- domain-bound or company-history signal — a bare name match, however
      -- confident, is not enough to claim "official" without a domain.
      (exists (select 1 from entity_hits)
       or (select official_domain from resolved) is not null
      ) as is_entity,
      (select entity_id from resolved) as rid,
      (select official_domain from resolved) as rdomain
  ),
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
        + case when (select rdomain from flags) is not null
                and a.publisher_domain = (select rdomain from flags)
               then 1000 else 0 end
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
      (select is_entity from flags) as is_entity_query,
      (a.publisher_domain is not null and a.publisher_domain = (select rdomain from flags)) as is_domain_match
    from public.content_archive a
    cross join tsq
    left join entity_hits eh on eh.article_id = a.id
    where a.archive_status = 'active' and (
      (tsq.query is not null and a.search_tsv @@ tsq.query)
      or a.title ilike '%' || (select raw from q) || '%'
      or a.source ilike '%' || (select raw from q) || '%'
      or a.summary ilike '%' || (select raw from q) || '%'
      or a.full_content ilike '%' || (select raw from q) || '%'
      or ((select raw from q) <> '' and (
           similarity(lower(a.title), (select raw from q)) > 0.15
        or similarity(lower(coalesce(a.source, '')), (select raw from q)) > 0.25))
      or a.id in (select article_id from entity_hits)
      or ((select rdomain from flags) is not null and a.publisher_domain = (select rdomain from flags))
    )
  ),
  sectioned as (
    select *,
      case
        when is_domain_match then 'official'
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
    is_domain_match desc,
    case section
      when 'official' then 0 when 'analysis' then 1 when 'review' then 2 when 'comparison' then 3
      when 'tutorial' then 4 when 'benchmark' then 5 when 'list' then 6 when 'repo' then 7
      when 'opinion' then 8 when 'mentioned' then 9 else 0 end asc,
    rank desc,
    published_at desc
  limit greatest(1, max_results);
$function$;
