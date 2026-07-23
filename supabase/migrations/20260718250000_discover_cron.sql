-- Schedule Official Source Discovery — makes the discovery self-maintaining.
-- Every 30 minutes pg_cron invokes discover-sources, which crawls a batch of AI
-- company entities that have never been checked (or are stale), discovers their
-- official channels, and auto-creates official connectors. Reuses the Vault
-- secret + pg_net wrapper pattern from the entity-backfill cron.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.trigger_source_discovery()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'backfill_service_key' limit 1;
  if v_key is null then
    raise warning 'trigger_source_discovery: vault secret missing; skipping run';
    return;
  end if;
  perform net.http_post(
    url     := 'https://ywsnuijybcbxylgsjvqi.supabase.co/functions/v1/discover-sources',
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key, 'apikey', v_key),
    body    := jsonb_build_object('batch', 8),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.trigger_source_discovery() from public, anon, authenticated;

do $$
begin
  perform cron.unschedule('official-source-discovery');
exception when others then null;
end $$;

select cron.schedule('official-source-discovery', '*/30 * * * *', $cron$select public.trigger_source_discovery();$cron$);
