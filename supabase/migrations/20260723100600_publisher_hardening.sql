-- ============================================================================
-- ENTITY INTELLIGENCE · publisher hardening
-- ----------------------------------------------------------------------------
-- (1) Ignore junk/CDN hosts (Google image CDN, Google-News redirect) when
--     resolving the official publisher, so a mis-stamped publisher_domain never
--     blocks/false-positives classification — fall through to the article URL.
-- (2) Backfill publisher name/domain for official rows that were ingested with
--     null publisher metadata (they render as "Signal" otherwise), using the
--     resolved entity's primary registered domain.
-- ============================================================================

create or replace function public.ca_set_official_entity()
returns trigger
language plpgsql
as $$
declare cand text[]; h text; eid uuid;
begin
  cand := array[public.url_host(new.publisher_domain), public.url_host(new.original_url), public.url_host(new.url)];
  eid := null;
  foreach h in array cand loop
    if h is null then continue; end if;
    -- Skip shared CDNs / Google-News redirects — they are never a real publisher.
    if h in ('lh3.googleusercontent.com','googleusercontent.com','gstatic.com','news.google.com','google.com') then
      continue;
    end if;
    select op.entity_id into eid from public.official_publishers op where op.domain = h limit 1;
    if eid is null then
      select op.entity_id into eid from public.official_publishers op
        where h like '%.' || op.domain order by length(op.domain) desc limit 1;
    end if;
    exit when eid is not null;
  end loop;
  new.official_entity_id := eid;
  new.is_official_source := (eid is not null);
  return new;
end $$;

-- Backfill publisher metadata for official rows missing it.
update public.content_archive a
set publisher = coalesce(nullif(a.publisher,''), e.canonical_name),
    publisher_domain = coalesce(
      nullif(a.publisher_domain,''),
      (select op.domain from public.official_publishers op where op.entity_id = a.official_entity_id order by op.priority desc, length(op.domain) limit 1)
    )
from public.entities e
where a.official_entity_id = e.id
  and a.archive_status = 'active'
  and (a.publisher is null or a.publisher = '' or a.publisher_domain is null or a.publisher_domain = '');
