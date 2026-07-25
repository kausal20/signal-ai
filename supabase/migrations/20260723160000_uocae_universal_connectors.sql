-- ============================================================================
-- UOCAE · universal-connector fields + adaptive scheduling + self-healing
-- ----------------------------------------------------------------------------
-- Turns source_connectors into the single interface for every acquisition path
-- (RSS/Atom/API/Sitemap/Blog/Newsroom/Changelog/GitHub/Status/Static/Social).
-- Adds fetcher-agnostic metadata used by every connector type, an activity
-- signal that drives adaptive scheduling, and a rediscovery flag that lets the
-- maintenance job repair broken connectors without human intervention.
-- ============================================================================

alter table public.source_connectors
  add column if not exists connector_type   text default 'rss',
    -- rss | atom | api | sitemap | blog | newsroom | docs | changelog | releases | github | status | static | social
  add column if not exists feed_url         text,          -- primary acquisition URL (sitemap/blog/api)
  add column if not exists url_pattern      text,          -- e.g. '/blog/*' for sitemap/blog filtering
  add column if not exists source_score     int,           -- 0-100 quality score at discovery time
  add column if not exists last_fetch_at    timestamptz,   -- last time the fetcher ran, ok or fail
  add column if not exists next_fetch_at    timestamptz,   -- adaptive scheduler cursor
  add column if not exists items_last_run   int,           -- items acquired in the last run
  add column if not exists items_7d         int default 0, -- rolling activity signal (adaptive)
  add column if not exists needs_rediscovery boolean default false;

create index if not exists idx_connectors_type       on public.source_connectors(connector_type);
create index if not exists idx_connectors_next       on public.source_connectors(next_fetch_at) where enabled;
create index if not exists idx_connectors_rediscover on public.source_connectors(needs_rediscovery) where needs_rediscovery;

-- Every existing connector defaults to type 'rss'; the discovery/factory will
-- write the real type when it recrawls (or the fetcher can infer from the URL).
update public.source_connectors
  set connector_type = case
    when rss_url like '%/sitemap%'    then 'sitemap'
    when rss_url like '%.atom%'        then 'atom'
    when rss_url like '%github.com%'   then 'github'
    when rss_url like '%/changelog%'   then 'changelog'
    when rss_url is not null           then 'rss'
    when news_query is not null        then 'rss'   -- Google-News fallback stays generic
    else 'rss'
  end
where connector_type is null or connector_type = 'rss';

-- ── Rolling activity signal from fetch_log (drives adaptive cadence) ────────
create or replace function public.refresh_connector_activity()
returns integer language plpgsql as $$
declare n int;
begin
  with agg as (
    select source, coalesce(sum(items_fetched), 0)::int as items
    from public.fetch_log
    where ran_at > now() - interval '7 days'
    group by source
  )
  update public.source_connectors c
    set items_7d = coalesce(a.items, 0)
  from agg a where a.source = c.source;
  get diagnostics n = row_count;
  return n;
end $$;

-- ── Adaptive scheduler ──────────────────────────────────────────────────────
-- Weekly items → tier (fast<15m / medium<1h / slow<4h / archive<24h). Overrides
-- `tier` so the existing ingest-fast/medium/slow crons pick it up. Silent
-- connectors get slowed down; noisy connectors get promoted.
create or replace function public.adaptive_reschedule_connectors()
returns integer language plpgsql as $$
declare n int;
begin
  update public.source_connectors c
    set tier = case
      when items_7d >= 40 then 'fast'      -- >5/day → check frequently
      when items_7d >= 10 then 'medium'    -- ~1-5/day
      when items_7d >= 2  then 'slow'      -- weekly cadence
      else 'slow' end,
    crawl_frequency = case
      when items_7d >= 40 then 'blog'
      when items_7d >= 10 then 'press'
      else 'docs' end
  where enabled = true;
  get diagnostics n = row_count;
  perform public.log_source_op('adaptive', jsonb_build_object('rescheduled', n));
  return n;
end $$;

-- ── Self-healing: mark broken connectors for rediscovery ────────────────────
-- Called from run_source_maintenance. When a connector is dead + linked to an
-- entity, don't just disable it — flag the entity's discovery cursor so the
-- next discovery run replaces it with a working source (RSS→Atom→Sitemap→Blog).
create or replace function public.mark_dead_connectors_for_rediscovery()
returns integer language plpgsql as $$
declare n int;
begin
  update public.source_connectors
    set needs_rediscovery = true
  where enabled = false and health_status = 'dead' and entity_id is not null
    and not needs_rediscovery;
  get diagnostics n = row_count;
  -- Reset the entity's discovery cursor so the next discover-sources run picks
  -- it up ahead of the 30-day recheck cadence.
  update public.entities e
    set official_sources_checked_at = null
  where e.id in (select entity_id from public.source_connectors where needs_rediscovery);
  perform public.log_source_op('rediscover', jsonb_build_object('flagged', n));
  return n;
end $$;

-- Extend the maintenance orchestrator with activity refresh + adaptive reschedule
-- + rediscovery marking. Everything logged; no admin intervention required.
create or replace function public.run_source_maintenance()
returns jsonb language plpgsql as $$
declare t0 timestamptz := clock_timestamp();
  h int; r int; p int; c int; rc int; act int; adj int; rd int;
begin
  begin h := public.refresh_connector_health();                exception when others then h := -1; perform public.log_source_op('health','{}'::jsonb,'error',sqlerrm); end;
  begin act := public.refresh_connector_activity();            exception when others then act := -1; perform public.log_source_op('activity','{}'::jsonb,'error',sqlerrm); end;
  begin adj := public.adaptive_reschedule_connectors();        exception when others then adj := -1; perform public.log_source_op('adaptive','{}'::jsonb,'error',sqlerrm); end;
  begin r := public.retry_failed_sources();                    exception when others then r := -1; perform public.log_source_op('retry','{}'::jsonb,'error',sqlerrm); end;
  begin rd := public.mark_dead_connectors_for_rediscovery();   exception when others then rd := -1; perform public.log_source_op('rediscover','{}'::jsonb,'error',sqlerrm); end;
  begin p := public.prune_invalid_sources();                   exception when others then p := -1; perform public.log_source_op('prune','{}'::jsonb,'error',sqlerrm); end;
  begin rc := public.reclassify_official_entities();           exception when others then rc := -1; perform public.log_source_op('reclassify','{}'::jsonb,'error',sqlerrm); end;
  begin c := public.refresh_coverage_scores();                 exception when others then c := -1; perform public.log_source_op('coverage','{}'::jsonb,'error',sqlerrm); end;
  perform public.log_source_op('maintenance',
    jsonb_build_object('health',h,'activity',act,'adaptive',adj,'retry',r,'rediscover',rd,'prune',p,'reclassify',rc,'coverage',c),
    'ok', null, (extract(epoch from (clock_timestamp()-t0))*1000)::int);
  return jsonb_build_object('health',h,'activity',act,'adaptive',adj,'retry',r,'rediscover',rd,'prune',p,'reclassify',rc,'coverage',c);
end $$;
