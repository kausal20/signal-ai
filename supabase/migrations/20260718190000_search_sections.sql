-- Entity search sections + tiers — Bloomberg-style "Official Company News" vs
-- "Related Mentions". signal_search now emits, per row: content_type, publisher,
-- publisher_domain, original_url, section ('official'|'mention'), tier (1..5).
-- ---------------------------------------------------------------------------
-- ENTITY query tiers (searched-entity mention_type × content_type):
--   1  primary subject + news-type (news/funding/launch/product_update/
--      acquisition/partnership/research/interview)   → Official Company News
--   2  primary subject + other (opinion/review/…)     → Official Company News
--   3  strong secondary (product mention, or mentioned w/ confidence ≥ .75)
--   4  weak mention
--   5  low-value (repo/tutorial/comparison/benchmark/listicle/documentation) —
--      ALWAYS bottom, even if the entity is in the title
--   section = 'official' for tiers 1-2, else 'mention'. Order: tier asc, newest.
-- FREE-TEXT query: unchanged relevance ranking; section/tier null.
-- Same first 14 columns as before (back-compatible); 6 new trailing columns.
-- ---------------------------------------------------------------------------

drop function if exists public.signal_search(text, text, int);

create function public.signal_search(q_ts text, q_raw text, max_results int default 30)
returns table (
  id text, title text, summary text, why_it_matters text, url text, tag text,
  source text, source_label text, category text, content_category text,
  score int, published_at timestamptz, trend_entities text[], rank real,
  content_type text, publisher text, publisher_domain text, original_url text,
  section text, tier int
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
      a.publisher,
      a.publisher_domain,
      coalesce(a.original_url, a.url) as original_url,
      (select is_entity from flags) as is_entity_query,
      -- Tier (entity queries only; free-text leaves it null via the outer select)
      case
        when coalesce(a.content_type, 'news') in ('repo','tutorial','comparison','benchmark','listicle','documentation') then 5
        when eh.mtype_rank = 3 and coalesce(a.content_type, 'news') in
             ('news','funding','launch','product_update','acquisition','partnership','research','interview') then 1
        when eh.mtype_rank = 3 then 2
        when eh.mtype_rank = 2 or (eh.mtype_rank = 1 and coalesce(eh.conf, 0) >= 0.75) then 3
        else 4
      end as tier_calc
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
  )
  select
    id, title, summary, why_it_matters, url, tag,
    source, source_label, category, content_category,
    score, published_at, trend_entities, rank,
    content_type, publisher, publisher_domain, original_url,
    case when is_entity_query then (case when tier_calc <= 2 then 'official' else 'mention' end) else null end as section,
    case when is_entity_query then tier_calc else null end as tier
  from base
  order by
    case when is_entity_query then tier_calc else 0 end asc,
    case when is_entity_query then extract(epoch from published_at) else rank end desc,
    published_at desc
  limit (select case when is_entity then greatest(max_results, 500) else greatest(1, max_results) end from flags);
$$;

grant execute on function public.signal_search(text, text, int) to anon, authenticated;
