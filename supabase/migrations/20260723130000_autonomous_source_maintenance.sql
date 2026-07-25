-- ============================================================================
-- OFFICIAL SOURCE DISCOVERY ENGINE · autonomous background maintenance
-- ----------------------------------------------------------------------------
-- No admin UI. Everything (discover → verify → connect → monitor → retry →
-- prune → refresh → reclassify → maintain registry) runs on scheduled jobs and
-- writes structured rows to `source_ops_log` for debugging / observability.
-- ============================================================================

-- ── Observability log ───────────────────────────────────────────────────────
create table if not exists public.source_ops_log (
  id         bigint generated always as identity primary key,
  op         text not null,                    -- health/retry/prune/coverage/reclassify/discovery/maintenance
  status     text not null default 'ok',       -- ok/warn/error
  counts     jsonb not null default '{}'::jsonb,
  detail     text,
  ms         int,
  created_at timestamptz not null default now()
);
create index if not exists idx_source_ops_log_op   on public.source_ops_log(op, created_at desc);
create index if not exists idx_source_ops_log_time on public.source_ops_log(created_at desc);
alter table public.source_ops_log enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='source_ops_log' and policyname='ops_log_read_all') then
    create policy ops_log_read_all on public.source_ops_log for select using (true);
  end if;
end $$;

create or replace function public.log_source_op(p_op text, p_counts jsonb default '{}'::jsonb, p_status text default 'ok', p_detail text default null, p_ms int default null)
returns void language sql as $$
  insert into public.source_ops_log(op, status, counts, detail, ms) values (p_op, p_status, coalesce(p_counts,'{}'::jsonb), p_detail, p_ms);
$$;

-- Persisted coverage score (refreshed by the job; no live recompute needed).
alter table public.entities
  add column if not exists source_coverage_score int,
  add column if not exists source_coverage_updated_at timestamptz;

-- ── RETRY failed sources ────────────────────────────────────────────────────
-- Give auto-disabled feeds another chance once their last failure has cooled off
-- (6h): re-enable + reset the counter so ingestion probes them again. Genuinely
-- dead feeds get re-disabled by the next health pass; recovered ones stay up.
create or replace function public.retry_failed_sources()
returns integer language plpgsql as $$
declare n int;
begin
  update public.source_connectors
    set enabled = true, failure_count = 0, health_status = 'unknown'
  where enabled = false
    and source_kind = 'official'
    and coalesce(last_failure, now() - interval '999 days') < now() - interval '6 hours';
  get diagnostics n = row_count;
  perform public.log_source_op('retry', jsonb_build_object('reenabled', n));
  return n;
end $$;

-- ── PRUNE invalid sources ───────────────────────────────────────────────────
-- Remove discovered connectors that never worked: disabled, no successful fetch
-- ever, >14 days old, and produced zero archived articles. Also sweep any
-- shared-platform rows from the registry (defence-in-depth).
create or replace function public.prune_invalid_sources()
returns integer language plpgsql as $$
declare n_conn int; n_pub int;
begin
  delete from public.source_connectors c
  where c.source_kind = 'official'
    and c.enabled = false
    and c.last_success is null
    and c.created_at < now() - interval '14 days'
    and not exists (
      select 1 from public.content_archive a
      where a.official_entity_id = c.entity_id and a.archive_status = 'active'
    );
  get diagnostics n_conn = row_count;

  delete from public.official_publishers
  where domain in (
    'github.com','gitlab.com','medium.com','substack.com','youtube.com','youtu.be','twitter.com','x.com',
    'linkedin.com','reddit.com','producthunt.com','facebook.com','instagram.com','notion.site','wordpress.com',
    'lh3.googleusercontent.com','googleusercontent.com','gstatic.com','news.google.com','google.com'
  );
  get diagnostics n_pub = row_count;

  perform public.log_source_op('prune', jsonb_build_object('connectors_removed', n_conn, 'publishers_removed', n_pub),
    case when n_pub > 0 then 'warn' else 'ok' end);
  return n_conn + n_pub;
end $$;

-- ── REFRESH coverage scores ─────────────────────────────────────────────────
create or replace function public.refresh_coverage_scores()
returns integer language plpgsql as $$
declare n int;
begin
  update public.entities e
    set source_coverage_score = (public.entity_coverage(e.id)->>'score')::int,
        source_coverage_updated_at = now()
  where e.is_ai = true and lower(coalesce(e.type,'')) in ('company','organization','lab','research_lab');
  get diagnostics n = row_count;
  perform public.log_source_op('coverage', jsonb_build_object('entities_scored', n));
  return n;
end $$;

-- ── ORCHESTRATOR — one autonomous maintenance pass ──────────────────────────
create or replace function public.run_source_maintenance()
returns jsonb language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
  c_health int; c_retry int; c_prune int; c_cov int; c_reclass int;
begin
  begin c_health  := public.refresh_connector_health();      exception when others then c_health  := -1; perform public.log_source_op('health','{}'::jsonb,'error',sqlerrm); end;
  begin c_retry   := public.retry_failed_sources();          exception when others then c_retry   := -1; perform public.log_source_op('retry','{}'::jsonb,'error',sqlerrm); end;
  begin c_prune   := public.prune_invalid_sources();         exception when others then c_prune   := -1; perform public.log_source_op('prune','{}'::jsonb,'error',sqlerrm); end;
  begin c_reclass := public.reclassify_official_entities();  exception when others then c_reclass := -1; perform public.log_source_op('reclassify','{}'::jsonb,'error',sqlerrm); end;
  begin c_cov     := public.refresh_coverage_scores();       exception when others then c_cov     := -1; perform public.log_source_op('coverage','{}'::jsonb,'error',sqlerrm); end;

  perform public.refresh_connector_health();  -- log the health pass explicitly
  perform public.log_source_op('maintenance',
    jsonb_build_object('health_updated',c_health,'reenabled',c_retry,'pruned',c_prune,'reclassified',c_reclass,'scored',c_cov),
    'ok', null, (extract(epoch from (clock_timestamp()-t0))*1000)::int);

  return jsonb_build_object('health',c_health,'retry',c_retry,'prune',c_prune,'reclassify',c_reclass,'coverage',c_cov);
end $$;

-- ── SCHEDULES ───────────────────────────────────────────────────────────────
-- Fold the standalone health/reclassify jobs into the single maintenance pass.
do $$ begin perform cron.unschedule('source-health-monitor'); exception when others then null; end $$;
do $$ begin perform cron.unschedule('reclassify-official');   exception when others then null; end $$;
do $$ begin perform cron.unschedule('source-maintenance');    exception when others then null; end $$;
-- Autonomous maintenance every 10 min (health, retry, prune, reclassify, coverage).
select cron.schedule('source-maintenance', '*/10 * * * *', $$ select public.run_source_maintenance() $$);
-- Discovery (external crawl) already runs every 30 min via official-source-discovery.

-- Nightly log retention (keep 30 days).
do $$ begin perform cron.unschedule('source-ops-log-prune'); exception when others then null; end $$;
select cron.schedule('source-ops-log-prune', '50 3 * * *', $$ delete from public.source_ops_log where created_at < now() - interval '30 days' $$);
