-- Ingestion scheduler — the missing piece. All ingestion Edge Functions were
-- deployed and 72 connectors were enabled, but NO cron ever triggered them, so
-- feed_items went stale (4 rows, last fetch 2026-07-15) and trend_intelligence
-- stayed empty. This schedules the full chain: ingest-tier (fast/medium/slow) →
-- publish-feed (republish feed_items from fresh raw_items) → update-trends.
-- Reuses the Vault secret + pg_net wrapper already used by the other crons.
-- ---------------------------------------------------------------------------

create extension if not exists pg_net;
create extension if not exists pg_cron;

-- Generic admin-authed edge trigger (fire-and-forget). Service-role bearer comes
-- from Vault so it satisfies each function's requireAdmin() check.
create or replace function public.trigger_edge(p_fn text, p_body jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_key text;
begin
  select decrypted_secret into v_key from vault.decrypted_secrets where name = 'backfill_service_key' limit 1;
  if v_key is null then
    raise warning 'trigger_edge(%): vault secret backfill_service_key missing; skipping', p_fn;
    return;
  end if;
  perform net.http_post(
    url     := 'https://ywsnuijybcbxylgsjvqi.supabase.co/functions/v1/' || p_fn,
    headers := jsonb_build_object('Content-Type','application/json','Authorization','Bearer ' || v_key, 'apikey', v_key),
    body    := coalesce(p_body, '{}'::jsonb),
    timeout_milliseconds := 150000
  );
end;
$$;

revoke all on function public.trigger_edge(text, jsonb) from public, anon, authenticated;

-- Idempotent (re)schedule.
do $$ begin perform cron.unschedule('ingest-fast');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('ingest-medium');  exception when others then null; end $$;
do $$ begin perform cron.unschedule('ingest-slow');    exception when others then null; end $$;
do $$ begin perform cron.unschedule('publish-feed');   exception when others then null; end $$;
do $$ begin perform cron.unschedule('update-trends');  exception when others then null; end $$;

-- Fetch fresh articles into raw_items + content_archive (tier cadence).
select cron.schedule('ingest-fast',   '*/15 * * * *',  $c$ select public.trigger_edge('ingest-tier', '{"tier":"fast"}'::jsonb) $c$);
select cron.schedule('ingest-medium', '7 * * * *',     $c$ select public.trigger_edge('ingest-tier', '{"tier":"medium"}'::jsonb) $c$);
select cron.schedule('ingest-slow',   '13 */4 * * *',  $c$ select public.trigger_edge('ingest-tier', '{"tier":"slow"}'::jsonb) $c$);
-- Curate + republish feed_items from the freshest raw_items (offset so it runs
-- a few minutes AFTER each fast ingest).
select cron.schedule('publish-feed',  '5,25,45 * * * *', $c$ select public.trigger_edge('publish-feed', '{}'::jsonb) $c$);
-- Trend memory + momentum (Stage 10) — hourly at :20, as its own header specifies.
select cron.schedule('update-trends', '20 * * * *',    $c$ select public.trigger_edge('update-trends', '{}'::jsonb) $c$);
