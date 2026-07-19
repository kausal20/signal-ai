-- AI Pulse cache (AI Pulse feature) — additive.
-- One global cached snapshot of the AI-industry pulse, refreshed every few
-- hours by the ai-pulse edge function. All sections live in `pulse` (jsonb).
-- Nothing existing is modified.

create table if not exists public.ai_pulse_cache (
  id           text primary key default 'global',
  pulse        jsonb       not null,
  generated_at timestamptz not null default now()
);

comment on table public.ai_pulse_cache is
  'Cached AI-generated industry pulse. Written only by the ai-pulse edge function (service role). Full payload in `pulse`.';

-- RLS: read-only for clients; writes go through the edge function's service
-- role (bypasses RLS). No insert/update/delete policy granted by design.
alter table public.ai_pulse_cache enable row level security;

drop policy if exists "ai_pulse_cache read" on public.ai_pulse_cache;
create policy "ai_pulse_cache read"
  on public.ai_pulse_cache
  for select
  to anon, authenticated
  using (true);
