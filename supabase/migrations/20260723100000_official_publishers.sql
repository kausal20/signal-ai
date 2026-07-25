-- ============================================================================
-- ENTITY INTELLIGENCE · System 2 — Official Publishers Registry
-- ----------------------------------------------------------------------------
-- The single authority for "which entity OWNS a publisher domain". An article
-- is Official Company News for entity X only if the article's OWN publisher
-- domain is registered here to X. This permanently separates "OpenAI's blog"
-- from "AWS blog that mentions OpenAI".
--   • one entity → many official publisher domains
--   • one domain → exactly one entity  (UNIQUE domain)
-- ============================================================================

-- Immutable host extractor: url/domain string → bare registrable host, lowercased,
-- www-stripped, path/port/query removed. Used by the ingestion trigger + backfill.
create or replace function public.url_host(u text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(lower(coalesce(u, '')), '^[a-z]+://', ''),  -- scheme
        '[/:?#].*$', ''                                            -- path/port/query/frag
      ),
      '^www\.', ''                                                 -- leading www.
    ),
  '');
$$;

create table if not exists public.official_publishers (
  id             uuid primary key default gen_random_uuid(),
  entity_id      uuid not null references public.entities(id) on delete cascade,
  domain         text not null,
  publisher_name text,
  publisher_type text not null default 'company'
                 check (publisher_type in ('company','product','docs','blog','api','research','newsroom','changelog','github','support','social')),
  verified       boolean not null default true,
  priority       int not null default 100,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint official_publishers_domain_key unique (domain)
);

create index if not exists idx_official_publishers_entity on public.official_publishers(entity_id);
create index if not exists idx_official_publishers_domain on public.official_publishers(domain);

alter table public.official_publishers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='official_publishers' and policyname='official_publishers_read_all') then
    create policy official_publishers_read_all on public.official_publishers for select using (true);
  end if;
end $$;
