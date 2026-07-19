-- Scheduled entity processing — makes the Content Archive self-maintaining.
-- ---------------------------------------------------------------------------
-- Every 10 minutes, pg_cron invokes the backfill-entities Edge Function (action
-- "backfill"), which drains content_archive rows with entity_status='pending' —
-- extracting entities and linking them — so newly-ingested articles become
-- searchable with NO manual intervention.
--
-- Idempotent / no duplicate work: the processor claims rows to 'processing'
-- before extracting and skips rows already claimed (stale claims >20m are
-- reclaimed), so overlapping runs never double-process. If there are no pending
-- rows the run is a cheap no-op. Failures are recorded by pg_cron in
-- cron.job_run_details and by pg_net in net._http_response.
--
-- The service_role bearer token is read from Supabase Vault (secret name
-- 'backfill_service_key') — never stored in this migration or in git.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Fire-and-forget POST to the admin-gated function, authorized from Vault.
-- SECURITY DEFINER (owner = migration role) so it can read the Vault secret;
-- execute is revoked from every app role — only the cron job (postgres) calls it.
-- search_path='' + fully-qualified names avoids the mutable-search_path pitfall.
create or replace function public.trigger_archive_backfill()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key text;
begin
  select decrypted_secret into v_key
    from vault.decrypted_secrets
   where name = 'backfill_service_key'
   limit 1;

  if v_key is null then
    raise warning 'trigger_archive_backfill: vault secret "backfill_service_key" missing; skipping run';
    return;
  end if;

  perform net.http_post(
    url     := 'https://ywsnuijybcbxylgsjvqi.supabase.co/functions/v1/backfill-entities',
    headers := jsonb_build_object(
                 'Content-Type', 'application/json',
                 'Authorization', 'Bearer ' || v_key,
                 'apikey', v_key
               ),
    body    := jsonb_build_object('action', 'backfill'),
    timeout_milliseconds := 120000
  );
end;
$$;

revoke all on function public.trigger_archive_backfill() from public, anon, authenticated;

-- Idempotent (re)schedule: drop any prior job of this name, then schedule.
do $$
begin
  perform cron.unschedule('archive-entity-backfill');
exception when others then
  null; -- no existing job of this name
end $$;

select cron.schedule('archive-entity-backfill', '*/10 * * * *', $cron$select public.trigger_archive_backfill();$cron$);
