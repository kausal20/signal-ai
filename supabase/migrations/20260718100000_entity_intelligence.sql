-- Signal Entity Intelligence — dynamic, self-discovering registry for ANY
-- AI-related entity (companies, models, products, people, labs, frameworks,
-- open-source, libraries, funding, acquisitions, partnerships, APIs, hardware,
-- AI chips). No hardcoded lists: every entity is discovered from articles,
-- normalized, aliased, indexed, and made searchable automatically.
-- ---------------------------------------------------------------------------
-- Additive to the live schema. Writes happen only through the pipeline's
-- service role; app roles get read-only access via RLS + read RPCs.
-- `signal_search` keeps its existing signature so search/index.ts is unchanged.
-- A `companies` view exposes the company subset for any company-scoped caller.
-- ---------------------------------------------------------------------------

create extension if not exists pg_trgm;

-- ── Normalization: match key = lowercase, strip all non-alnum ────────────────
-- "GitHub"/"Git Hub"/"github"→"github"; "Deep Seek"→"deepseek".
create or replace function public.normalize_entity_name(raw text)
returns text language sql immutable as $$
  select regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', '', 'g');
$$;

-- ── entities: one row per discovered thing ───────────────────────────────────
create table if not exists public.entities (
  id              uuid primary key default gen_random_uuid(),
  type            text not null check (type in (
                    'company','model','product','person','organization','lab',
                    'framework','open_source','library','funding','acquisition',
                    'partnership','api','hardware','ai_chip','topic')),
  slug            text not null unique,
  canonical_name  text not null,
  normalized_name text not null,
  description     text,
  website         text,
  logo_url        text,
  is_ai           boolean not null default true,
  extra           jsonb not null default '{}'::jsonb,
  first_seen      timestamptz not null default now(),
  last_seen       timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (type, normalized_name)
);

-- ── entity_aliases: one row per alias (scales to 100k, fast autocomplete) ─────
create table if not exists public.entity_aliases (
  id               uuid primary key default gen_random_uuid(),
  entity_id        uuid not null references public.entities(id) on delete cascade,
  alias            text not null,
  normalized_alias text not null,
  source           text not null default 'extraction',
  created_at       timestamptz not null default now(),
  unique (entity_id, normalized_alias)
);

-- ── entity_relationships: entity ⇄ entity (partnerships, acquisitions, …) ─────
create table if not exists public.entity_relationships (
  id          uuid primary key default gen_random_uuid(),
  from_entity uuid not null references public.entities(id) on delete cascade,
  to_entity   uuid not null references public.entities(id) on delete cascade,
  type        text not null check (type in (
                'partnership','acquisition','competitor','parent','subsidiary',
                'product_of','works_at','investor','integration','related')),
  confidence  real not null default 1.0,
  article_id  text references public.content_archive(id) on delete set null,
  first_seen  timestamptz not null default now(),
  last_seen   timestamptz not null default now(),
  unique (from_entity, to_entity, type)
);

-- ── entity_metrics: rolled-up signal counts per entity ───────────────────────
create table if not exists public.entity_metrics (
  entity_id        uuid primary key references public.entities(id) on delete cascade,
  news_count       integer not null default 0,
  news_count_7d    integer not null default 0,
  news_count_30d   integer not null default 0,
  first_seen       timestamptz,
  last_seen        timestamptz,
  avg_signal_score real not null default 0,
  trending_score   real not null default 0,
  momentum_score   real not null default 0,
  updated_at       timestamptz not null default now()
);

-- ── entity_article_links: entity ⇄ content_archive ───────────────────────────
create table if not exists public.entity_article_links (
  entity_id    uuid not null references public.entities(id) on delete cascade,
  article_id   text not null references public.content_archive(id) on delete cascade,
  mention_type text,   -- primary | mentioned | product | funding | acquisition
  confidence   real not null default 1.0,
  created_at   timestamptz not null default now(),
  primary key (entity_id, article_id)
);

-- ── Indexes (fuzzy match, prefix autocomplete, joins, leaderboards) ──────────
create index if not exists idx_entities_norm_trgm   on public.entities using gin (normalized_name gin_trgm_ops);
create index if not exists idx_entities_name_trgm    on public.entities using gin (canonical_name gin_trgm_ops);
create index if not exists idx_entities_norm_prefix  on public.entities (normalized_name text_pattern_ops);
create index if not exists idx_entities_type          on public.entities (type);
create index if not exists idx_entities_is_ai         on public.entities (is_ai);
create index if not exists idx_ealias_norm_trgm       on public.entity_aliases using gin (normalized_alias gin_trgm_ops);
create index if not exists idx_ealias_norm_prefix     on public.entity_aliases (normalized_alias text_pattern_ops);
create index if not exists idx_ealias_entity          on public.entity_aliases (entity_id);
create index if not exists idx_erel_from              on public.entity_relationships (from_entity);
create index if not exists idx_erel_to                on public.entity_relationships (to_entity);
create index if not exists idx_eal_article            on public.entity_article_links (article_id);
create index if not exists idx_eal_entity             on public.entity_article_links (entity_id);
create index if not exists idx_emetrics_trending      on public.entity_metrics (trending_score desc);
create index if not exists idx_emetrics_news          on public.entity_metrics (news_count desc);
create index if not exists idx_emetrics_last_seen     on public.entity_metrics (last_seen desc);

-- ── companies: compatibility view over the company subset (security invoker) ─
create or replace view public.companies
  with (security_invoker = true) as
  select
    e.id, e.slug, e.canonical_name, e.normalized_name,
    e.description, e.website, e.logo_url, e.is_ai as is_ai_company,
    e.first_seen, e.last_seen, e.created_at, e.updated_at
  from public.entities e
  where e.type = 'company';

-- ── upsert_entity: match-or-create by (type, normalized name / alias) ────────
-- Service role only. Merges aliases, promotes is_ai, refreshes last_seen.
create or replace function public.upsert_entity(
  p_name        text,
  p_type        text    default 'company',
  p_aliases     text[]  default '{}',
  p_is_ai       boolean default true,
  p_website     text    default null,
  p_description text    default null
) returns uuid
language plpgsql
as $$
declare
  v_norm text := public.normalize_entity_name(p_name);
  v_type text := coalesce(nullif(p_type, ''), 'company');
  v_id   uuid;
  v_slug text;
begin
  if v_norm = '' then return null; end if;

  -- Match on canonical normalized name for this type, else any alias for this type.
  select e.id into v_id
    from public.entities e
   where e.type = v_type and e.normalized_name = v_norm
   limit 1;

  if v_id is null then
    select ea.entity_id into v_id
      from public.entity_aliases ea
      join public.entities e on e.id = ea.entity_id
     where e.type = v_type and ea.normalized_alias = v_norm
     limit 1;
  end if;

  if v_id is not null then
    update public.entities set
      is_ai       = is_ai or p_is_ai,
      website     = coalesce(website, p_website),
      description = coalesce(description, p_description),
      last_seen   = now(),
      updated_at  = now()
    where id = v_id;
  else
    v_slug := btrim(regexp_replace(lower(p_name), '[^a-z0-9]+', '-', 'g'), '-');
    if v_slug = '' then v_slug := v_norm; end if;
    if exists (select 1 from public.entities where slug = v_slug) then v_slug := v_slug || '-' || v_type; end if;
    if exists (select 1 from public.entities where slug = v_slug) then v_slug := v_slug || '-' || substr(md5(random()::text), 1, 6); end if;

    insert into public.entities (type, slug, canonical_name, normalized_name, is_ai, website, description)
    values (v_type, v_slug, p_name, v_norm, p_is_ai, p_website, p_description)
    returning id into v_id;

    insert into public.entity_metrics (entity_id, first_seen, last_seen)
    values (v_id, now(), now())
    on conflict (entity_id) do nothing;
  end if;

  -- Register canonical name + supplied aliases (dedup via unique constraint).
  insert into public.entity_aliases (entity_id, alias, normalized_alias)
  select v_id, x, public.normalize_entity_name(x)
    from unnest(array[p_name] || coalesce(p_aliases, '{}')) as x
   where public.normalize_entity_name(x) <> ''
  on conflict (entity_id, normalized_alias) do nothing;

  return v_id;
end;
$$;

-- ── link_article_entities: batch upsert entities + article links ─────────────
-- p_entities: jsonb array of {name,type,aliases?,is_ai?,confidence?,mention_type?}
create or replace function public.link_article_entities(p_article_id text, p_entities jsonb)
returns integer
language plpgsql
as $$
declare
  rec     jsonb;
  v_id    uuid;
  v_count int := 0;
begin
  for rec in select elem from jsonb_array_elements(coalesce(p_entities, '[]'::jsonb)) as t(elem) loop
    v_id := public.upsert_entity(
      rec->>'name',
      coalesce(nullif(rec->>'type', ''), 'company'),
      coalesce((select array(select jsonb_array_elements_text(rec->'aliases'))), '{}'),
      coalesce((rec->>'is_ai')::boolean, true)
    );
    if v_id is null then continue; end if;

    insert into public.entity_article_links (entity_id, article_id, mention_type, confidence)
    values (v_id, p_article_id, rec->>'mention_type', coalesce((rec->>'confidence')::real, 1.0))
    on conflict (entity_id, article_id) do update set
      confidence   = greatest(public.entity_article_links.confidence, excluded.confidence),
      mention_type = coalesce(excluded.mention_type, public.entity_article_links.mention_type);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- ── refresh_entity_metrics: recompute rollups from links + content_archive ────
create or replace function public.refresh_entity_metrics()
returns void
language sql
as $$
  insert into public.entity_metrics as m
    (entity_id, news_count, news_count_7d, news_count_30d,
     first_seen, last_seen, avg_signal_score, trending_score, momentum_score, updated_at)
  select
    l.entity_id,
    count(*)::int,
    count(*) filter (where a.published_at > now() - interval '7 days')::int,
    count(*) filter (where a.published_at > now() - interval '30 days')::int,
    min(a.published_at),
    max(a.published_at),
    coalesce(avg(coalesce(a.editorial_score, a.quality_score, 0)), 0),
    coalesce(sum(exp(-extract(epoch from (now() - a.published_at)) / 86400.0 / 14.0)
                 * (1 + coalesce(a.editorial_score, a.quality_score, 0) / 100.0)), 0),
    (count(*) filter (where a.published_at > now() - interval '7 days')
      - count(*) filter (where a.published_at <= now() - interval '7 days'
                           and a.published_at > now() - interval '14 days'))::real,
    now()
  from public.entity_article_links l
  join public.content_archive a on a.id = l.article_id and a.archive_status = 'active'
  group by l.entity_id
  on conflict (entity_id) do update set
    news_count       = excluded.news_count,
    news_count_7d    = excluded.news_count_7d,
    news_count_30d   = excluded.news_count_30d,
    first_seen       = least(m.first_seen, excluded.first_seen),
    last_seen        = excluded.last_seen,
    avg_signal_score = excluded.avg_signal_score,
    trending_score   = excluded.trending_score,
    momentum_score   = excluded.momentum_score,
    updated_at       = now();
$$;

-- ── signal_search (rebuilt) — FTS + trigram + ENTITY-LINK over CONTENT_ARCHIVE
-- Same signature (search/index.ts unchanged) BUT sources the permanent archive,
-- not the curated feed. Articles linked to ANY entity (company, model, product,
-- person, framework, …) whose canonical name or alias matches the query are
-- surfaced and boosted — resolving "Cursor", "cursor ai", "Deep Seek",
-- "Git Hub", "GPT-5", "Sam Altman" over the WHOLE archive. Editorial columns
-- feed_items had (why_it_matters/tag/content_category) map to archive fields.
create or replace function public.signal_search(q_ts text, q_raw text, max_results int default 30)
returns table (
  id text, title text, summary text, why_it_matters text, url text, tag text,
  source text, source_label text, category text, content_category text,
  score int, published_at timestamptz, trend_entities text[], rank real
)
language sql stable
as $$
  with q as (
    select
      nullif(trim(q_ts), '')             as ts_raw,
      lower(coalesce(q_raw, ''))          as raw,
      public.normalize_entity_name(q_raw)  as norm
  ),
  tsq as (
    select case when (select ts_raw from q) is null then null
                else to_tsquery('english', (select ts_raw from q)) end as query
  ),
  entity_hits as (
    select distinct l.article_id
    from public.entity_article_links l
    join public.entities e on e.id = l.entity_id
    where (select norm from q) <> '' and (
          e.normalized_name = (select norm from q)
       or e.normalized_name % (select norm from q)
       or exists (select 1 from public.entity_aliases ea
                   where ea.entity_id = e.id
                     and ea.normalized_alias = (select norm from q))
    )
  )
  select
    a.id, a.title, a.summary,
    null::text as why_it_matters,
    a.url,
    null::text as tag,
    a.source, a.source_label,
    a.original_category as category,
    null::text as content_category,
    coalesce(a.editorial_score, a.quality_score, 0) as score,
    a.published_at,
    array(select e.canonical_name
            from public.entity_article_links l
            join public.entities e on e.id = l.entity_id
           where l.article_id = a.id
           order by l.confidence desc
           limit 8) as trend_entities,
    (
      coalesce(ts_rank_cd(a.search_tsv, (select query from tsq)), 0) * 100
      + greatest(similarity(lower(a.title), (select raw from q)),
                 similarity(lower(coalesce(a.source, '')), (select raw from q))) * 40
      + case when a.id in (select article_id from entity_hits) then 60 else 0 end
      + 20 * exp(- extract(epoch from (now() - a.published_at)) / 86400.0 / 21.0)
      + coalesce(a.editorial_score, a.quality_score, 0) * 0.08
    )::real as rank
  from public.content_archive a, tsq
  where a.archive_status = 'active' and (
    (tsq.query is not null and a.search_tsv @@ tsq.query)
    or a.title        ilike '%' || (select raw from q) || '%'
    or a.source       ilike '%' || (select raw from q) || '%'
    or a.summary      ilike '%' || (select raw from q) || '%'
    or a.full_content ilike '%' || (select raw from q) || '%'
    or a.id in (select article_id from entity_hits)
    or ((select raw from q) <> '' and (
         similarity(lower(a.title), (select raw from q)) > 0.15
      or similarity(lower(coalesce(a.source, '')), (select raw from q)) > 0.25
    ))
  )
  order by rank desc
  limit greatest(1, max_results);
$$;

-- ── entity_suggest (P11) — prefix + fuzzy autocomplete across all types ──────
create or replace function public.entity_suggest(
  p_prefix text, p_types text[] default null, max_results int default 8
)
returns table (id uuid, slug text, type text, canonical_name text, logo_url text, news_count int, sim real)
language sql stable
as $$
  with p as (
    select lower(btrim(coalesce(p_prefix, ''))) as raw,
           public.normalize_entity_name(p_prefix) as norm
  )
  select
    e.id, e.slug, e.type, e.canonical_name, e.logo_url,
    coalesce(m.news_count, 0) as news_count,
    greatest(
      similarity(e.normalized_name, (select norm from p)),
      coalesce((select max(similarity(ea.normalized_alias, (select norm from p)))
                from public.entity_aliases ea where ea.entity_id = e.id), 0)
    )::real as sim
  from public.entities e
  left join public.entity_metrics m on m.entity_id = e.id
  where (select norm from p) <> '' and e.is_ai
    and (p_types is null or e.type = any (p_types))
    and (
      e.normalized_name like (select norm from p) || '%'
      or exists (select 1 from public.entity_aliases ea
                  where ea.entity_id = e.id
                    and ea.normalized_alias like (select norm from p) || '%')
      or e.normalized_name % (select norm from p)
    )
  order by
    (e.normalized_name like (select norm from p) || '%') desc,
    sim desc,
    news_count desc
  limit greatest(1, max_results);
$$;

-- ── Home leaderboards (P7) — dynamic, type-filterable ────────────────────────
create or replace function public.trending_entities(p_type text default null, max_results int default 12)
returns table (id uuid, slug text, type text, canonical_name text, logo_url text,
               news_count int, news_count_7d int, trending_score real, momentum_score real, last_seen timestamptz)
language sql stable as $$
  select e.id, e.slug, e.type, e.canonical_name, e.logo_url,
         m.news_count, m.news_count_7d, m.trending_score, m.momentum_score, m.last_seen
  from public.entity_metrics m
  join public.entities e on e.id = m.entity_id
  where e.is_ai and m.news_count > 0 and (p_type is null or e.type = p_type)
  order by m.trending_score desc, m.last_seen desc nulls last
  limit greatest(1, max_results);
$$;

create or replace function public.fastest_growing_entities(p_type text default null, max_results int default 12)
returns table (id uuid, slug text, type text, canonical_name text, logo_url text,
               news_count int, news_count_7d int, momentum_score real)
language sql stable as $$
  select e.id, e.slug, e.type, e.canonical_name, e.logo_url, m.news_count, m.news_count_7d, m.momentum_score
  from public.entity_metrics m
  join public.entities e on e.id = m.entity_id
  where e.is_ai and m.momentum_score > 0 and (p_type is null or e.type = p_type)
  order by m.momentum_score desc, m.news_count_7d desc
  limit greatest(1, max_results);
$$;

create or replace function public.most_mentioned_entities(p_type text default null, max_results int default 12)
returns table (id uuid, slug text, type text, canonical_name text, logo_url text,
               news_count int, avg_signal_score real)
language sql stable as $$
  select e.id, e.slug, e.type, e.canonical_name, e.logo_url, m.news_count, m.avg_signal_score
  from public.entity_metrics m
  join public.entities e on e.id = m.entity_id
  where e.is_ai and m.news_count > 0 and (p_type is null or e.type = p_type)
  order by m.news_count desc, m.avg_signal_score desc
  limit greatest(1, max_results);
$$;

create or replace function public.newest_entities(p_type text default null, max_results int default 12)
returns table (id uuid, slug text, type text, canonical_name text, logo_url text, news_count int, created_at timestamptz)
language sql stable as $$
  select e.id, e.slug, e.type, e.canonical_name, e.logo_url, coalesce(m.news_count, 0), e.created_at
  from public.entities e
  left join public.entity_metrics m on m.entity_id = e.id
  where e.is_ai and (p_type is null or e.type = p_type)
  order by e.created_at desc
  limit greatest(1, max_results);
$$;

-- ── RLS: public read; writes only via pipeline service role ──────────────────
alter table public.entities             enable row level security;
alter table public.entity_aliases       enable row level security;
alter table public.entity_relationships enable row level security;
alter table public.entity_metrics        enable row level security;
alter table public.entity_article_links  enable row level security;

drop policy if exists entities_read on public.entities;
create policy entities_read on public.entities for select to anon, authenticated using (true);
drop policy if exists ealias_read on public.entity_aliases;
create policy ealias_read on public.entity_aliases for select to anon, authenticated using (true);
drop policy if exists erel_read on public.entity_relationships;
create policy erel_read on public.entity_relationships for select to anon, authenticated using (true);
drop policy if exists emetrics_read on public.entity_metrics;
create policy emetrics_read on public.entity_metrics for select to anon, authenticated using (true);
drop policy if exists eal_read on public.entity_article_links;
create policy eal_read on public.entity_article_links for select to anon, authenticated using (true);

-- ── Grants ───────────────────────────────────────────────────────────────────
grant select on public.companies to anon, authenticated;

grant execute on function public.normalize_entity_name(text)                        to anon, authenticated, service_role;
grant execute on function public.signal_search(text, text, int)                     to anon, authenticated;
grant execute on function public.entity_suggest(text, text[], int)                  to anon, authenticated;
grant execute on function public.trending_entities(text, int)                       to anon, authenticated;
grant execute on function public.fastest_growing_entities(text, int)                to anon, authenticated;
grant execute on function public.most_mentioned_entities(text, int)                 to anon, authenticated;
grant execute on function public.newest_entities(text, int)                         to anon, authenticated;

revoke execute on function public.upsert_entity(text, text, text[], boolean, text, text) from public;
revoke execute on function public.link_article_entities(text, jsonb)                from public;
revoke execute on function public.refresh_entity_metrics()                          from public;
grant  execute on function public.upsert_entity(text, text, text[], boolean, text, text) to service_role;
grant  execute on function public.link_article_entities(text, jsonb)                to service_role;
grant  execute on function public.refresh_entity_metrics()                          to service_role;
