-- ============================================================================
-- ENTITY INTELLIGENCE · System 3 — ingest-time entity classification columns
-- ----------------------------------------------------------------------------
-- Classification is done ONCE at ingest (never at search time). Two new columns:
--   official_entity_id — the entity whose OWN publisher produced this article
--                        (via official_publishers). NULL for third-party media.
--   primary_entity_id  — the entity the article is chiefly ABOUT (highest-
--                        confidence 'primary' link). Populated by backfill +
--                        the link-side trigger below.
-- A BEFORE trigger resolves official_entity_id from the publisher domain against
-- the registry, and keeps is_official_source consistent (= published by ANY
-- official channel), so no code path has to recompute it.
-- ============================================================================

alter table public.content_archive
  add column if not exists official_entity_id uuid references public.entities(id) on delete set null,
  add column if not exists primary_entity_id  uuid references public.entities(id) on delete set null;

create index if not exists idx_ca_official_entity on public.content_archive(official_entity_id) where official_entity_id is not null;
create index if not exists idx_ca_primary_entity  on public.content_archive(primary_entity_id)  where primary_entity_id  is not null;

-- Resolve the article's OWN publisher against the registry (exact host, then
-- registrable-suffix match e.g. help.openai.com → openai.com).
create or replace function public.ca_set_official_entity()
returns trigger
language plpgsql
as $$
declare h text; eid uuid;
begin
  h := coalesce(public.url_host(new.publisher_domain), public.url_host(new.original_url), public.url_host(new.url));
  if h is not null then
    select op.entity_id into eid from public.official_publishers op where op.domain = h limit 1;
    if eid is null then
      select op.entity_id into eid
        from public.official_publishers op
        where h like '%.' || op.domain
        order by length(op.domain) desc
        limit 1;
    end if;
  end if;
  new.official_entity_id := eid;
  -- Keep the boolean consistent: official source = came from ANY official channel.
  new.is_official_source := (eid is not null);
  return new;
end $$;

drop trigger if exists trg_ca_official_entity on public.content_archive;
create trigger trg_ca_official_entity
  before insert or update of publisher_domain, original_url, url on public.content_archive
  for each row execute function public.ca_set_official_entity();

-- Link-side trigger: when the strongest entity link for an article is written,
-- stamp content_archive.primary_entity_id so search/overview never recompute it.
create or replace function public.link_set_primary_entity()
returns trigger
language plpgsql
as $$
declare best uuid;
begin
  select l.entity_id into best
    from public.entity_article_links l
    where l.article_id = new.article_id
    order by (case l.mention_type when 'primary' then 3 when 'product' then 2 else 1 end) desc,
             l.confidence desc
    limit 1;
  update public.content_archive set primary_entity_id = best where id = new.article_id;
  return new;
end $$;

drop trigger if exists trg_link_primary_entity on public.entity_article_links;
create trigger trg_link_primary_entity
  after insert or update on public.entity_article_links
  for each row execute function public.link_set_primary_entity();
