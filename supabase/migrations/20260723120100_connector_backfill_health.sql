-- ============================================================================
-- OFFICIAL SOURCE DISCOVERY ENGINE · connector↔entity backfill + monitoring cron
-- ============================================================================

-- Link EXISTING connectors to their entity (so the dashboard + health show them).
update public.source_connectors c set entity_id = e.id, channel_type = coalesce(c.channel_type,'blog'), crawl_frequency = coalesce(c.crawl_frequency,'blog')
from public.entities e
where c.entity_id is null and c.source like 'official\_%'
  and e.slug = regexp_replace(regexp_replace(c.source, '^official_', ''), '_(blog|github|docs|press|research|changelog|newsroom|rss)$', '');

update public.source_connectors c set entity_id = e.id
from public.entities e
where c.entity_id is null and c.source like '%\_news'
  and e.slug = regexp_replace(c.source, '_news$', '');

-- Reclassify historical archive rows whenever the registry grows (the ingest
-- trigger only fires on new rows). Cheap indexed join; run on a cron.
create or replace function public.reclassify_official_entities()
returns integer
language plpgsql as $$
declare n int;
begin
  update public.content_archive a set official_entity_id = op.entity_id
  from public.official_publishers op
  where op.domain = coalesce(public.url_host(a.publisher_domain), public.url_host(a.original_url), public.url_host(a.url))
    and a.archive_status = 'active'
    and a.official_entity_id is distinct from op.entity_id;
  get diagnostics n = row_count;
  update public.content_archive
    set is_official_source = (official_entity_id is not null)
    where is_official_source is distinct from (official_entity_id is not null);
  return n;
end $$;

-- Cron: continuous health monitoring + periodic reclassification.
do $$ begin perform cron.unschedule('source-health-monitor'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('reclassify-official'); exception when others then null; end $$;
select cron.schedule('source-health-monitor', '*/10 * * * *', $$ select public.refresh_connector_health() $$);
select cron.schedule('reclassify-official',   '25 * * * *',   $$ select public.reclassify_official_entities() $$);
