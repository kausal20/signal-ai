-- ============================================================================
-- Master Entity Registry (MER) — Phase 1
-- ----------------------------------------------------------------------------
-- EXTENDS the existing entity registry (entities / entity_aliases /
-- entity_relationships / entity_metrics) into the production Master Entity
-- Registry. Purely ADDITIVE: new columns (nullable / defaulted), a widened
-- type CHECK, a new entity_identifiers table, and new normalization / dedup /
-- merge functions. No table is dropped; no existing row is re-normalized here
-- (re-normalization + merges run under a separate reviewed dry-run).
-- ============================================================================

-- ── 1. entities: new first-class fields ─────────────────────────────────────
alter table public.entities add column if not exists short_description text;
alter table public.entities add column if not exists country          text;
alter table public.entities add column if not exists headquarters     text;
alter table public.entities add column if not exists founded_year     integer
  check (founded_year is null or (founded_year between 1800 and 2100));
alter table public.entities add column if not exists parent_company   uuid
  references public.entities(id) on delete set null;

-- Lifecycle status (distinct from is_ai / official_discovery_status).
alter table public.entities add column if not exists status text not null default 'active';
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'entities_status_check') then
    alter table public.entities add constraint entities_status_check
      check (status in ('active','acquired','merged','closed','deprecated','archived'));
  end if;
end $$;

-- ── 2. Widen the entity type vocabulary (16 → full MER set) ──────────────────
alter table public.entities drop constraint if exists entities_type_check;
alter table public.entities add constraint entities_type_check check (type in (
  -- existing
  'company','model','product','person','organization','lab','framework',
  'open_source','library','funding','acquisition','partnership','api',
  'hardware','ai_chip','topic',
  -- added for the MER spec
  'startup','tool','dataset','research_paper','technology','programming_language',
  'cloud_provider','database','event','conference','investor','investment',
  'feature','capability','research_lab','programming_library'
));

-- Indexes for the new lookup/filter columns.
create index if not exists idx_entities_status         on public.entities(status);
create index if not exists idx_entities_parent_company on public.entities(parent_company);

-- ── 3. entity_identifiers: structured external identifiers (many per entity) ─
create table if not exists public.entity_identifiers (
  id         uuid primary key default gen_random_uuid(),
  entity_id  uuid not null references public.entities(id) on delete cascade,
  kind       text not null check (kind in (
    'website','official_domain','wikipedia','crunchbase','github','huggingface',
    'linkedin','x','youtube','developer_docs','rss','newsroom','research',
    'api_docs','documentation','blog','changelog','press','status_page','discord','other'
  )),
  value      text not null,                       -- canonical URL or handle
  verified   boolean not null default false,
  source     text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, kind, value)
);
create index if not exists idx_entity_ident_entity    on public.entity_identifiers(entity_id);
create index if not exists idx_entity_ident_kind      on public.entity_identifiers(kind);
create index if not exists idx_entity_ident_value_trgm on public.entity_identifiers using gin (value gin_trgm_ops);

alter table public.entity_identifiers enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='entity_identifiers' and policyname='entity_identifiers_read') then
    create policy entity_identifiers_read on public.entity_identifiers for select using (true);
  end if;
end $$;
grant select on public.entity_identifiers to anon, authenticated;
grant all    on public.entity_identifiers to service_role;

-- Backfill identifiers from the existing official_* columns on entities.
insert into public.entity_identifiers (entity_id, kind, value, verified, source)
select e.id, k.kind, k.value, true, 'backfill'
from public.entities e
cross join lateral (values
  ('website',        e.website),
  ('official_domain',e.official_domain),
  ('github',         e.official_github_url),
  ('developer_docs', e.official_docs_url),
  ('rss',            e.official_rss_url),
  ('newsroom',       e.official_newsroom_url),
  ('press',          e.official_press_url),
  ('research',       e.official_research_url),
  ('changelog',      e.official_changelog_url),
  ('blog',           e.official_blog_url)
) as k(kind, value)
where k.value is not null and btrim(k.value) <> ''
on conflict (entity_id, kind, value) do nothing;

-- ── 4. Enhanced normalization (NEW function — existing normalize_entity_name
--       is left untouched so current resolution keeps working). Deterministic,
--       no extension dependency: lowercase, strip punctuation/hyphens/unicode,
--       collapse whitespace. Accent-FOLDING (é→e) is done in the TS normalizer
--       (_shared/entity_registry.ts, NFKD) which is authoritative for imports;
--       this SQL version is ASCII-lossy on accents by design (kept dependency-
--       free — no unaccent extension required). ─────────────────────────────
create or replace function public.entity_normalize_v2(raw text)
returns text language sql immutable as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(coalesce(raw,'')), '[^a-z0-9]+', ' ', 'g'),
      '\s+', ' ', 'g'
    ),
  '');
$$;

-- ── 5. Duplicate detection (report only; makes no changes) ───────────────────
-- Confidence blends trigram name similarity, shared official domain, same type.
create or replace function public.find_duplicate_entities(
  p_min_sim real default 0.55,
  max_results integer default 200
)
returns table (
  keeper_id uuid, keeper_name text,
  loser_id  uuid, loser_name  text,
  entity_type text, name_similarity real,
  shared_domain boolean, confidence real
)
language sql stable as $$
  with pairs as (
    select
      a.id as a_id, a.canonical_name a_name, a.type a_type,
      a.official_domain a_dom,
      (select count(*) from public.entity_article_links l where l.entity_id=a.id) a_links,
      b.id as b_id, b.canonical_name b_name,
      b.official_domain b_dom,
      (select count(*) from public.entity_article_links l where l.entity_id=b.id) b_links,
      similarity(a.normalized_name, b.normalized_name) as sim
    from public.entities a
    join public.entities b
      on a.type = b.type and a.id < b.id
    where similarity(a.normalized_name, b.normalized_name) >= p_min_sim
  )
  select
    case when a_links >= b_links then a_id else b_id end,
    case when a_links >= b_links then a_name else b_name end,
    case when a_links >= b_links then b_id else a_id end,
    case when a_links >= b_links then b_name else a_name end,
    a_type,
    sim,
    (a_dom is not null and a_dom = b_dom),
    least(1.0,
      0.6 * sim
      + case when a_dom is not null and a_dom = b_dom then 0.35 else 0 end
      + 0.05
    )
  from pairs
  order by 8 desc, 6 desc   -- confidence, then name_similarity (by column position)
  limit max_results;
$$;

-- ── 6. merge_entities(keeper, loser): repoint all references, alias the loser,
--       delete it. DESTRUCTIVE — built for the reviewed dedup pass; NOT called
--       by this migration. ──────────────────────────────────────────────────
create or replace function public.merge_entities(p_keeper uuid, p_loser uuid)
returns void language plpgsql security definer set search_path = public as $$
declare loser_name text; loser_norm text;
begin
  if p_keeper = p_loser then raise exception 'keeper and loser are the same entity'; end if;
  select canonical_name, normalized_name into loser_name, loser_norm from entities where id = p_loser;
  if loser_name is null then raise exception 'loser entity % not found', p_loser; end if;

  -- Loser's name + aliases become keeper aliases.
  insert into entity_aliases (entity_id, alias, normalized_alias, source)
  values (p_keeper, loser_name, loser_norm, 'merge')
  on conflict (entity_id, normalized_alias) do nothing;
  update entity_aliases set entity_id = p_keeper
  where entity_id = p_loser
    and normalized_alias not in (select normalized_alias from entity_aliases where entity_id = p_keeper);
  delete from entity_aliases where entity_id = p_loser;

  -- Repoint identifiers (dedup on conflict).
  update entity_identifiers set entity_id = p_keeper
  where entity_id = p_loser
    and not exists (
      select 1 from entity_identifiers k
      where k.entity_id = p_keeper and k.kind = entity_identifiers.kind and k.value = entity_identifiers.value
    );
  delete from entity_identifiers where entity_id = p_loser;

  -- Article links (unique per (article,entity) assumed) — repoint, drop dups.
  update entity_article_links set entity_id = p_keeper
  where entity_id = p_loser
    and not exists (
      select 1 from entity_article_links k
      where k.entity_id = p_keeper and k.article_id = entity_article_links.article_id
    );
  delete from entity_article_links where entity_id = p_loser;

  -- Relationships either side.
  update entity_relationships set from_entity = p_keeper where from_entity = p_loser
    and not exists (select 1 from entity_relationships k where k.from_entity=p_keeper and k.to_entity=entity_relationships.to_entity and k.type=entity_relationships.type);
  update entity_relationships set to_entity = p_keeper where to_entity = p_loser
    and not exists (select 1 from entity_relationships k where k.to_entity=p_keeper and k.from_entity=entity_relationships.from_entity and k.type=entity_relationships.type);
  delete from entity_relationships where from_entity = p_loser or to_entity = p_loser;

  -- Other references (best-effort; tables may or may not exist in all envs).
  update content_archive   set primary_entity_id  = p_keeper where primary_entity_id  = p_loser;
  update content_archive   set official_entity_id = p_keeper where official_entity_id = p_loser;
  update official_publishers set entity_id       = p_keeper where entity_id          = p_loser;
  update entity_overviews  set entity_id          = p_keeper where entity_id          = p_loser;
  update entities          set parent_company     = p_keeper where parent_company     = p_loser;

  delete from entity_metrics where entity_id = p_loser;
  delete from entities       where id = p_loser;   -- cascades any stragglers
end $$;
revoke all on function public.merge_entities(uuid, uuid) from anon, authenticated;

-- ── 7. set_identifier helper (upsert one identifier for an entity) ───────────
create or replace function public.set_entity_identifier(
  p_entity uuid, p_kind text, p_value text, p_verified boolean default false, p_source text default 'manual'
) returns void language sql security definer set search_path = public as $$
  insert into entity_identifiers (entity_id, kind, value, verified, source)
  values (p_entity, p_kind, p_value, p_verified, p_source)
  on conflict (entity_id, kind, value) do update
    set verified = excluded.verified or entity_identifiers.verified,
        updated_at = now();
$$;
revoke all on function public.set_entity_identifier(uuid,text,text,boolean,text) from anon, authenticated;

-- keep updated_at fresh on identifier writes
create or replace function public.touch_entity_identifier() returns trigger
language plpgsql as $$ begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_touch_entity_identifier on public.entity_identifiers;
create trigger trg_touch_entity_identifier before update on public.entity_identifiers
  for each row execute function public.touch_entity_identifier();
