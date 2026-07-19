-- News Intelligence (AI News Intelligence feature) — additive.
-- One cached AI-analysis row per article. Nothing existing is modified.

create table if not exists public.news_intelligence (
  article_id        text primary key,
  summary           text        not null,
  why_it_matters    text        not null default '',
  affected_groups   jsonb       not null default '[]'::jsonb,
  importance_score  integer     not null default 50 check (importance_score between 0 and 100),
  key_takeaways     jsonb       not null default '[]'::jsonb,
  related_topics    jsonb       not null default '[]'::jsonb,
  confidence        integer     not null default 60 check (confidence between 0 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.news_intelligence is
  'Cached AI-generated intelligence per news article. Written only by the news-intelligence edge function (service role).';

-- Keep updated_at fresh on upsert/update.
create or replace function public.touch_news_intelligence_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_news_intelligence_updated_at on public.news_intelligence;
create trigger trg_news_intelligence_updated_at
  before update on public.news_intelligence
  for each row execute function public.touch_news_intelligence_updated_at();

-- RLS: read-only for clients; writes happen via the edge function's service
-- role, which bypasses RLS. No insert/update/delete policy is granted to
-- anon/authenticated by design.
alter table public.news_intelligence enable row level security;

drop policy if exists "news_intelligence read" on public.news_intelligence;
create policy "news_intelligence read"
  on public.news_intelligence
  for select
  to anon, authenticated
  using (true);
