-- Phase 4B regression suite: official-source discovery reliability +
-- connector deduplication. Self-contained: synthetic zzo-prefixed rows only,
-- rolls back at the end. Safe to run against production.
--
-- Covers: the partial unique index blocking a duplicate ENABLED connector for
-- the same (entity_id, feed_url), a disabled duplicate never conflicting,
-- existing verified official_publishers rows being untouched by an unrelated
-- write, and idempotent re-upsert of the same connector never duplicating.

begin;

create temp table zz_probe (k text, v text) on commit drop;

insert into entities (type, slug, canonical_name, normalized_name, is_ai, official_domain)
values ('company','zzo-co','ZzOfficial Co', public.normalize_entity_name('ZzOfficial Co'), true, 'zzofficial.example');
insert into zz_probe select 'entity_id', id::text from entities where slug='zzo-co';

-- ── 1. Existing verified publisher survives an unrelated repeated write ────
insert into official_publishers (entity_id, domain, publisher_name, publisher_type, verified, priority)
select (select v::uuid from zz_probe where k='entity_id'), 'zzofficial.example', 'ZzOfficial Co', 'company', true, 100;
insert into zz_probe values ('publisher_verified_before', (select verified::text from official_publishers where domain='zzofficial.example'));

-- an unrelated docs-channel publisher write for the same entity must never
-- touch the existing company-domain row.
insert into official_publishers (entity_id, domain, publisher_name, publisher_type, verified, priority)
values ((select v::uuid from zz_probe where k='entity_id'), 'docs.zzofficial.example', 'ZzOfficial Co', 'docs', true, 85)
on conflict (domain) do nothing;
insert into zz_probe values ('publisher_verified_after', (select verified::text from official_publishers where domain='zzofficial.example'));
insert into zz_probe values ('publisher_row_count', (select count(*)::text from official_publishers where entity_id=(select v::uuid from zz_probe where k='entity_id')));

-- ── 2. First connector insert succeeds ──────────────────────────────────────
insert into source_connectors (source, source_label, source_kind, tier, source_weight, trust_score, rss_url, feed_url, connector_type, enabled, entity_id, discovered_by, confidence, publisher_domain)
values ('zzo_official_a', 'ZzOfficial Co (Official rss)', 'official', 'fast', 1.6, 100, 'https://zzofficial.example/rss.xml', 'https://zzofficial.example/rss.xml', 'rss', true, (select v::uuid from zz_probe where k='entity_id'), 'primary', 90, 'zzofficial.example');
insert into zz_probe values ('first_insert_ok', 'true');

-- ── 3. Idempotent re-upsert of the SAME connector (same source id) is safe ─
insert into source_connectors (source, source_label, source_kind, tier, source_weight, trust_score, rss_url, feed_url, connector_type, enabled, entity_id, discovered_by, confidence, publisher_domain)
values ('zzo_official_a', 'ZzOfficial Co (Official rss)', 'official', 'fast', 1.6, 100, 'https://zzofficial.example/rss.xml', 'https://zzofficial.example/rss.xml', 'rss', true, (select v::uuid from zz_probe where k='entity_id'), 'primary', 95, 'zzofficial.example')
on conflict (source) do update set confidence = excluded.confidence, updated_at = now();
insert into zz_probe values ('connector_count_after_reupsert', (select count(*)::text from source_connectors where entity_id=(select v::uuid from zz_probe where k='entity_id')));

-- ── 4. A SECOND enabled connector with the identical feed_url is rejected
--       by the partial unique index (the real duplicate-prevention guard) ──
do $$
begin
  insert into source_connectors (source, source_label, source_kind, tier, source_weight, trust_score, rss_url, feed_url, connector_type, enabled, entity_id, discovered_by, confidence, publisher_domain)
  values ('zzo_official_b_duplicate', 'ZzOfficial Co (Official blog)', 'official', 'fast', 1.6, 100, 'https://zzofficial.example/rss.xml', 'https://zzofficial.example/rss.xml', 'rss', true, (select v::uuid from zz_probe where k='entity_id'), 'fallback', 90, 'zzofficial.example');
  insert into zz_probe values ('duplicate_enabled_insert_rejected', 'false');
exception when unique_violation then
  insert into zz_probe values ('duplicate_enabled_insert_rejected', 'true');
end $$;

-- ── 5. A DISABLED connector with the identical feed_url is allowed
--       (matches the real cleanup: losers are disabled, not deleted) ──────
insert into source_connectors (source, source_label, source_kind, tier, source_weight, trust_score, rss_url, feed_url, connector_type, enabled, entity_id, discovered_by, confidence, publisher_domain)
values ('zzo_official_c_disabled_dup', 'ZzOfficial Co (Official blog, legacy)', 'official', 'fast', 1.6, 100, 'https://zzofficial.example/rss.xml', 'https://zzofficial.example/rss.xml', 'rss', false, (select v::uuid from zz_probe where k='entity_id'), 'fallback', 90, 'zzofficial.example');
insert into zz_probe values ('disabled_duplicate_insert_ok', 'true');
insert into zz_probe values ('total_connector_rows', (select count(*)::text from source_connectors where entity_id=(select v::uuid from zz_probe where k='entity_id')));
insert into zz_probe values ('enabled_connector_rows', (select count(*)::text from source_connectors where entity_id=(select v::uuid from zz_probe where k='entity_id') and enabled));

-- ── Assertions ───────────────────────────────────────────────────────────
do $$
declare g record;
begin
  select
    (select v from zz_probe where k='publisher_verified_before') as publisher_verified_before,
    (select v from zz_probe where k='publisher_verified_after') as publisher_verified_after,
    (select v from zz_probe where k='publisher_row_count') as publisher_row_count,
    (select v from zz_probe where k='connector_count_after_reupsert') as connector_count_after_reupsert,
    (select v from zz_probe where k='duplicate_enabled_insert_rejected') as duplicate_enabled_insert_rejected,
    (select v from zz_probe where k='disabled_duplicate_insert_ok') as disabled_duplicate_insert_ok,
    (select v from zz_probe where k='total_connector_rows') as total_connector_rows,
    (select v from zz_probe where k='enabled_connector_rows') as enabled_connector_rows
  into g;

  if g.publisher_verified_before <> 'true' then raise exception 'FAIL: fixture publisher not verified'; end if;
  if g.publisher_verified_after <> 'true' then raise exception 'FAIL: unrelated publisher write disturbed an existing verified row'; end if;
  if g.publisher_row_count <> '2' then raise exception 'FAIL: expected 2 publisher rows (company + docs), got %', g.publisher_row_count; end if;
  if g.connector_count_after_reupsert <> '1' then raise exception 'FAIL: idempotent re-upsert created a duplicate row (count=%)', g.connector_count_after_reupsert; end if;
  if g.duplicate_enabled_insert_rejected <> 'true' then raise exception 'FAIL: a second ENABLED connector with an identical feed_url was NOT rejected'; end if;
  if g.disabled_duplicate_insert_ok <> 'true' then raise exception 'FAIL: a disabled duplicate connector insert unexpectedly failed'; end if;
  if g.total_connector_rows <> '2' then raise exception 'FAIL: expected 2 total connector rows (1 enabled + 1 disabled dup), got %', g.total_connector_rows; end if;
  if g.enabled_connector_rows <> '1' then raise exception 'FAIL: expected exactly 1 enabled connector, got %', g.enabled_connector_rows; end if;

  raise notice 'PASS: all Phase 4B source-discovery regression checks passed';
end $$;

rollback;
