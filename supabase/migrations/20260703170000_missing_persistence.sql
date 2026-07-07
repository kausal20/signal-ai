-- Phase 4 · Persistence completion — create the tables + RPCs that edge-function
-- code already references but were never migrated (silent best-effort failures).
-- Schemas derived STRICTLY from the actual insert/upsert/select/rpc call sites.
-- Additive only. No existing table modified. RLS service-only (none anon-read).
--
-- Behavioral tables use client_id/feed_item_id as PLAIN TEXT with NO FK: the
-- code inserts anonymous client_ids and "_none" feed sentinels, so a FK would
-- reject the write (the exact silent-fail this migration removes).

create extension if not exists vector;

-- ─────────────────────────────────────────────────────────────────────────────
-- LEARNING SIGNALS
-- record-signal.upsert(event_id,feed_item_id,signal_kind,client_id,duration_ms,meta)
-- personalize.select(feed_item_id,signal_kind,occurred_at,duration_ms) by client_id
-- signal-health counts by signal_kind + occurred_at.
create table if not exists public.user_signals (
  id           bigint generated always as identity primary key,
  event_id     text unique,                              -- onConflict dedupe key
  feed_item_id text not null default '_none',
  signal_kind  text not null,
  client_id    text,
  duration_ms  integer,
  meta         jsonb not null default '{}'::jsonb,
  occurred_at  timestamptz not null default now()        -- select order/gt + health gte
);
create index if not exists idx_user_signals_client_time on public.user_signals (client_id, occurred_at);
create index if not exists idx_user_signals_time on public.user_signals (occurred_at desc);
create index if not exists idx_user_signals_kind_time on public.user_signals (signal_kind, occurred_at);

-- record-signal/personalize.insert(client_id,query)
create table if not exists public.user_searches (
  id         bigint generated always as identity primary key,
  client_id  text,
  query      text not null,
  created_at timestamptz not null default now()
);
create index if not exists idx_user_searches_client on public.user_searches (client_id, created_at desc);

-- record-outcome.upsert(event_id,client_id,feed_item_id,outcome_kind,value,note)
create table if not exists public.outcome_events (
  id           bigint generated always as identity primary key,
  event_id     text unique,
  client_id    text,
  feed_item_id text,
  outcome_kind text not null,
  value        numeric,
  note         text,
  created_at   timestamptz not null default now()
);
create index if not exists idx_outcome_events_time on public.outcome_events (created_at desc);

-- personalize.select(feed_item_id,persona,impressions,clicks,saves,shares,ignores)
-- bump_outcome() increments one counter column. PK (feed_item_id,persona).
create table if not exists public.recommendation_outcomes (
  feed_item_id text not null,
  persona      text not null default '_all',
  impressions  integer not null default 0,
  clicks       integer not null default 0,
  saves        integer not null default 0,
  shares       integer not null default 0,
  ignores      integer not null default 0,
  updated_at   timestamptz not null default now(),
  primary key (feed_item_id, persona)
);
create index if not exists idx_rec_outcomes_item on public.recommendation_outcomes (feed_item_id);

-- global_graph.select(key,alpha,beta,influence) by kind+key; bump_bayes() updates.
create table if not exists public.global_intelligence (
  key        text not null,
  kind       text not null,
  alpha      numeric not null default 1,
  beta       numeric not null default 1,
  influence  numeric,
  updated_at timestamptz not null default now(),
  primary key (key, kind)
);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRENDS
-- update-trends.upsert(id,label,kind,aliases?,last_seen_at,total_mentions?,rolling_7d,rolling_14d,momentum,trend_state)
-- trends.loadTrendIndex select(*); signal-health select(id,trend_state,momentum,rolling_7d).
create table if not exists public.trend_entities (
  id             text primary key,
  label          text not null,
  kind           text not null,
  aliases        text[] not null default '{}',
  rolling_7d     integer not null default 0,
  rolling_14d    integer not null default 0,
  total_mentions integer not null default 0,
  momentum       integer not null default 0,
  trend_state    text,
  last_seen_at   timestamptz,
  updated_at     timestamptz not null default now()
);
create index if not exists idx_trend_entities_momentum on public.trend_entities (momentum desc);

-- update-trends.upsert(entity_id,observed_on,mentions,source_count) onConflict (entity_id,observed_on)
create table if not exists public.trend_observations (
  entity_id    text not null,
  observed_on  date not null,
  mentions     integer not null default 0,
  source_count integer not null default 0,
  primary key (entity_id, observed_on)
);

-- trend_intel.upsert(entity_id,label,summary,why_it_matters,prediction,direction,acceleration,confidence,evidence,degraded,updated_at)
-- personalize.select(entity_id,label,summary,why_it_matters,prediction,direction,confidence)
create table if not exists public.trend_intelligence (
  entity_id      text primary key,
  label          text,
  summary        text,
  why_it_matters text,
  prediction     text,
  direction      text,
  acceleration   numeric,
  confidence     integer,
  evidence       jsonb,
  degraded       boolean not null default false,
  updated_at     timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- EMBEDDINGS / COLLABORATIVE (pgvector)
-- vector_store.upsert(feed_item_id,embedding,model,created_at) onConflict feed_item_id
create table if not exists public.story_embeddings (
  feed_item_id text primary key,
  embedding    vector(1536),
  model        text,
  created_at   timestamptz not null default now()
);
-- vector_store.upsert(concept,embedding,model,updated_at) onConflict concept
create table if not exists public.concept_embeddings (
  concept    text primary key,
  embedding  vector(1536),
  model      text,
  updated_at timestamptz not null default now()
);
-- vector_store.upsert(client_id,embedding,sample_count,updated_at); select(embedding,sample_count)
create table if not exists public.user_embeddings (
  client_id    text primary key,
  embedding    vector(1536),
  sample_count integer not null default 0,
  updated_at   timestamptz not null default now()
);
-- cluster-users.upsert(cluster_id,centroid,member_count,top_concepts,updated_at) onConflict cluster_id
create table if not exists public.cluster_profiles (
  cluster_id   integer primary key,
  centroid     vector(1536),
  member_count integer not null default 0,
  top_concepts text[] not null default '{}',
  updated_at   timestamptz not null default now()
);
-- cluster-users.upsert(client_id,cluster_id,similarity,updated_at) onConflict client_id
create table if not exists public.user_clusters (
  client_id  text primary key,
  cluster_id integer,
  similarity numeric,
  updated_at timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- EDITORIAL AUDITS · PIPELINE METRICS · NOTIFICATION LOG · PUSH
-- store.insert(cluster_id,leverage_score,q_*,one_sentence,teen_understandable,action_required,rejection_reason,raw_payload)
create table if not exists public.editorial_audits (
  id                   bigint generated always as identity primary key,
  cluster_id           text,
  leverage_score       integer,
  q_founder            boolean,
  q_builder            boolean,
  q_agency             boolean,
  q_vibe_coder         boolean,
  q_saves_time         boolean,
  q_creates_business   boolean,
  q_changes_workflow   boolean,
  q_remember_tomorrow  boolean,
  q_recommend          boolean,
  one_sentence         boolean,
  teen_understandable  boolean,
  action_required      boolean,
  rejection_reason     text,
  raw_payload          jsonb,
  created_at           timestamptz not null default now()
);

-- store.recordPipelineRun.insert(PipelineMetricsRow)
create table if not exists public.pipeline_metrics (
  id                    bigint generated always as identity primary key,
  curation_mode         text,
  tier                  text,
  raw_count             integer,
  rejected_count        integer,
  accepted_count        integer,
  cluster_count         integer,
  multi_source_clusters integer,
  curated_count         integer,
  stored_count          integer,
  sources_ok            integer,
  sources_total         integer,
  disabled_sources      text[],
  duration_ms           integer,
  ai_gateway_ok         boolean,
  stage_timings         jsonb,
  acceptance_rate       numeric,
  rewrite_success_rate  numeric,
  created_at            timestamptz not null default now()
);

-- send-notifications.insert(subscription_endpoint,feed_item_id,status) + select(feed_item_id,status,sent_at)
create table if not exists public.notification_log (
  id                    bigint generated always as identity primary key,
  subscription_endpoint text not null,
  feed_item_id          text,
  status                text,
  sent_at               timestamptz not null default now()
);
create index if not exists idx_notif_log_endpoint_time on public.notification_log (subscription_endpoint, sent_at desc);

-- register-push.upsert(endpoint,p256dh,auth,user_agent,last_seen) + prefs; send-notifications.select
create table if not exists public.push_subscriptions (
  endpoint         text primary key,
  p256dh           text not null,
  auth             text not null,
  user_agent       text,
  enabled          boolean not null default true,
  quiet_mode       boolean not null default false,
  importance_level text not null default 'balanced',
  last_seen        timestamptz not null default now(),
  created_at       timestamptz not null default now()
);
create index if not exists idx_push_active on public.push_subscriptions (enabled, quiet_mode);

-- ─────────────────────────────────────────────────────────────────────────────
-- RLS: all service-role-only (edge functions use the service key; RLS bypassed).
-- Enable RLS + explicit deny-public policy (matches clients/user_profiles pattern).
do $$
declare t text;
begin
  foreach t in array array[
    'user_signals','user_searches','outcome_events','recommendation_outcomes',
    'global_intelligence','trend_entities','trend_observations','trend_intelligence',
    'story_embeddings','concept_embeddings','user_embeddings','cluster_profiles',
    'user_clusters','editorial_audits','pipeline_metrics','notification_log','push_subscriptions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t||'_service_only', t);
    execute format('create policy %I on public.%I for select using (false)', t||'_service_only', t);
  end loop;
end $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPCs (SECURITY INVOKER — callers are the service role, which bypasses RLS).
-- bump_outcome: increment one counter on recommendation_outcomes.
create or replace function public.bump_outcome(p_feed_item_id text, p_persona text, p_field text, p_delta integer)
returns void language plpgsql as $$
begin
  insert into public.recommendation_outcomes (feed_item_id, persona, impressions, clicks, saves, shares, ignores)
  values (
    p_feed_item_id, coalesce(nullif(p_persona, ''), '_all'),
    case when p_field = 'impressions' then p_delta else 0 end,
    case when p_field = 'clicks'      then p_delta else 0 end,
    case when p_field = 'saves'       then p_delta else 0 end,
    case when p_field = 'shares'      then p_delta else 0 end,
    case when p_field = 'ignores'     then p_delta else 0 end
  )
  on conflict (feed_item_id, persona) do update set
    impressions = public.recommendation_outcomes.impressions + (case when p_field = 'impressions' then p_delta else 0 end),
    clicks      = public.recommendation_outcomes.clicks      + (case when p_field = 'clicks'      then p_delta else 0 end),
    saves       = public.recommendation_outcomes.saves       + (case when p_field = 'saves'       then p_delta else 0 end),
    shares      = public.recommendation_outcomes.shares      + (case when p_field = 'shares'      then p_delta else 0 end),
    ignores     = public.recommendation_outcomes.ignores     + (case when p_field = 'ignores'     then p_delta else 0 end),
    updated_at  = now();
end $$;

-- bump_bayes: nudge a Beta(alpha,beta) global stat.
create or replace function public.bump_bayes(p_key text, p_kind text, p_success numeric, p_fail numeric)
returns void language plpgsql as $$
begin
  insert into public.global_intelligence (key, kind, alpha, beta)
  values (p_key, p_kind, 1 + coalesce(p_success, 0), 1 + coalesce(p_fail, 0))
  on conflict (key, kind) do update set
    alpha      = public.global_intelligence.alpha + coalesce(p_success, 0),
    beta       = public.global_intelligence.beta  + coalesce(p_fail, 0),
    updated_at = now();
end $$;
