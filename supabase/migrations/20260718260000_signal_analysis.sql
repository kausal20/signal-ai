-- Signal Analysis — cached, grounded AI intelligence reports (flagship premium
-- feature). One report per article content-hash, reused by every future viewer.
-- ---------------------------------------------------------------------------
create table if not exists public.signal_analysis (
  id                  uuid primary key default gen_random_uuid(),
  article_id          text not null,
  article_hash        text not null unique,   -- hash(title+summary): the cache key
  model               text,
  analysis_json       jsonb,
  status              text not null default 'pending' check (status in ('pending','ready','error')),
  version             integer not null default 1,
  token_usage         integer,
  generation_time_ms  integer,
  generated_at        timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists idx_signal_analysis_article on public.signal_analysis (article_id);
create index if not exists idx_signal_analysis_status  on public.signal_analysis (status);

-- Lightweight open/interaction analytics (never blocks the UI).
create table if not exists public.signal_analysis_events (
  id          uuid primary key default gen_random_uuid(),
  article_id  text not null,
  event       text not null,   -- open | complete | ask_signal | share | copy | chip_click
  meta        jsonb,
  created_at  timestamptz not null default now()
);
create index if not exists idx_analysis_events_article on public.signal_analysis_events (article_id, event);

-- Service role only (the edge function reads/writes; the app calls the fn).
alter table public.signal_analysis        enable row level security;
alter table public.signal_analysis_events enable row level security;
-- Allow anon to log analytics events (no read).
drop policy if exists analysis_events_insert on public.signal_analysis_events;
create policy analysis_events_insert on public.signal_analysis_events for insert to anon, authenticated with check (true);
grant insert on public.signal_analysis_events to anon, authenticated;
