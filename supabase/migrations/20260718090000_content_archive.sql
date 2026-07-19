-- Signal Content Archive — the permanent, searchable intelligence knowledge base.
-- ---------------------------------------------------------------------------
-- ARCHITECTURE SPLIT: feed_items stays the curated editorial feed (Home only).
-- content_archive is the permanent store of EVERY validated AI article the
-- pipeline ingests — not just the ~12/run selected for Home. Search, Advisor,
-- Ask Signal, AI Opportunity, and Entity Pages read from here (via the entity
-- registry + these tables), never from feed_items again.
--
-- Runs BEFORE the entity migration (20260718100000) so entity_article_links /
-- entity_relationships can FK to content_archive(id). Additive; nothing dropped.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

create table if not exists public.content_archive (
  id                text primary key,          -- raw_items.id (deterministic ⇒ idempotent)
  url               text not null,
  canonical_url     text,
  title             text not null,
  summary           text,
  full_content      text,
  source            text,
  source_label      text,
  author            text,
  published_at      timestamptz,
  language          text default 'en',
  original_category text,
  tags              text[] not null default '{}',
  image             text,
  quality_score     integer,
  editorial_score   integer,
  archive_status    text not null default 'active'  check (archive_status  in ('active','hidden','spam')),
  embedding_status  text not null default 'pending' check (embedding_status in ('pending','processing','done','error','skipped')),
  entity_status     text not null default 'pending' check (entity_status    in ('pending','processing','done','error')),
  search_tsv        tsvector,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ── Weighted full-text document (title ▶ summary/tags ▶ source ▶ content) ─────
create or replace function public.refresh_content_archive_search_tsv()
returns trigger language plpgsql as $$
begin
  new.search_tsv :=
    setweight(to_tsvector('english', coalesce(new.title, '')), 'A') ||
    setweight(to_tsvector('english', coalesce(new.summary, '') || ' ' ||
                                     coalesce(array_to_string(new.tags, ' '), '')), 'B') ||
    setweight(to_tsvector('english', coalesce(new.source, '') || ' ' ||
                                     coalesce(new.source_label, '') || ' ' ||
                                     coalesce(new.original_category, '')), 'C') ||
    setweight(to_tsvector('english', coalesce(new.full_content, '')), 'D');
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_content_archive_search_tsv on public.content_archive;
create trigger trg_content_archive_search_tsv
before insert or update of title, summary, tags, source, source_label, original_category, full_content
on public.content_archive
for each row execute function public.refresh_content_archive_search_tsv();

-- ── Indexes (FTS, fuzzy, keyset, freshness, async processing) ────────────────
create index if not exists idx_archive_search_tsv    on public.content_archive using gin (search_tsv);
create index if not exists idx_archive_title_trgm     on public.content_archive using gin (title gin_trgm_ops);
create index if not exists idx_archive_summary_trgm   on public.content_archive using gin (summary gin_trgm_ops);
create index if not exists idx_archive_source_trgm    on public.content_archive using gin (source gin_trgm_ops);
create index if not exists idx_archive_published      on public.content_archive (published_at desc);
create index if not exists idx_archive_status         on public.content_archive (archive_status);
create index if not exists idx_archive_canonical      on public.content_archive (canonical_url);
-- Partial index drives the async entity/embedding processors' claim query.
create index if not exists idx_archive_entity_pending on public.content_archive (id) where entity_status = 'pending';
create index if not exists idx_archive_embed_pending  on public.content_archive (id) where embedding_status = 'pending';

-- ── copy_raw_to_archive: resumable, idempotent backfill from raw_items ────────
-- Copies validated (rejection_reason IS NULL) raw items into the archive in a
-- keyset page. Returns rows newly inserted + the page's last id (cursor). ON
-- CONFLICT DO NOTHING keeps it idempotent and preserves entity_status of rows
-- already processed. Caller loops until last_id is null.
create or replace function public.copy_raw_to_archive(p_after text default '', p_limit int default 2000)
returns table (copied int, last_id text)
language plpgsql
as $$
begin
  return query
  with page as (
    select r.*
    from public.raw_items r
    where r.rejection_reason is null and r.id > p_after
    order by r.id asc
    limit greatest(1, least(10000, p_limit))
  ), ins as (
    insert into public.content_archive
      (id, url, canonical_url, title, summary, full_content, source, source_label, published_at,
       language, entity_status, embedding_status, archive_status)
    select
      p.id, p.url, p.canonical_url, p.raw_title, left(coalesce(p.raw_text, ''), 500), p.raw_text,
      p.source, p.source_label, p.published_at, 'en', 'pending', 'pending', 'active'
    from page p
    on conflict (id) do nothing
    returning id
  )
  select (select count(*)::int from ins), (select max(page.id) from page);
end;
$$;

-- ── RLS: public read, writes only via pipeline service role ──────────────────
alter table public.content_archive enable row level security;
drop policy if exists content_archive_read on public.content_archive;
create policy content_archive_read on public.content_archive
  for select to anon, authenticated using (archive_status = 'active');

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select on public.content_archive to anon, authenticated;
revoke execute on function public.copy_raw_to_archive(text, int) from public;
grant  execute on function public.copy_raw_to_archive(text, int) to service_role;
