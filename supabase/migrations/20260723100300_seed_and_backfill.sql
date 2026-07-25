-- ============================================================================
-- ENTITY INTELLIGENCE · Seed the registry + backfill existing articles
-- ----------------------------------------------------------------------------
-- Seed official_publishers from (1) a curated authoritative list and (2) every
-- official_* URL already discovered on each entity (blog/docs/newsroom/…),
-- excluding shared platforms (github.com, medium.com, …) that no single entity
-- owns. Then backfill content_archive.official_entity_id + primary_entity_id for
-- all historical rows so Official Company News is correct immediately.
-- ============================================================================

-- (1) Curated authoritative domains → resolved to the canonical entity by
-- normalized_name / slug. Only inserts where the entity exists.
with curated(key, domain, ptype) as (values
  ('openai','openai.com','company'), ('openai','platform.openai.com','api'),
  ('openai','help.openai.com','support'), ('openai','developers.openai.com','api'),
  ('openai','chatgpt.com','product'), ('openai','sora.com','product'),
  ('anthropic','anthropic.com','company'), ('anthropic','docs.anthropic.com','docs'),
  ('anthropic','claude.ai','product'), ('anthropic','console.anthropic.com','api'),
  ('google','blog.google','blog'), ('google','developers.google.com','api'),
  ('google','deepmind.google','research'), ('google','ai.google.dev','docs'),
  ('googledeepmind','deepmind.google','research'), ('deepmind','deepmind.google','research'),
  ('microsoft','microsoft.com','company'), ('microsoft','learn.microsoft.com','docs'),
  ('microsoft','news.microsoft.com','newsroom'), ('microsoft','azure.microsoft.com','product'),
  ('microsoftai','microsoft.com','company'),
  ('meta','ai.meta.com','research'), ('meta','about.fb.com','newsroom'), ('meta','llama.com','product'),
  ('metaai','ai.meta.com','research'),
  ('mistral','mistral.ai','company'), ('mistral','docs.mistral.ai','docs'),
  ('perplexity','perplexity.ai','company'), ('perplexity','blog.perplexity.ai','blog'),
  ('cursor','cursor.com','company'), ('cursor','docs.cursor.com','docs'),
  ('anysphere','cursor.com','company'),
  ('xai','x.ai','company'), ('grok','x.ai','company'),
  ('deepseek','deepseek.com','company'), ('deepseek','api-docs.deepseek.com','docs'),
  ('groq','groq.com','company'), ('groq','console.groq.com','api'),
  ('cohere','cohere.com','company'), ('cohere','docs.cohere.com','docs'),
  ('huggingface','huggingface.co','company'), ('huggingface','blog','blog'),
  ('langchain','langchain.com','company'), ('langchain','blog.langchain.dev','blog'),
  ('langchainframework','langchain.com','company'),
  ('nvidia','nvidia.com','company'), ('nvidia','blogs.nvidia.com','blog'), ('nvidia','developer.nvidia.com','api'),
  ('runway','runwayml.com','company'), ('runwaycompany','runwayml.com','company'),
  ('elevenlabs','elevenlabs.io','company'),
  ('stability','stability.ai','company'), ('stabilityai','stability.ai','company'),
  ('midjourney','midjourney.com','company'),
  ('lovable','lovable.dev','company'), ('firecrawl','firecrawl.dev','company'),
  ('replit','replit.com','company'), ('vercel','vercel.com','company'),
  ('apple','apple.com','company'), ('apple','machinelearning.apple.com','research'),
  ('amazon','amazon.com','company'), ('amazon','aws.amazon.com','product'),
  ('amazon','developer.amazon.com','api'), ('aws','aws.amazon.com','company')
),
resolved as (
  select c.domain, c.ptype, c.key,
    (select e.id from public.entities e
      where e.normalized_name = c.key or e.slug = c.key
         or e.slug = c.key || '-company' or e.slug = c.key || '-organization'
         or e.slug = c.key || '-product'
      order by (case lower(coalesce(e.type,'')) when 'company' then 0 when 'lab' then 0 when 'organization' then 1 else 2 end),
               (e.official_domain is null), e.created_at asc nulls last
      limit 1) as entity_id
  from curated c
)
insert into public.official_publishers(entity_id, domain, publisher_name, publisher_type, verified, priority)
select r.entity_id, r.domain, initcap(replace(r.key,'-',' ')), r.ptype, true, 100
from resolved r
where r.entity_id is not null and r.domain <> 'blog'
on conflict (domain) do nothing;

-- (2) Discovered official domain (primary company site).
insert into public.official_publishers(entity_id, domain, publisher_name, publisher_type, verified, priority)
select e.id, public.url_host(e.official_domain), e.canonical_name, 'company', true, 90
from public.entities e
where public.url_host(e.official_domain) is not null
on conflict (domain) do nothing;

-- (3) Discovered official_* URLs (blog/docs/newsroom/press/changelog/research),
-- excluding shared platforms that no single entity owns.
insert into public.official_publishers(entity_id, domain, publisher_name, publisher_type, verified, priority)
select e.id, v.host, e.canonical_name, v.ptype, true, 85
from public.entities e
cross join lateral (values
  (public.url_host(e.official_blog_url),      'blog'),
  (public.url_host(e.official_docs_url),      'docs'),
  (public.url_host(e.official_newsroom_url),  'newsroom'),
  (public.url_host(e.official_press_url),     'newsroom'),
  (public.url_host(e.official_changelog_url), 'changelog'),
  (public.url_host(e.official_research_url),  'research')
) as v(host, ptype)
where v.host is not null
  and v.host not in (
    'github.com','medium.com','substack.com','youtube.com','youtu.be','twitter.com','x.com',
    'linkedin.com','notion.site','notion.so','wordpress.com','blogspot.com','tumblr.com',
    'facebook.com','instagram.com','reddit.com','discord.com','discord.gg','t.me','telegram.org',
    'google.com','sites.google.com','docs.google.com','news.google.com','wikipedia.org'
  )
on conflict (domain) do nothing;

-- ── Backfill content_archive ────────────────────────────────────────────────
-- official_entity_id: exact host match against the registry.
update public.content_archive a
set official_entity_id = op.entity_id
from public.official_publishers op
where op.domain = coalesce(public.url_host(a.publisher_domain), public.url_host(a.original_url), public.url_host(a.url))
  and a.official_entity_id is distinct from op.entity_id;

-- official_entity_id: registrable-suffix match for unregistered subdomains.
update public.content_archive a
set official_entity_id = op.entity_id
from public.official_publishers op
where a.official_entity_id is null
  and coalesce(public.url_host(a.publisher_domain), public.url_host(a.original_url), public.url_host(a.url)) like '%.' || op.domain;

-- is_official_source is now DERIVED: published by a registered official channel.
update public.content_archive
set is_official_source = (official_entity_id is not null)
where is_official_source is distinct from (official_entity_id is not null);

-- primary_entity_id: strongest link per article.
update public.content_archive a
set primary_entity_id = sub.entity_id
from (
  select distinct on (l.article_id) l.article_id, l.entity_id
  from public.entity_article_links l
  order by l.article_id,
           (case l.mention_type when 'primary' then 3 when 'product' then 2 else 1 end) desc,
           l.confidence desc
) sub
where sub.article_id = a.id
  and a.primary_entity_id is distinct from sub.entity_id;
