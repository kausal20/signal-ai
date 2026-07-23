-- signal_search v8 — Official-source boost in the FREE-TEXT ranking path.
-- ---------------------------------------------------------------------------
-- Problem: searching a company name (Anthropic, Perplexity, Cursor, Lovable,
-- Firecrawl, Groq, xAI, Runway, Mistral, Hugging Face, …) returned random
-- third-party media instead of the company's own posts.
--
-- Root cause: v7 (20260718280000) already orders entity queries by `section`
-- (official → analysis → mentioned) so the official section is correct there.
-- BUT the free-text path (taken when entity resolution misses — e.g. a smaller
-- company with no `entities` row yet) computes `rank` from relevance + freshness
-- + popularity only, with NO boost for is_official_source. Fresher, more-shared
-- media coverage therefore outranks the company's own blog post.
--
-- Compounding it: historical content_archive rows had is_official_source = false
-- (the classifier in _shared/source_type.ts runs only at ingest time), so even
-- the entity path's section logic couldn't see them.
--
-- Fix (two parts, both idempotent + additive):
--   Part A — signal_search v8: add `+ case when is_official_source then 80 end`
--            to the rank formula. Soft boost: enough to outrank marginally-
--            relevant media, not enough to bury a 10×-more-relevant article.
--   Part B — Backfill: re-derive is_official_source / source_type / trust_score
--            on existing content_archive rows using the SAME domain + entity-
--            match rules as the classifier, so v7's section logic finally sees
--            them too.
--
-- No signature change → search/index.ts and the frontend are untouched.
-- ---------------------------------------------------------------------------


-- ════════════════════════════════════════════════════════════════════════════
-- Part A — signal_search v8
-- ════════════════════════════════════════════════════════════════════════════
-- Identical to v7 except for the ONE line marked `← NEW v8` in the `base` CTE's
-- rank formula. All section logic, entity resolution, ordering, and the 500-row
-- entity-query limit are preserved verbatim.

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
        + case when coalesce(a.is_official_source, false) then 80 else 0 end   -- ← NEW v8: soft official boost
      )::real as rank,
      coalesce(a.content_type, 'news') as content_type,
      a.publisher, a.publisher_domain,
      coalesce(a.original_url, a.url) as original_url,
      coalesce(a.is_official_company_news, false) as is_official_event,
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
        -- Company's own publisher (blog, newsroom, docs, GitHub, research).
        when is_official_source then 'official'
        when mtype_rank < 3 then 'mentioned'
        when content_type = 'tutorial' then 'tutorial'
        when content_type = 'opinion' then 'opinion'
        when content_type = 'review' then 'review'
        when content_type = 'comparison' then 'comparison'
        when content_type in ('repo','documentation') then 'repo'
        when content_type = 'benchmark' then 'benchmark'
        when content_type = 'listicle' then 'list'
        -- Third-party media coverage about the company (primary subject).
        else 'analysis'
      end as section
    from base
  )
  select
    id, title, summary, why_it_matters, url, tag,
    source, source_label, category, content_category,
    score, published_at, trend_entities, rank,
    content_type, publisher, publisher_domain, original_url,
    section, is_official_event as is_official_company_news, event_type, editorial_quality_score,
    source_type, is_official_source, trust_score
  from sectioned
  order by
    case section
      when 'official' then 0 when 'analysis' then 1 when 'review' then 2
      when 'comparison' then 3 when 'tutorial' then 4 when 'benchmark' then 5
      when 'list' then 6 when 'repo' then 7 when 'opinion' then 8
      when 'mentioned' then 9 else 0
    end asc,
    is_official_source desc,
    is_official_event desc,
    trust_score desc,
    case when is_entity_query then extract(epoch from published_at) else rank end desc,
    published_at desc
  limit (select case when is_entity then greatest(max_results, 500) else greatest(1, max_results) end from flags);
$$;

grant execute on function public.signal_search(text, text, int) to anon, authenticated;


-- ════════════════════════════════════════════════════════════════════════════
-- Part B — Backfill historical content_archive rows
-- ════════════════════════════════════════════════════════════════════════════
-- Mirrors _shared/source_type.ts:
--   (1) KNOWN_OFFICIAL_DOMAINS  → static domain set (the 40 companies below)
--   (2) entity-domain match      → any publisher_domain whose root matches an
--                                  entity's normalized name (dynamic rule that
--                                  covers future companies the classifier
--                                  already supports at ingest time)
-- Idempotent: only flips false/null → true; re-running is a no-op.

update public.content_archive a
set
  is_official_source = true,
  trust_score        = 100,
  source_type        = coalesce(a.source_type, 'OFFICIAL_BLOG')
where a.archive_status = 'active'
  and coalesce(a.is_official_source, false) = false
  and (
    -- (1) Known-official domain set (synced from _shared/source_type.ts).
    -- Includes all 10 user-reported companies: anthropic.com, perplexity.ai,
    -- cursor.com, lovable.dev, firecrawl.dev, groq.com, x.ai/xai.com,
    -- runwayml.com, mistral.ai, huggingface.co.
    coalesce(lower(a.publisher_domain), '') in (
      'openai.com','anthropic.com','blog.google','deepmind.com','deepmind.google',
      'ai.meta.com','meta.com','microsoft.com','blogs.microsoft.com','mistral.ai',
      'x.ai','xai.com','perplexity.ai','cursor.com','anysphere.co','huggingface.co',
      'github.blog','runwayml.com','elevenlabs.io','pika.art','firecrawl.dev',
      'lovable.dev','replit.com','langchain.com','blog.langchain.dev','llamaindex.ai',
      'cohere.com','together.ai','replicate.com','modal.com','ollama.com','wandb.ai',
      'stability.ai','midjourney.com','suno.com','groq.com','deepseek.com',
      'synthesia.io','heygen.com','pinecone.io','vercel.com','character.ai'
    )
    -- Also catch subdomains (e.g. news.anthropic.com, blog.cursor.com).
    or exists (
      select 1 from (values
        ('openai.com'),('anthropic.com'),('blog.google'),('deepmind.com'),('deepmind.google'),
        ('ai.meta.com'),('meta.com'),('microsoft.com'),('blogs.microsoft.com'),('mistral.ai'),
        ('x.ai'),('xai.com'),('perplexity.ai'),('cursor.com'),('anysphere.co'),('huggingface.co'),
        ('github.blog'),('runwayml.com'),('elevenlabs.io'),('pika.art'),('firecrawl.dev'),
        ('lovable.dev'),('replit.com'),('langchain.com'),('blog.langchain.dev'),('llamaindex.ai'),
        ('cohere.com'),('together.ai'),('replicate.com'),('modal.com'),('ollama.com'),('wandb.ai'),
        ('stability.ai'),('midjourney.com'),('suno.com'),('groq.com'),('deepseek.com'),
        ('synthesia.io'),('heygen.com'),('pinecone.io'),('vercel.com'),('character.ai')
      ) as known(domain)
      where lower(coalesce(a.publisher_domain, '')) = known.domain
         or lower(coalesce(a.publisher_domain, '')) like '%.' || known.domain
    )
    -- (2) Dynamic entity-match: publisher_domain root matches an entity name.
    --     Mirrors classifySourceType's entityNorms rule for future companies.
    or exists (
      select 1
      from public.entities e
      where e.normalized_name is not null
        and length(e.normalized_name) >= 3
        and (
          -- Domain root matches entity normalized name (e.g. perplexity.ai + entity 'perplexity').
          regexp_replace(lower(coalesce(a.publisher_domain, '')), '[^a-z0-9]+', '', 'g')
            like '%' || e.normalized_name || '%'
          or e.normalized_name
            like '%' || regexp_replace(lower(coalesce(a.publisher_domain, '')), '[^a-z0-9]+', '', 'g') || '%'
        )
    )
  );


-- ════════════════════════════════════════════════════════════════════════════
-- Part C — Verification (run manually after deploy)
-- ════════════════════════════════════════════════════════════════════════════
-- Confirm the backfill landed and the function is wired up:
--
--   -- Rows now flagged official, grouped by publisher:
--   select publisher_domain, count(*) as articles
--   from public.content_archive
--   where is_official_source
--   group by 1
--   order by articles desc;
--
--   -- Spot-check the 10 reported companies:
--   select publisher_domain, count(*) as articles
--   from public.content_archive
--   where is_official_source
--     and publisher_domain in (
--       'anthropic.com','perplexity.ai','cursor.com','lovable.dev',
--       'firecrawl.dev','groq.com','x.ai','xai.com','runwayml.com',
--       'mistral.ai','huggingface.co'
--     )
--   group by 1 order by 1;
--
--   -- Live query test (returns v8 rank with official sources on top):
--   select title, publisher_domain, is_official_source, round(rank::numeric, 1) as rank
--   from public.signal_search('anthropic', 'Anthropic', 10)
--   order by rank desc;
