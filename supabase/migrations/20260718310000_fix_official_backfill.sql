-- Fix official-source backfill — correct false positives from 20260718300000.
-- ---------------------------------------------------------------------------
-- The previous migration's backfill (Part B) had a SQL bug: when
-- publisher_domain is NULL (which it is on ALL 1314 content_archive rows),
-- the entity-match condition `like '%' || '' || '%'` simplified to `like '%%'`
-- which matched every row against every entity. This incorrectly flagged all
-- 1314 rows as is_official_source = true.
--
-- This migration:
--   1. Reverts ALL false-positive is_official_source flags (the entity-match
--      arm was the only one that could have matched, since publisher_domain
--      is NULL everywhere).
--   2. Re-applies the correct backfill using:
--      (a) The `publisher` column (populated, contains company name like
--          'Anthropic', 'Microsoft', etc.)
--      (b) The `url` column domain (works for openai.com URLs which are
--          real; Google News URLs like news.google.com won't match)
--      (c) A source_connectors JOIN for the dynamic entity-match (covers
--          future companies where publisher = company name)
--
-- Result: only genuinely company-authored articles are flagged as official.
-- Idempotent: safe to re-run.
-- ---------------------------------------------------------------------------

-- ── Step 1: Revert false positives ────────────────────────────────────────────
-- Reset is_official_source to false, trust_score to NULL, and source_type to
-- NULL for rows that were incorrectly flagged. We reset ALL flagged rows
-- because none had a valid publisher_domain match (they were all set by the
-- buggy entity-match arm).
update public.content_archive
set
  is_official_source = false,
  source_type        = null,
  trust_score        = null
where archive_status = 'active'
  and is_official_source = true;

-- ── Step 2: Correct backfill using `publisher` + `url` domain ────────────────
-- Flag rows as official ONLY when:
--   - publisher matches the company name associated with the connector, OR
--   - the url domain is a known official company domain
-- This covers the real official posts while excluding media coverage.

update public.content_archive a
set
  is_official_source = true,
  trust_score        = 100,
  source_type        = coalesce(a.source_type, 'OFFICIAL_BLOG')
where a.archive_status = 'active'
  and coalesce(a.is_official_source, false) = false
  and (
    -- (a) Publisher name matches the company's own name.
    --     Maps each official connector to the expected publisher string.
    --     E.g. source='anthropic' AND publisher='Anthropic' → official.
    --     source='microsoft_ai' AND publisher IN ('Microsoft','Microsoft Source') → official.
    (
      a.source = 'anthropic'    and lower(a.publisher) = 'anthropic'
      or a.source = 'openai'       -- all openai.com URLs are official
      or a.source = 'mistral'      and lower(a.publisher) = 'mistral'
      or a.source = 'google_ai'    and lower(a.publisher) in ('blog.google','google deepmind','google')
      or a.source = 'microsoft_ai' and lower(a.publisher) in ('microsoft','microsoft source')
      or a.source = 'meta_ai'      and lower(a.publisher) in ('meta','meta ai')
    )
    -- (b) URL domain matches a known official company domain.
    --     Covers rows where the source connector is community/official but the
    --     URL itself points to the company's own site.
    or exists (
      select 1 from (values
        ('openai.com'),('anthropic.com'),('blog.google'),('deepmind.google'),
        ('mistral.ai'),('x.ai'),('xai.com'),('perplexity.ai'),('cursor.com'),
        ('anysphere.co'),('huggingface.co'),('github.blog'),('runwayml.com'),
        ('elevenlabs.io'),('firecrawl.dev'),('lovable.dev'),('groq.com'),
        ('deepseek.com'),('ollama.com'),('langchain.com'),('llamaindex.ai')
      ) as known(domain)
      where lower(a.url) like 'https://' || known.domain || '/%'
         or lower(a.url) like 'https://www.' || known.domain || '/%'
         or lower(a.url) like 'https://blog.' || known.domain || '/%'
         or lower(a.url) like 'https://news.' || known.domain || '/%'
         or lower(a.url) like 'https://ai.' || known.domain || '/%'
    )
    -- (c) Dynamic: publisher matches the entity canonical name for any entity
    --     linked to this article. Covers future companies without hardcoding.
    or exists (
      select 1
      from public.entity_article_links eal
      join public.entities e on e.id = eal.entity_id
      where eal.article_id = a.id
        and e.type = 'company'
        and length(e.normalized_name) >= 3
        and (
          lower(coalesce(a.publisher, '')) = e.canonical_name
          or lower(coalesce(a.publisher, '')) = replace(e.canonical_name, ' ', '')
          or lower(coalesce(a.publisher, '')) like '%' || e.canonical_name || '%'
        )
    )
  );


-- ════════════════════════════════════════════════════════════════════════════
-- Verification (run manually after deploy)
-- ════════════════════════════════════════════════════════════════════════════
--
--   -- Total official rows (should be a small, correct number now):
--   select count(*) from content_archive where is_official_source and archive_status = 'active';
--
--   -- Breakdown by source + publisher:
--   select source, publisher, count(*) as articles
--   from content_archive
--   where is_official_source and archive_status = 'active'
--   group by 1, 2 order by 3 desc;
--
--   -- Confirm NO media outlets leaked in:
--   select source, publisher from content_archive
--   where is_official_source and archive_status = 'active'
--   order by 1, 2;
--
--   -- Live v8 search test for Anthropic (official should rank first):
--   select title, publisher, is_official_source, round(rank::numeric, 1) as rank
--   from signal_search('anthropic', 'Anthropic', 10)
--   order by rank desc;
