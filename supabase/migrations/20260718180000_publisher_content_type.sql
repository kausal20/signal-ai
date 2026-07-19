-- Separate Publisher / Primary Entity / Content Type — the three concepts the
-- pipeline was conflating. Publisher is the REAL website; the discovery
-- connector (e.g. "perplexity_news") is provenance, never the publisher; the
-- entity/mention relationship already lives in entity_article_links.
-- ---------------------------------------------------------------------------
-- Additive columns on content_archive:
--   publisher         real publisher name (e.g. "TechCrunch", "The Verge", "AI News")
--   publisher_domain  its host (e.g. "techcrunch.com")
--   original_url      the real article URL (decoded from Google-News redirects)
--   content_type      classified type (news/funding/launch/tutorial/repo/…)
-- source/source_label keep meaning "ingestion connector" (internal provenance).
-- ---------------------------------------------------------------------------

alter table public.content_archive add column if not exists publisher        text;
alter table public.content_archive add column if not exists publisher_domain  text;
alter table public.content_archive add column if not exists original_url      text;
alter table public.content_archive add column if not exists content_type      text;

create index if not exists idx_archive_content_type on public.content_archive (content_type);
create index if not exists idx_archive_publisher     on public.content_archive (publisher_domain);
