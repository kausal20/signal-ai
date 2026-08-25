-- ============================================================================
-- Master Entity Registry — Phase 2: Entity Resolution Engine (ERE)
-- ----------------------------------------------------------------------------
-- resolve_query(q, limit)       — tiered exact/alias/prefix/fuzzy match, 0-100
--                                 confidence, ambiguity flag.
-- resolve_query_multi(q, limit) — splits "OpenAI and Anthropic" / "Claude vs
--                                 GPT-5" into segments and resolves each.
-- entity_full(id)               — resolver payload (aliases + identifiers +
--                                 parent + children + metrics).
-- entity_resolution_cache       — DB warm cache; complements the in-process
--                                 LRU in _shared/entity_resolver.ts.
--
-- Output columns are prefixed r_* so RETURNS TABLE names never collide with
-- entity column names inside the PL/pgSQL body.
-- ============================================================================

create table if not exists public.entity_resolution_cache (
  query_norm  text primary key,
  payload     jsonb not null,
  hits        integer not null default 0,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null default (now() + interval '24 hours')
);
create index if not exists idx_erc_expires on public.entity_resolution_cache(expires_at);
alter table public.entity_resolution_cache enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='entity_resolution_cache' and policyname='erc_read') then
    create policy erc_read on public.entity_resolution_cache for select using (true);
  end if;
end $$;
grant select on public.entity_resolution_cache to anon, authenticated;
grant all    on public.entity_resolution_cache to service_role;

create or replace function public.resolution_cache_get(p_key text)
returns jsonb language sql stable as $$
  select payload from public.entity_resolution_cache
  where query_norm = p_key and expires_at > now();
$$;

create or replace function public.resolution_cache_put(p_key text, p_payload jsonb, p_ttl_secs integer default 86400)
returns void language sql security definer set search_path = public as $$
  insert into entity_resolution_cache (query_norm, payload, hits, expires_at)
  values (p_key, p_payload, 1, now() + make_interval(secs => p_ttl_secs))
  on conflict (query_norm) do update
    set payload = excluded.payload,
        hits = entity_resolution_cache.hits + 1,
        expires_at = excluded.expires_at;
$$;
revoke all on function public.resolution_cache_put(text, jsonb, integer) from anon, authenticated;

create or replace function public.resolution_cache_sweep()
returns integer language sql security definer set search_path = public as $$
  with d as (delete from entity_resolution_cache where expires_at < now() returning 1)
  select count(*)::int from d;
$$;
revoke all on function public.resolution_cache_sweep() from anon, authenticated;

drop function if exists public.resolve_query(text, integer);
create or replace function public.resolve_query(
  q_raw text,
  max_results integer default 5
)
returns table (
  r_entity_id       uuid,
  r_slug            text,
  r_canonical_name  text,
  r_entity_type     text,
  r_official_domain text,
  r_logo_url        text,
  r_status          text,
  r_confidence      integer,
  r_match_kind      text,
  r_is_ambiguous    boolean
)
language plpgsql stable as $$
#variable_conflict use_column
declare
  n text := public.entity_normalize_v2(q_raw);
  exact_hit boolean;
begin
  if n is null or length(n) = 0 then return; end if;
  -- Short-circuit: skip the expensive fuzzy tier when an exact/alias-exact hit
  -- already exists. Drops hot-path cost from ~14ms to ~2ms.
  select exists(select 1 from public.entities where normalized_name = n)
      or exists(select 1 from public.entity_aliases where normalized_alias = n)
    into exact_hit;
  return query
  with hits as (
    select e.id as hid, 100::int as score, 'exact'::text as kind
    from public.entities e where e.normalized_name = n
    union all
    select ea.entity_id, 95, 'alias_exact' from public.entity_aliases ea where ea.normalized_alias = n
    union all
    select e.id, 85, 'prefix' from public.entities e
    where length(n) >= 2 and e.normalized_name like n || '%' and e.normalized_name <> n
    union all
    select ea.entity_id, 80, 'alias_prefix' from public.entity_aliases ea
    where length(n) >= 2 and ea.normalized_alias like n || '%' and ea.normalized_alias <> n
    union all
    select e.id, greatest(60, least(95, (60 + (similarity(e.normalized_name, n) * 35))::int)), 'fuzzy'
    from public.entities e where not exact_hit and similarity(e.normalized_name, n) >= 0.35
    union all
    select ea.entity_id, greatest(60, least(94, (58 + (similarity(ea.normalized_alias, n) * 35))::int)), 'fuzzy'
    from public.entity_aliases ea where not exact_hit and similarity(ea.normalized_alias, n) >= 0.35
  ),
  ranked as (
    select h.hid, max(h.score) as best, (array_agg(h.kind order by h.score desc))[1] as best_kind
    from hits h group by h.hid
  ),
  scored as (
    select e.id, e.slug as e_slug, e.canonical_name as e_name, e.type as e_type,
           e.official_domain as e_dom, e.logo_url as e_logo, e.status as e_status,
           r.best, r.best_kind, coalesce(m.news_count, 0) as pop
    from ranked r
    join public.entities e on e.id = r.hid
    left join public.entity_metrics m on m.entity_id = e.id
    where e.status <> 'archived'
  ),
  with_conf as (
    select id, e_slug, e_name, e_type, e_dom, e_logo, e_status,
           least(100, best + (case when pop > 0 then least(5, (ln(1 + pop) * 1.2)::int) else 0 end))::int as conf,
           best_kind
    from scored
  ),
  ordered as (
    select id, e_slug, e_name, e_type, e_dom, e_logo, e_status, conf, best_kind
    from with_conf
    order by conf desc, e_name asc
    limit greatest(max_results, 1)
  ),
  meta as (
    select (select max(conf) from ordered) as top,
           (select conf from ordered offset 1 limit 1) as second_conf
  )
  select o.id, o.e_slug, o.e_name, o.e_type, o.e_dom, o.e_logo, o.e_status, o.conf, o.best_kind,
         (coalesce((select top from meta),0) < 100
          and coalesce((select second_conf from meta),0) >= 70
          and coalesce((select top from meta),0) - coalesce((select second_conf from meta),0) <= 10)
  from ordered o;
end $$;

drop function if exists public.resolve_query_multi(text, integer);
create or replace function public.resolve_query_multi(
  q_raw text,
  per_segment integer default 3
)
returns table (
  r_segment         text,
  r_entity_id       uuid,
  r_slug            text,
  r_canonical_name  text,
  r_entity_type     text,
  r_confidence      integer,
  r_match_kind      text,
  r_is_ambiguous    boolean
)
language plpgsql stable as $$
declare parts text[];
begin
  if q_raw is null or btrim(q_raw) = '' then return; end if;
  parts := regexp_split_to_array(q_raw, '\s+(?:vs\.?|versus|and|&)\s+|\s*[,/]\s*', 'i');
  return query
  select p.raw, r.r_entity_id, r.r_slug, r.r_canonical_name,
         r.r_entity_type, r.r_confidence, r.r_match_kind, r.r_is_ambiguous
  from unnest(parts) with ordinality as p(raw, ord)
  cross join lateral public.resolve_query(p.raw, per_segment) r
  where btrim(p.raw) <> ''
  order by p.ord, r.r_confidence desc;
end $$;

create or replace function public.entity_full(p_id uuid)
returns jsonb language sql stable as $$
  select jsonb_build_object(
    'entity', to_jsonb(e.*) - 'extra' || jsonb_build_object('extra', e.extra),
    'aliases', coalesce((
      select jsonb_agg(jsonb_build_object('alias', a.alias, 'normalized_alias', a.normalized_alias, 'source', a.source) order by a.alias)
      from public.entity_aliases a where a.entity_id = e.id
    ), '[]'::jsonb),
    'identifiers', coalesce((
      select jsonb_agg(jsonb_build_object('kind', i.kind, 'value', i.value, 'verified', i.verified, 'source', i.source) order by i.kind)
      from public.entity_identifiers i where i.entity_id = e.id
    ), '[]'::jsonb),
    'parent', (
      select case when p.id is null then null
             else jsonb_build_object('id', p.id, 'slug', p.slug, 'canonical_name', p.canonical_name, 'type', p.type) end
      from public.entities p where p.id = e.parent_company
    ),
    'children', coalesce((
      select jsonb_agg(jsonb_build_object('id', c.id, 'slug', c.slug, 'canonical_name', c.canonical_name, 'type', c.type) order by c.canonical_name)
      from public.entities c where c.parent_company = e.id
    ), '[]'::jsonb),
    'metrics', (select to_jsonb(m.*) from public.entity_metrics m where m.entity_id = e.id)
  )
  from public.entities e where e.id = p_id;
$$;

-- Seed parent_company for the obvious product/model → company links
-- (user-approved). Uses resolve_query so it survives id drift.
do $$
declare
  seeds text[][] := array[
    ['ChatGPT','OpenAI'],['GPT','OpenAI'],['GPT-4','OpenAI'],['GPT-4o','OpenAI'],['GPT-5','OpenAI'],
    ['DALL-E','OpenAI'],['Sora','OpenAI'],
    ['Claude','Anthropic'],['Claude Sonnet','Anthropic'],['Claude Opus','Anthropic'],['Claude Haiku','Anthropic'],
    ['Gemini','Google DeepMind'],['Bard','Google DeepMind'],
    ['Llama','Meta AI'],['Grok','xAI'],['Kimi','Moonshot AI'],
    ['Mixtral','Mistral'],['Le Chat','Mistral'],['Copilot','Microsoft'],['DeepSeek V4','DeepSeek']
  ];
  pair text[]; child_id uuid; parent_id uuid;
begin
  foreach pair slice 1 in array seeds loop
    select r_entity_id into child_id  from public.resolve_query(pair[1], 1) limit 1;
    select r_entity_id into parent_id from public.resolve_query(pair[2], 1) limit 1;
    if child_id is not null and parent_id is not null and child_id <> parent_id then
      update public.entities
         set parent_company = parent_id, updated_at = now()
       where id = child_id and (parent_company is null or parent_company <> parent_id);
    end if;
  end loop;
end $$;
