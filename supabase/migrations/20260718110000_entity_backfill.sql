-- Entity backfill progress — single-row state for the `backfill-entities` edge
-- function. cursor_id drives the SEED phase (copy_raw_to_archive keyset over
-- raw_items); the entity-processing phase resumes off content_archive.entity_status
-- itself. Lets both phases run across multiple invocations (edge wall-clock
-- limits) without redoing work. Service-role only (RLS enabled, no policies).

create table if not exists public.entity_backfill_progress (
  id         int primary key default 1,
  cursor_id  text,                         -- seed cursor: last raw_items.id copied
  processed  integer not null default 0,   -- archive rows entity-processed
  linked     integer not null default 0,   -- rows that produced >= 1 entity link
  total      integer,                       -- content_archive count snapshot
  status     text not null default 'idle', -- idle | running | done | error
  last_error text,
  started_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint entity_backfill_single_row check (id = 1)
);

insert into public.entity_backfill_progress (id) values (1)
on conflict (id) do nothing;

alter table public.entity_backfill_progress enable row level security;
-- Intentionally no policies: only the pipeline/backfill service role (which
-- bypasses RLS) reads or writes this table.
