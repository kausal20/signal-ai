-- ============================================================================
-- OFFICIAL SOURCE DISCOVERY ENGINE · registry health + coverage + monitoring
-- ----------------------------------------------------------------------------
-- Turns source_connectors into a self-describing, health-monitored registry and
-- adds the reusable coverage / health / missing-source APIs that power the admin
-- dashboard and drive continuous discovery. No hardcoded companies — everything
-- is computed from the Knowledge Graph + registry.
-- ============================================================================

-- ── Connector self-description + health telemetry ───────────────────────────
alter table public.source_connectors
  add column if not exists entity_id       uuid references public.entities(id) on delete set null,
  add column if not exists channel_type     text,                    -- blog/press/docs/changelog/research/github/rss/website
  add column if not exists crawl_frequency  text default 'blog',     -- breaking/blog/press/docs/research/github/support
  add column if not exists discovered_by    text,                    -- rss_link/sitemap/robots/probe/github/manual
  add column if not exists health_status    text default 'unknown',  -- healthy/degraded/failing/dead/unknown
  add column if not exists last_success     timestamptz,
  add column if not exists last_failure     timestamptz,
  add column if not exists failure_count    int default 0,
  add column if not exists etag             text,
  add column if not exists last_modified    text,
  add column if not exists confidence       int default 100;

create index if not exists idx_connectors_entity on public.source_connectors(entity_id) where entity_id is not null;
create index if not exists idx_connectors_health on public.source_connectors(health_status);

-- Map a crawl_frequency label → the ingest tier that already runs on a cron.
create or replace function public.crawl_freq_to_tier(freq text)
returns text language sql immutable as $$
  select case freq
    when 'breaking' then 'fast' when 'github' then 'fast'
    when 'blog' then 'fast' when 'press' then 'medium'
    when 'docs' then 'slow' when 'research' then 'slow' when 'support' then 'slow'
    else 'medium' end;
$$;

-- ── Per-entity official-source COVERAGE ─────────────────────────────────────
-- The 8 canonical official channels Signal tracks. An entity "covers" a slot if
-- the channel exists on the entity row OR in the official_publishers registry.
create or replace function public.entity_coverage(p_entity uuid)
returns jsonb
language sql stable as $$
  with e as (select * from public.entities where id = p_entity),
  pub as (select array_agg(distinct publisher_type) t from public.official_publishers where entity_id = p_entity),
  slots as (
    select
      (select (official_domain is not null) or 'company' = any(coalesce((select t from pub),'{}')) from e) as website,
      (select (official_blog_url is not null) or 'blog' = any(coalesce((select t from pub),'{}')) from e) as blog,
      (select (official_newsroom_url is not null or official_press_url is not null) or 'newsroom' = any(coalesce((select t from pub),'{}')) from e) as press,
      (select (official_rss_url is not null) from e)
        or exists (select 1 from public.source_connectors c where c.entity_id = p_entity and c.rss_url is not null) as rss,
      (select (official_docs_url is not null) or 'docs' = any(coalesce((select t from pub),'{}')) from e) as docs,
      (select (official_changelog_url is not null) or 'changelog' = any(coalesce((select t from pub),'{}')) from e) as changelog,
      (select (official_research_url is not null) or 'research' = any(coalesce((select t from pub),'{}')) from e) as research,
      (select (official_github_url is not null) or 'github' = any(coalesce((select t from pub),'{}')) from e) as github
  )
  select jsonb_build_object(
    'website', website, 'blog', blog, 'press', press, 'rss', rss,
    'docs', docs, 'changelog', changelog, 'research', research, 'github', github,
    'score', round(100.0 * ( website::int + blog::int + press::int + rss::int
                            + docs::int + changelog::int + research::int + github::int) / 8.0),
    'missing', (select jsonb_agg(k) from (select k from (values
        ('website',website),('blog',blog),('press',press),('rss',rss),
        ('docs',docs),('changelog',changelog),('research',research),('github',github)
      ) v(k, has) where not has) m)
  ) from slots;
$$;

-- Resolve a query → entity → coverage (reusable for AI Overview / Company Profile).
create or replace function public.get_entity_coverage(q_raw text)
returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'entity_id', r.entity_id, 'name', r.canonical_name, 'slug', r.slug,
    'coverage', public.entity_coverage(r.entity_id),
    'official_publishers', (select jsonb_agg(jsonb_build_object('domain',domain,'type',publisher_type,'priority',priority))
                             from public.official_publishers where entity_id = r.entity_id),
    'connectors', (select count(*) from public.source_connectors where entity_id = r.entity_id),
    'articles', (select count(*) from public.content_archive where official_entity_id = r.entity_id and archive_status='active')
  )
  from public.resolve_entity(q_raw) r;
$$;

-- ── Connector HEALTH monitor (reads fetch_log; sets health_status) ──────────
create or replace function public.refresh_connector_health()
returns integer
language plpgsql as $$
declare n int;
begin
  with agg as (
    select source,
           count(*) filter (where status='ok') ok,
           count(*) filter (where status<>'ok') fail,
           max(ran_at) filter (where status='ok') last_ok,
           max(ran_at) filter (where status<>'ok') last_fail
    from public.fetch_log
    where ran_at > now() - interval '24 hours'
    group by source
  )
  update public.source_connectors c set
    last_success  = coalesce(a.last_ok, c.last_success),
    last_failure  = coalesce(a.last_fail, c.last_failure),
    failure_count = coalesce(a.fail, 0),
    health_status = case
      when a.source is null then coalesce(c.health_status,'unknown')     -- no runs in 24h
      when a.ok = 0 and a.fail >= 3 then 'dead'
      when a.ok = 0 and a.fail > 0 then 'failing'
      when a.fail::numeric / nullif(a.ok + a.fail,0) > 0.3 then 'degraded'
      else 'healthy' end
  from agg a where a.source = c.source;
  get diagnostics n = row_count;
  -- Auto-disable dead feeds so ingestion stops hammering them (re-enabled by discovery).
  update public.source_connectors set enabled = false
    where health_status = 'dead' and enabled = true and failure_count >= 5;
  return n;
end $$;

-- ── Admin dashboard feed ────────────────────────────────────────────────────
create or replace function public.source_dashboard(p_limit int default 100)
returns table(
  entity_id uuid, name text, slug text, coverage_score int, missing jsonb,
  official_publishers int, connectors int, healthy int, unhealthy int,
  articles int, last_sync timestamptz
)
language sql stable as $$
  select e.id, e.canonical_name, e.slug,
    (public.entity_coverage(e.id)->>'score')::int,
    public.entity_coverage(e.id)->'missing',
    (select count(*)::int from public.official_publishers op where op.entity_id = e.id),
    (select count(*)::int from public.source_connectors c where c.entity_id = e.id),
    (select count(*)::int from public.source_connectors c where c.entity_id = e.id and c.health_status = 'healthy'),
    (select count(*)::int from public.source_connectors c where c.entity_id = e.id and c.health_status in ('failing','dead','degraded')),
    (select count(*)::int from public.content_archive a where a.official_entity_id = e.id and a.archive_status='active'),
    (select max(c.last_success) from public.source_connectors c where c.entity_id = e.id)
  from public.entities e
  where e.is_ai = true and lower(coalesce(e.type,'')) in ('company','organization','lab','research_lab')
  order by (select count(*) from public.content_archive a where a.official_entity_id = e.id) desc,
           (public.entity_coverage(e.id)->>'score')::int asc
  limit greatest(1, p_limit);
$$;

-- Entities with real activity but weak coverage → discovery work queue.
create or replace function public.list_missing_sources(p_min_mentions int default 5)
returns table(entity_id uuid, name text, slug text, coverage_score int, mentions int, missing jsonb)
language sql stable as $$
  select e.id, e.canonical_name, e.slug,
    (public.entity_coverage(e.id)->>'score')::int as coverage_score,
    (select count(*)::int from public.entity_article_links l where l.entity_id = e.id) as mentions,
    public.entity_coverage(e.id)->'missing'
  from public.entities e
  where e.is_ai = true and lower(coalesce(e.type,'')) in ('company','organization','lab','research_lab')
    and (public.entity_coverage(e.id)->>'score')::int < 100
    and (select count(*) from public.entity_article_links l where l.entity_id = e.id) >= p_min_mentions
  order by mentions desc, coverage_score asc;
$$;
