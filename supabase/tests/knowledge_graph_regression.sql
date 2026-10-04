-- Phase 3 regression suite: entity_relationships write/read infrastructure
-- (link_entity_relationship, entity_relations, entity_products_models,
-- entity_competitors, entity_partners, entity_acquisitions,
-- entity_graph_traverse). Self-contained: synthetic zz-prefixed entities
-- only, rolls back at the end. Safe to run against production.
--
-- Run: supabase db execute --file supabase/tests/knowledge_graph_regression.sql

begin;

create temp table zz_probe (k text, v text) on commit drop;

-- ── Fixtures ─────────────────────────────────────────────────────────────
insert into entities (type, slug, canonical_name, normalized_name, is_ai)
values
  ('company','zzg-co','ZzGraph Co', public.normalize_entity_name('ZzGraph Co'), true),
  ('company','zzg-partner','ZzGraph Partner', public.normalize_entity_name('ZzGraph Partner'), true),
  ('company','zzg-rival','ZzGraph Rival', public.normalize_entity_name('ZzGraph Rival'), true),
  ('company','zzg-acquired','ZzGraph Acquired', public.normalize_entity_name('ZzGraph Acquired'), true),
  ('product','zzg-product','ZzGraph Product', public.normalize_entity_name('ZzGraph Product'), true),
  ('model','zzg-model','ZzGraph Model', public.normalize_entity_name('ZzGraph Model'), true),
  ('framework','zzg-framework','ZzGraph Framework', public.normalize_entity_name('ZzGraph Framework'), true);

-- archived org merged into zzg-co, to exercise write-side resolve-to-keeper
insert into entities (type, slug, canonical_name, normalized_name, is_ai)
values ('organization','zzg-org-loser','ZzGraph Org Loser', public.normalize_entity_name('ZzGraph Org Loser'), true);
update entities set status='archived',
  merged_into_id = (select id from entities where slug='zzg-co')
where slug='zzg-org-loser';

-- archived entity with NO keeper (invariant violation, deliberately crafted
-- to prove the write-path guard rejects it defensively).
insert into entities (type, slug, canonical_name, normalized_name, is_ai)
values ('company','zzg-orphan-archived','ZzGraph Orphan Archived', public.normalize_entity_name('ZzGraph Orphan Archived'), true);
update entities set status='archived' where slug='zzg-orphan-archived';

insert into zz_probe select 'id_' || slug, id::text from entities where slug like 'zzg-%';

-- ── 1. Basic create + idempotency (upsert on re-call) ──────────────────────
insert into zz_probe values ('r1_owns', public.link_entity_relationship(
  (select id from entities where slug='zzg-co'),
  (select id from entities where slug='zzg-product'),
  'owns', 0.8, null, 'test')::text);
insert into zz_probe values ('r1_owns_again', public.link_entity_relationship(
  (select id from entities where slug='zzg-co'),
  (select id from entities where slug='zzg-product'),
  'owns', 0.9, null, 'test')::text);
insert into zz_probe values ('count_owns_rows', (select count(*)::text from entity_relationships
  where from_entity=(select id from entities where slug='zzg-co')
    and to_entity=(select id from entities where slug='zzg-product') and type='owns'));
insert into zz_probe values ('owns_confidence_after_update', (select confidence::text from entity_relationships
  where from_entity=(select id from entities where slug='zzg-co')
    and to_entity=(select id from entities where slug='zzg-product') and type='owns'));

-- develops (company -> model) and depends_on (product -> framework), for traversal
insert into zz_probe values ('r_develops', public.link_entity_relationship(
  (select id from entities where slug='zzg-co'),
  (select id from entities where slug='zzg-model'),
  'develops', 0.8, null, 'test')::text);
insert into zz_probe values ('r_depends_on', public.link_entity_relationship(
  (select id from entities where slug='zzg-product'),
  (select id from entities where slug='zzg-framework'),
  'depends_on', 0.8, null, 'test')::text);
-- cycle edge: model "related" back to co (direct 2-node cycle, independent
-- of product's later archival) -- proves traversal doesn't revisit the start.
insert into zz_probe values ('r_cycle', public.link_entity_relationship(
  (select id from entities where slug='zzg-model'),
  (select id from entities where slug='zzg-co'),
  'related', 0.5, null, 'test')::text);

-- ── 2. Self-reference rejected ──────────────────────────────────────────
do $$
begin
  perform public.link_entity_relationship(
    (select id from entities where slug='zzg-co'),
    (select id from entities where slug='zzg-co'),
    'owns', null, null, null);
  insert into zz_probe values ('self_ref_rejected', 'false');
exception when others then
  insert into zz_probe values ('self_ref_rejected', 'true');
end $$;

-- ── 3. Archived-with-no-keeper rejected on write ────────────────────────
do $$
begin
  perform public.link_entity_relationship(
    (select id from entities where slug='zzg-orphan-archived'),
    (select id from entities where slug='zzg-product'),
    'owns', null, null, null);
  insert into zz_probe values ('archived_no_keeper_rejected', 'false');
exception when others then
  insert into zz_probe values ('archived_no_keeper_rejected', 'true');
end $$;

-- ── 4. Nonexistent entity rejected on write (FK integrity) ─────────────
do $$
begin
  perform public.link_entity_relationship(
    '00000000-0000-0000-0000-000000000000'::uuid,
    (select id from entities where slug='zzg-product'),
    'owns', null, null, null);
  insert into zz_probe values ('nonexistent_from_rejected', 'false');
exception when others then
  insert into zz_probe values ('nonexistent_from_rejected', 'true');
end $$;

-- ── 5. Archived entity resolves to keeper on write (not the loser) ─────
insert into zz_probe values ('r_archived_org_owns', public.link_entity_relationship(
  (select id from entities where slug='zzg-org-loser'),
  (select id from entities where slug='zzg-model'),
  'develops', 0.7, null, 'test')::text);
insert into zz_probe values ('archived_write_redirected_to_keeper',
  ((select from_entity from entity_relationships where id = (select v::uuid from zz_probe where k='r_archived_org_owns'))
   = (select id from entities where slug='zzg-co'))::text);
-- and it collided with the existing co->model develops row (upsert, not a new row)
insert into zz_probe values ('count_develops_rows', (select count(*)::text from entity_relationships
  where from_entity=(select id from entities where slug='zzg-co')
    and to_entity=(select id from entities where slug='zzg-model') and type='develops'));

-- ── 6. Duplicate prevention at the constraint level (bypassing the RPC) ─
do $$
begin
  insert into entity_relationships (from_entity, to_entity, type)
  values (
    (select id from entities where slug='zzg-co'),
    (select id from entities where slug='zzg-product'),
    'owns');
  insert into zz_probe values ('raw_duplicate_insert_rejected', 'false');
exception when others then
  insert into zz_probe values ('raw_duplicate_insert_rejected', 'true');
end $$;

-- ── 7. Symmetric canonical ordering (partnership, competitor) ──────────
insert into zz_probe values ('r_partner_ab', public.link_entity_relationship(
  (select id from entities where slug='zzg-co'),
  (select id from entities where slug='zzg-partner'),
  'partnership', 0.8, null, 'test')::text);
insert into zz_probe values ('r_partner_ba', public.link_entity_relationship(
  (select id from entities where slug='zzg-partner'),
  (select id from entities where slug='zzg-co'),
  'partnership', 0.9, null, 'test')::text);
insert into zz_probe values ('count_partnership_rows', (select count(*)::text from entity_relationships
  where type='partnership'
    and from_entity in (select id from entities where slug in ('zzg-co','zzg-partner'))
    and to_entity in (select id from entities where slug in ('zzg-co','zzg-partner'))));

insert into zz_probe values ('r_rival_ab', public.link_entity_relationship(
  (select id from entities where slug='zzg-co'),
  (select id from entities where slug='zzg-rival'),
  'competitor', 0.6, null, 'test')::text);
insert into zz_probe values ('r_rival_ba', public.link_entity_relationship(
  (select id from entities where slug='zzg-rival'),
  (select id from entities where slug='zzg-co'),
  'competitor', 0.6, null, 'test')::text);
insert into zz_probe values ('count_competitor_rows', (select count(*)::text from entity_relationships
  where type='competitor'
    and from_entity in (select id from entities where slug in ('zzg-co','zzg-rival'))
    and to_entity in (select id from entities where slug in ('zzg-co','zzg-rival'))));

-- ── 8. Acquisition (directional) ────────────────────────────────────────
insert into zz_probe values ('r_acq', public.link_entity_relationship(
  (select id from entities where slug='zzg-co'),
  (select id from entities where slug='zzg-acquired'),
  'acquisition', 0.95, null, 'test')::text);

-- ── 9. Read-path sanity: entity_relations, entity_products_models,
--       entity_competitors, entity_partners, entity_acquisitions ────────
insert into zz_probe values ('relations_count', (select count(*)::text from entity_relations(
  (select id from entities where slug='zzg-co'))));
insert into zz_probe values ('products_models_count', (select count(*)::text from entity_products_models(
  (select id from entities where slug='zzg-co'))));
insert into zz_probe values ('competitors_count', (select count(*)::text from entity_competitors(
  (select id from entities where slug='zzg-co'))));
insert into zz_probe values ('partners_count', (select count(*)::text from entity_partners(
  (select id from entities where slug='zzg-co'))));
insert into zz_probe values ('acquisitions_count', (select count(*)::text from entity_acquisitions(
  (select id from entities where slug='zzg-co'))));

-- ── 10. Archived exclusion on READ (archive product after linking it) ──
update entities set status='archived',
  merged_into_id = (select id from entities where slug='zzg-co')
where slug='zzg-product';
insert into zz_probe values ('products_models_count_after_archive', (select count(*)::text from entity_products_models(
  (select id from entities where slug='zzg-co'))));
insert into zz_probe values ('relations_excludes_archived_product', (select count(*)::text from entity_relations(
  (select id from entities where slug='zzg-co')) where other_id = (select id from entities where slug='zzg-product')));

-- ── 11. Bounded, cycle-safe multi-hop traversal ─────────────────────────
-- (product is archived now, so traverse from co: hop1 should reach model,
-- partner, rival, acquired -- NOT product (archived); framework is 2 hops
-- away via product but product is archived so framework becomes unreachable
-- through that path -- confirms archived-node exclusion mid-traversal too.)
-- (two distinct edges connect co<->model here -- develops, and the cycle
-- "related" edge -- so model legitimately appears via 2 rows at hop 1;
-- assert reachability via distinct entity_id, not row count.)
insert into zz_probe values ('hop1_has_model', (select count(distinct entity_id)::text from entity_graph_traverse(
  (select id from entities where slug='zzg-co'), 2)
  where hop=1 and entity_id=(select id from entities where slug='zzg-model')));
insert into zz_probe values ('hop1_excludes_archived_product', (select count(*)::text from entity_graph_traverse(
  (select id from entities where slug='zzg-co'), 2)
  where entity_id=(select id from entities where slug='zzg-product')));
insert into zz_probe values ('traverse_no_self_revisit', (select count(*)::text from entity_graph_traverse(
  (select id from entities where slug='zzg-co'), 4)
  where entity_id=(select id from entities where slug='zzg-co')));
insert into zz_probe values ('traverse_max_hop_seen', (select coalesce(max(hop),0)::text from entity_graph_traverse(
  (select id from entities where slug='zzg-co'), 4)));

-- ── Assertions ───────────────────────────────────────────────────────────
do $$
declare g record;
begin
  select
    (select v from zz_probe where k='count_owns_rows') as count_owns_rows,
    (select v from zz_probe where k='owns_confidence_after_update') as owns_confidence_after_update,
    (select v from zz_probe where k='self_ref_rejected') as self_ref_rejected,
    (select v from zz_probe where k='archived_no_keeper_rejected') as archived_no_keeper_rejected,
    (select v from zz_probe where k='nonexistent_from_rejected') as nonexistent_from_rejected,
    (select v from zz_probe where k='archived_write_redirected_to_keeper') as archived_write_redirected_to_keeper,
    (select v from zz_probe where k='count_develops_rows') as count_develops_rows,
    (select v from zz_probe where k='raw_duplicate_insert_rejected') as raw_duplicate_insert_rejected,
    (select v from zz_probe where k='count_partnership_rows') as count_partnership_rows,
    (select v from zz_probe where k='count_competitor_rows') as count_competitor_rows,
    (select v from zz_probe where k='relations_count') as relations_count,
    (select v from zz_probe where k='products_models_count') as products_models_count,
    (select v from zz_probe where k='competitors_count') as competitors_count,
    (select v from zz_probe where k='partners_count') as partners_count,
    (select v from zz_probe where k='acquisitions_count') as acquisitions_count,
    (select v from zz_probe where k='products_models_count_after_archive') as products_models_count_after_archive,
    (select v from zz_probe where k='relations_excludes_archived_product') as relations_excludes_archived_product,
    (select v from zz_probe where k='hop1_has_model') as hop1_has_model,
    (select v from zz_probe where k='hop1_excludes_archived_product') as hop1_excludes_archived_product,
    (select v from zz_probe where k='traverse_no_self_revisit') as traverse_no_self_revisit,
    (select v from zz_probe where k='traverse_max_hop_seen') as traverse_max_hop_seen
  into g;

  if g.count_owns_rows <> '1' then raise exception 'FAIL: idempotent re-call created a duplicate row (count=%)', g.count_owns_rows; end if;
  if g.owns_confidence_after_update <> '0.9' then raise exception 'FAIL: upsert did not update confidence (got %)', g.owns_confidence_after_update; end if;
  if g.self_ref_rejected <> 'true' then raise exception 'FAIL: self-referential relationship was NOT rejected'; end if;
  if g.archived_no_keeper_rejected <> 'true' then raise exception 'FAIL: archived entity with no keeper was NOT rejected'; end if;
  if g.nonexistent_from_rejected <> 'true' then raise exception 'FAIL: nonexistent entity id was NOT rejected'; end if;
  if g.archived_write_redirected_to_keeper <> 'true' then raise exception 'FAIL: write via archived loser did not redirect to live keeper'; end if;
  if g.count_develops_rows <> '1' then raise exception 'FAIL: archived-redirect write created a duplicate develops row (count=%)', g.count_develops_rows; end if;
  if g.raw_duplicate_insert_rejected <> 'true' then raise exception 'FAIL: unique constraint did not reject a raw duplicate insert'; end if;
  if g.count_partnership_rows <> '1' then raise exception 'FAIL: symmetric partnership A->B and B->A produced % rows, expected 1', g.count_partnership_rows; end if;
  if g.count_competitor_rows <> '1' then raise exception 'FAIL: symmetric competitor A->B and B->A produced % rows, expected 1', g.count_competitor_rows; end if;
  if g.relations_count::int < 4 then raise exception 'FAIL: entity_relations returned too few rows (%)', g.relations_count; end if;
  if g.competitors_count <> '1' then raise exception 'FAIL: entity_competitors count wrong (%)', g.competitors_count; end if;
  if g.partners_count <> '1' then raise exception 'FAIL: entity_partners count wrong (%)', g.partners_count; end if;
  if g.acquisitions_count <> '1' then raise exception 'FAIL: entity_acquisitions count wrong (%)', g.acquisitions_count; end if;
  if g.products_models_count <> '2' then raise exception 'FAIL: entity_products_models count wrong before archive (%)', g.products_models_count; end if;
  if g.products_models_count_after_archive <> '1' then raise exception 'FAIL: archived product still counted in entity_products_models (%)', g.products_models_count_after_archive; end if;
  if g.relations_excludes_archived_product <> '0' then raise exception 'FAIL: entity_relations still surfaces archived product'; end if;
  if g.hop1_has_model <> '1' then raise exception 'FAIL: graph traversal did not reach model at hop 1'; end if;
  if g.hop1_excludes_archived_product <> '0' then raise exception 'FAIL: graph traversal surfaced an archived entity'; end if;
  if g.traverse_no_self_revisit <> '0' then raise exception 'FAIL: cyclic edge caused traversal to revisit the start entity'; end if;
  if g.traverse_max_hop_seen::int > 4 then raise exception 'FAIL: traversal exceeded the hard 4-hop cap (max hop=%)', g.traverse_max_hop_seen; end if;

  raise notice 'PASS: all Phase 3 knowledge-graph regression checks passed';
end $$;

rollback;
