-- Signal AI Overview cache. One 3-line grounded summary per recognized entity,
-- so the search page renders instantly (cache first, generate on miss). Reused
-- across all users. Regeneration signal = the entity's freshest article changed
-- (major release / announcement) OR the row is older than the TTL.
create table if not exists public.entity_overviews (
  entity_id       uuid primary key references public.entities(id) on delete cascade,
  overview        text not null,
  sources         jsonb not null default '[]'::jsonb,   -- [{title,url,publisher,published_at}]
  model           text,
  latest_seen_at  timestamptz,                          -- max(published_at) of grounding set
  generated_at    timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  refresh_after   timestamptz not null default (now() + interval '30 days')
);

-- Read-only for anon/authenticated (frontend calls the edge fn which reads via
-- service role; a public SELECT policy is fine for transparency + fast reads).
alter table public.entity_overviews enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='entity_overviews' and policyname='overviews_read_all') then
    create policy overviews_read_all on public.entity_overviews for select using (true);
  end if;
end $$;

create index if not exists idx_entity_overviews_refresh on public.entity_overviews (refresh_after);
