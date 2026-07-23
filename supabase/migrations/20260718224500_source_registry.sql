-- Source Intelligence — separate OFFICIAL company sources from MEDIA coverage.
-- ---------------------------------------------------------------------------
-- Extends the Entity Intelligence + Content Archive layers (does not rewrite
-- them). Every article gains a source_type + trust_score + is_official_source.
-- A permanent source_registry catalogs each publisher once (domain-keyed) with
-- its tier, trust, and — when it is a company's own site — the linked entity.
-- Entities gain optional official_* URLs, learned from ingested official
-- articles (dynamic; supports any future company, nothing hardcoded).
--
-- source_type values:
--   OFFICIAL_BLOG · OFFICIAL_PRESS_RELEASE · OFFICIAL_GITHUB · OFFICIAL_CHANGELOG
--   OFFICIAL_DOCUMENTATION · OFFICIAL_RESEARCH · VERIFIED_MEDIA · INDUSTRY_MEDIA
--   COMMUNITY
-- trust: official 100 · verified media 95 · industry media 90 · community 60
-- ---------------------------------------------------------------------------

-- ── content_archive: per-article source classification ───────────────────────
alter table public.content_archive add column if not exists source_type        text;
alter table public.content_archive add column if not exists trust_score          integer;
alter table public.content_archive add column if not exists is_official_source   boolean not null default false;

create index if not exists idx_archive_source_type   on public.content_archive (source_type);
create index if not exists idx_archive_official_src   on public.content_archive (is_official_source);

-- ── entities: learned official channels (dynamic, per company) ───────────────
alter table public.entities add column if not exists official_blog_url       text;
alter table public.entities add column if not exists official_newsroom_url    text;
alter table public.entities add column if not exists official_press_url       text;
alter table public.entities add column if not exists official_github_url      text;
alter table public.entities add column if not exists official_docs_url        text;
alter table public.entities add column if not exists official_changelog_url   text;
alter table public.entities add column if not exists official_research_url    text;
alter table public.entities add column if not exists official_rss_url         text;
alter table public.entities add column if not exists official_domain          text;

-- ── source_registry: permanent per-publisher catalog ────────────────────────
create table if not exists public.source_registry (
  id                 uuid primary key default gen_random_uuid(),
  publisher          text not null,
  publisher_domain   text not null unique,
  source_type        text not null default 'INDUSTRY_MEDIA',
  trust_score        integer not null default 90,
  official_company_id uuid references public.entities(id) on delete set null,
  rss_url            text,
  website_url        text,
  github_repo        text,
  blog_url           text,
  newsroom_url       text,
  press_url          text,
  documentation_url  text,
  research_url       text,
  is_active          boolean not null default true,
  last_checked       timestamptz,
  fetch_status       text,
  article_count      integer not null default 0,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists idx_source_registry_type    on public.source_registry (source_type);
create index if not exists idx_source_registry_company on public.source_registry (official_company_id);
create index if not exists idx_source_registry_trust   on public.source_registry (trust_score desc);

-- ── upsert_source_registry: catalog a publisher (idempotent) ─────────────────
create or replace function public.upsert_source_registry(
  p_publisher   text,
  p_domain      text,
  p_source_type text,
  p_trust       integer,
  p_company_id  uuid default null,
  p_website     text default null,
  p_rss         text default null
) returns uuid
language plpgsql
as $$
declare v_id uuid;
begin
  if coalesce(nullif(trim(p_domain), ''), '') = '' then return null; end if;
  insert into public.source_registry
    (publisher, publisher_domain, source_type, trust_score, official_company_id, website_url, rss_url, article_count, last_checked, fetch_status)
  values
    (coalesce(nullif(trim(p_publisher), ''), p_domain), lower(trim(p_domain)), p_source_type, p_trust, p_company_id, p_website, p_rss, 1, now(), 'ok')
  on conflict (publisher_domain) do update set
    publisher           = coalesce(nullif(trim(excluded.publisher), ''), public.source_registry.publisher),
    -- Never downgrade an official classification to media.
    source_type         = case when public.source_registry.source_type like 'OFFICIAL%' then public.source_registry.source_type else excluded.source_type end,
    trust_score         = greatest(public.source_registry.trust_score, excluded.trust_score),
    official_company_id = coalesce(public.source_registry.official_company_id, excluded.official_company_id),
    website_url         = coalesce(public.source_registry.website_url, excluded.website_url),
    rss_url             = coalesce(public.source_registry.rss_url, excluded.rss_url),
    article_count       = public.source_registry.article_count + 1,
    last_checked        = now(),
    updated_at          = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- ── RLS: public read, writes only via pipeline service role ──────────────────
alter table public.source_registry enable row level security;
drop policy if exists source_registry_read on public.source_registry;
create policy source_registry_read on public.source_registry for select to anon, authenticated using (true);

grant select on public.source_registry to anon, authenticated;
revoke execute on function public.upsert_source_registry(text, text, text, integer, uuid, text, text) from public;
grant  execute on function public.upsert_source_registry(text, text, text, integer, uuid, text, text) to service_role;
