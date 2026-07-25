-- Prompt Library · per-user saves + usage history (anonymous via client_id).
create table if not exists public.prompt_saves (
  client_id  text not null,
  prompt_id  uuid not null references public.prompts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (client_id, prompt_id)
);
create index if not exists idx_prompt_saves_client on public.prompt_saves(client_id, created_at desc);

create table if not exists public.prompt_usage (
  id         bigint generated always as identity primary key,
  client_id  text,
  prompt_id  uuid references public.prompts(id) on delete cascade,
  action     text not null check (action in ('view','copy','share','save','unsave','generate','open_ask')),
  query      text,
  created_at timestamptz not null default now()
);
create index if not exists idx_prompt_usage_client on public.prompt_usage(client_id, created_at desc);

alter table public.prompt_saves enable row level security;
alter table public.prompt_usage enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='prompt_saves' and policyname='saves_all') then
    create policy saves_all on public.prompt_saves for all using (true) with check (true); end if;
  if not exists (select 1 from pg_policies where tablename='prompt_usage' and policyname='usage_all') then
    create policy usage_all on public.prompt_usage for all using (true) with check (true); end if;
end $$;

-- A client's saved prompts (full rows), newest-saved first.
create or replace function public.saved_prompts(p_client text, p_limit int default 50)
returns setof public.prompts language sql stable as $$
  select p.* from public.prompts p
  join public.prompt_saves s on s.prompt_id = p.id
  where s.client_id = p_client
  order by s.created_at desc
  limit greatest(1, p_limit);
$$;

-- A client's recently-used prompts (distinct, newest first).
create or replace function public.recent_prompts(p_client text, p_limit int default 20)
returns setof public.prompts language sql stable as $$
  select p.* from public.prompts p
  join (
    select prompt_id, max(created_at) last_used
    from public.prompt_usage
    where client_id = p_client and prompt_id is not null and action in ('copy','view','open_ask')
    group by prompt_id
  ) u on u.prompt_id = p.id
  order by u.last_used desc
  limit greatest(1, p_limit);
$$;
