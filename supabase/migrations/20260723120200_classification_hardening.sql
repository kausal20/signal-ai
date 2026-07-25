-- ============================================================================
-- OFFICIAL SOURCE DISCOVERY ENGINE · classification hardening
-- ----------------------------------------------------------------------------
-- (1) The ingest trigger must never treat a SHARED platform host (github.com,
--     medium, substack, x.com, youtube, …) as an entity's official publisher —
--     those are owned by no single entity. Extend the junk/CDN skip list.
-- (2) reclassify_official_entities() becomes AUTHORITATIVE: it recomputes
--     official_entity_id for every active row (match → entity, else NULL), so a
--     bad registry row can never leave articles permanently misclassified.
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
    if h in (
      'lh3.googleusercontent.com','googleusercontent.com','gstatic.com','news.google.com','google.com',
      'github.com','gitlab.com','medium.com','substack.com','youtube.com','youtu.be','twitter.com','x.com',
      'linkedin.com','reddit.com','producthunt.com','facebook.com','instagram.com','notion.site','wordpress.com'
    ) then
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

-- Authoritative recompute (set OR clear).
create or replace function public.reclassify_official_entities()
returns integer
language plpgsql as $$
declare n int;
begin
  with resolved as (
    select a.id,
      (select op.entity_id
         from public.official_publishers op
         where op.domain = h.host
            or (h.host like '%.' || op.domain)
         order by (op.domain = h.host) desc, length(op.domain) desc
         limit 1) as eid
    from public.content_archive a
    cross join lateral (
      select public.url_host(coalesce(a.publisher_domain, a.original_url, a.url)) as host
    ) h
    where a.archive_status = 'active'
      and coalesce(h.host,'') not in (
        'lh3.googleusercontent.com','googleusercontent.com','gstatic.com','news.google.com','google.com',
        'github.com','gitlab.com','medium.com','substack.com','youtube.com','youtu.be','twitter.com','x.com',
        'linkedin.com','reddit.com','producthunt.com','facebook.com','instagram.com','notion.site','wordpress.com'
      )
  )
  update public.content_archive a
    set official_entity_id = r.eid,
        is_official_source = (r.eid is not null)
  from resolved r
  where r.id = a.id and a.official_entity_id is distinct from r.eid;
  get diagnostics n = row_count;
  -- Rows whose host IS a shared platform must never be official.
  update public.content_archive a set official_entity_id = null, is_official_source = false
    where a.official_entity_id is not null and a.archive_status='active'
      and public.url_host(coalesce(a.publisher_domain, a.original_url, a.url)) in (
        'github.com','gitlab.com','medium.com','substack.com','youtube.com','youtu.be','twitter.com','x.com',
        'linkedin.com','reddit.com','producthunt.com','facebook.com','instagram.com','notion.site','wordpress.com',
        'lh3.googleusercontent.com','googleusercontent.com','gstatic.com','news.google.com','google.com'
      );
  return n;
end $$;
