-- ============================================================================
-- ENTITY INTELLIGENCE · Deduplication — canonical URL normalization
-- ----------------------------------------------------------------------------
-- Collapse duplicate archive rows (same article ingested 2-3×). Canonical key =
-- scheme/www/query/fragment-stripped URL (kills tracking params + redirects),
-- falling back to (title | publisher) when no usable URL. Keep the earliest row
-- per key; mark the rest archive_status='duplicate' so they leave search/feed
-- without losing history.
-- ============================================================================

-- Allow a distinct 'duplicate' archive state (kept for audit; excluded from
-- feed/search which filter archive_status='active').
alter table public.content_archive drop constraint if exists content_archive_archive_status_check;
alter table public.content_archive add constraint content_archive_archive_status_check
  check (archive_status = any (array['active','hidden','spam','duplicate']));

create or replace function public.canonical_url_key(u text)
returns text
language sql
immutable
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(coalesce(u, '')), '^[a-z]+://', ''),  -- scheme
          '[#?].*$', ''),                                            -- query + fragment (tracking)
        '^www\.', ''),                                               -- leading www.
      '/+$', ''),                                                    -- trailing slash
  '');
$$;

with keyed as (
  select id, published_at,
    coalesce(
      public.canonical_url_key(original_url),
      public.canonical_url_key(url),
      lower(coalesce(title,'')) || '|' || coalesce(publisher_domain,'')
    ) as k
  from public.content_archive
  where archive_status = 'active'
),
ranked as (
  select id, row_number() over (partition by k order by published_at asc nulls last, id) as rn
  from keyed
  where k is not null and k <> '|'
)
update public.content_archive a
set archive_status = 'duplicate'
from ranked r
where r.id = a.id and r.rn > 1;
