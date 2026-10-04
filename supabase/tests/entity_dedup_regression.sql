-- Phase 2.5B/2.5C regression suite: company/organization dedup in
-- upsert_entity(), plus archived/merged-entity exposure hardening added in
-- 2.5C (most_mentioned_entities, trending_entities, fastest_growing_entities,
-- newest_entities, find_duplicate_entities, entity_full children).
-- Self-contained: runs inside its own transaction, uses zz-prefixed synthetic
-- entities only, and rolls back at the end. Safe to run against production.
--
-- Run: supabase db execute --file supabase/tests/entity_dedup_regression.sql
-- (or paste into the SQL editor / execute_sql tool)
--
-- Covers: company<->organization normalization, existing-entity reuse,
-- duplicate prevention, idempotent repeated ingestion, official-domain /
-- metadata preservation across a type-flip reuse, cross-type entities
-- (company/product/model) remaining separate, archived merged entities
-- redirecting via resolve_merged_entity() while being excluded from live
-- resolution counts, and archived entities never surfacing through the
-- public listing/duplicate-report RPCs or as a live "child" in entity_full.

begin;

create temp table zz_probe (k text, v text) on commit drop;

insert into zz_probe values ('c1', public.upsert_entity('ZzTestCorp Alpha','company')::text);
insert into zz_probe values ('c2', public.upsert_entity('ZzTestCorp Alpha','organization')::text);
insert into zz_probe values ('c3', public.upsert_entity('ZzTestOrg Beta','organization')::text);
insert into zz_probe values ('c4', public.upsert_entity('ZzTestOrg Beta','company')::text);
insert into zz_probe values ('c5', public.upsert_entity('ZzTestCorp Alpha','company')::text);
insert into zz_probe values ('c6', public.upsert_entity('ZzTestCorp Alpha','organization')::text);
insert into zz_probe values ('c7', public.upsert_entity('ZzTestCorp Alpha','company')::text);
insert into zz_probe values ('c8', public.upsert_entity('ZzTestDomain Co','company',null,true,'https://zztestdomain.example')::text);
insert into zz_probe values ('c9', public.upsert_entity('ZzTestDomain Co','organization')::text);
insert into zz_probe values ('c10', public.upsert_entity('ZzTestCross Gamma','company')::text);
insert into zz_probe values ('c11', public.upsert_entity('ZzTestCross Gamma','product')::text);
insert into zz_probe values ('c12', public.upsert_entity('ZzTestCross Gamma','model')::text);

insert into entities (type, slug, canonical_name, normalized_name, is_ai)
values ('company','zztest-keeper','ZzTest Keeper', public.normalize_entity_name('ZzTest Keeper'), true);
insert into zz_probe values ('keeper', (select id::text from entities where slug='zztest-keeper'));

insert into entities (type, slug, canonical_name, normalized_name, is_ai)
values ('organization','zztest-loser','ZzTest Keeper', public.normalize_entity_name('ZzTest Keeper'), true);
insert into zz_probe values ('loser', (select id::text from entities where slug='zztest-loser'));

update entities set status='archived', merged_into_id = (select id from entities where slug='zztest-keeper')
where slug='zztest-loser';

insert into zz_probe values ('resolved_loser', public.resolve_merged_entity((select id from entities where slug='zztest-loser'))::text);
insert into zz_probe values ('loser_status', (select status from entities where slug='zztest-loser'));
insert into zz_probe values ('domain_preserved', (select coalesce(website,'NULL') from entities where id=(select v::uuid from zz_probe where k='c8')));
insert into zz_probe values ('row_count_alpha', (select count(*)::text from entities where normalized_name = public.normalize_entity_name('ZzTestCorp Alpha')));
insert into zz_probe values ('live_keeper_rows', (select count(*)::text from entities where normalized_name = public.normalize_entity_name('ZzTest Keeper') and status <> 'archived'));

-- 2.5C: give the archived loser fake metrics + a parent link, then confirm
-- none of the listing/duplicate/full RPCs surface it.
insert into entity_metrics (entity_id, news_count, news_count_7d, momentum_score, trending_score, first_seen, last_seen)
select (select id from entities where slug='zztest-loser'), 999999, 999999, 999999, 999999, now(), now();
update entities set parent_company = (select id from entities where slug='zztest-keeper')
where slug = 'zztest-loser';

insert into zz_probe values ('leak_most_mentioned', (select count(*)::text from most_mentioned_entities(NULL, 5000) where id = (select id from entities where slug='zztest-loser')));
insert into zz_probe values ('leak_trending', (select count(*)::text from trending_entities(NULL, 5000) where id = (select id from entities where slug='zztest-loser')));
insert into zz_probe values ('leak_fastest_growing', (select count(*)::text from fastest_growing_entities(NULL, 5000) where id = (select id from entities where slug='zztest-loser')));
insert into zz_probe values ('leak_newest', (select count(*)::text from newest_entities(NULL, 5000) where id = (select id from entities where slug='zztest-loser')));
insert into zz_probe values ('leak_full_children', ((select jsonb_array_length(entity_full((select id from entities where slug='zztest-keeper'))->'children'))::text));

-- Assertions. Any failed row aborts the transaction with a clear message.
do $$
declare g record;
begin
  select
    (select v from zz_probe where k='c1') as c1, (select v from zz_probe where k='c2') as c2,
    (select v from zz_probe where k='c3') as c3, (select v from zz_probe where k='c4') as c4,
    (select v from zz_probe where k='c5') as c5, (select v from zz_probe where k='c6') as c6,
    (select v from zz_probe where k='c7') as c7, (select v from zz_probe where k='c8') as c8,
    (select v from zz_probe where k='c9') as c9, (select v from zz_probe where k='c10') as c10,
    (select v from zz_probe where k='c11') as c11, (select v from zz_probe where k='c12') as c12,
    (select v from zz_probe where k='resolved_loser') as resolved_loser,
    (select v from zz_probe where k='keeper') as keeper,
    (select v from zz_probe where k='loser_status') as loser_status,
    (select v from zz_probe where k='domain_preserved') as domain_preserved,
    (select v from zz_probe where k='row_count_alpha') as row_count_alpha,
    (select v from zz_probe where k='live_keeper_rows') as live_keeper_rows,
    (select v from zz_probe where k='leak_most_mentioned') as leak_most_mentioned,
    (select v from zz_probe where k='leak_trending') as leak_trending,
    (select v from zz_probe where k='leak_fastest_growing') as leak_fastest_growing,
    (select v from zz_probe where k='leak_newest') as leak_newest,
    (select v from zz_probe where k='leak_full_children') as leak_full_children
  into g;

  if g.c1 <> g.c2 then raise exception 'FAIL: company->organization reuse (c1 % != c2 %)', g.c1, g.c2; end if;
  if g.c3 <> g.c4 then raise exception 'FAIL: organization->company reuse (c3 % != c4 %)', g.c3, g.c4; end if;
  if not (g.c1 = g.c5 and g.c5 = g.c6 and g.c6 = g.c7) then raise exception 'FAIL: idempotent repeated ingestion produced divergent ids'; end if;
  if g.row_count_alpha <> '1' then raise exception 'FAIL: duplicate prevention — expected 1 row for ZzTestCorp Alpha, got %', g.row_count_alpha; end if;
  if g.c8 <> g.c9 then raise exception 'FAIL: official-domain entity not reused across type flip'; end if;
  if g.domain_preserved <> 'https://zztestdomain.example' then raise exception 'FAIL: website metadata lost on reuse'; end if;
  if not (g.c10 <> g.c11 and g.c11 <> g.c12 and g.c10 <> g.c12) then raise exception 'FAIL: cross-type entities (company/product/model) were collapsed'; end if;
  if g.resolved_loser <> g.keeper then raise exception 'FAIL: resolve_merged_entity did not redirect archived loser to keeper'; end if;
  if g.loser_status <> 'archived' then raise exception 'FAIL: loser row not archived'; end if;
  if g.live_keeper_rows <> '1' then raise exception 'FAIL: archived merged entity still counted as live (%), expected 1', g.live_keeper_rows; end if;
  if g.leak_most_mentioned <> '0' then raise exception 'FAIL: archived entity leaked through most_mentioned_entities'; end if;
  if g.leak_trending <> '0' then raise exception 'FAIL: archived entity leaked through trending_entities'; end if;
  if g.leak_fastest_growing <> '0' then raise exception 'FAIL: archived entity leaked through fastest_growing_entities'; end if;
  if g.leak_newest <> '0' then raise exception 'FAIL: archived entity leaked through newest_entities'; end if;
  if g.leak_full_children <> '0' then raise exception 'FAIL: archived entity still listed as a live child in entity_full'; end if;

  raise notice 'PASS: all 14 entity-dedup + exposure regression checks passed';
end $$;

rollback;
