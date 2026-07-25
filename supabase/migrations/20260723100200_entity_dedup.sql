-- ============================================================================
-- ENTITY INTELLIGENCE · Entity Resolution — merge duplicate entities
-- ----------------------------------------------------------------------------
-- Every entity must exist exactly once. Multiple rows share a normalized_name
-- (e.g. "openai" as both organization + company, "mistral" ×3). Collapse each
-- group into ONE canonical row and repoint all references. Canonical choice:
--   1. entity_type priority (company/lab/organization > framework > product > model)
--   2. has an official_domain
--   3. most article links
--   4. oldest (created_at)
-- Losers' names become aliases of the canonical so old links still resolve.
-- Guarded per-group so one bad group can't abort the whole migration.
-- ============================================================================

do $$
declare
  g record;
  keep uuid;
  loser uuid;
begin
  for g in
    select normalized_name
    from public.entities
    where normalized_name is not null and normalized_name <> ''
    group by normalized_name
    having count(*) > 1
  loop
    begin
      select e.id into keep
      from public.entities e
      left join (select entity_id, count(*) c from public.entity_article_links group by entity_id) l on l.entity_id = e.id
      where e.normalized_name = g.normalized_name
      order by
        (case lower(coalesce(e.type,''))
           when 'company' then 0 when 'lab' then 0 when 'research_lab' then 0 when 'organization' then 1
           when 'framework' then 2 when 'library' then 2 when 'api' then 2 when 'technology' then 3
           when 'product' then 4 when 'model' then 5 else 6 end),
        (e.official_domain is null),
        coalesce(l.c, 0) desc,
        e.created_at asc nulls last
      limit 1;

      if keep is null then continue; end if;

      for loser in
        select id from public.entities where normalized_name = g.normalized_name and id <> keep
      loop
        -- Repoint article links (dedupe against the composite PK).
        update public.entity_article_links x set entity_id = keep
          where x.entity_id = loser
            and not exists (select 1 from public.entity_article_links k where k.entity_id = keep and k.article_id = x.article_id);
        delete from public.entity_article_links where entity_id = loser;

        -- Repoint content_archive entity FKs.
        update public.content_archive set official_entity_id = keep where official_entity_id = loser;
        update public.content_archive set primary_entity_id  = keep where primary_entity_id  = loser;

        -- Repoint source_registry + entity_overviews (best-effort; ignore if the
        -- canonical already has a row).
        begin update public.source_registry set official_company_id = keep where official_company_id = loser; exception when others then null; end;
        begin
          update public.entity_overviews o set entity_id = keep
            where o.entity_id = loser and not exists (select 1 from public.entity_overviews k where k.entity_id = keep);
          delete from public.entity_overviews where entity_id = loser;
        exception when others then null; end;

        -- Carry aliases + the loser's own name/slug as aliases of the canonical.
        update public.entity_aliases a set entity_id = keep
          where a.entity_id = loser
            and not exists (select 1 from public.entity_aliases b where b.entity_id = keep and b.normalized_alias = a.normalized_alias);
        delete from public.entity_aliases where entity_id = loser;
        insert into public.entity_aliases (entity_id, alias, normalized_alias, source)
          select keep, e.canonical_name, e.normalized_name, 'merge'
          from public.entities e where e.id = loser
          on conflict (entity_id, normalized_alias) do nothing;

        -- Fold the loser's official_domain up if the canonical lacks one.
        update public.entities k
          set official_domain = lsr.official_domain, updated_at = now()
          from public.entities lsr
          where k.id = keep and lsr.id = loser
            and k.official_domain is null and lsr.official_domain is not null;

        delete from public.entities where id = loser;   -- cascades relationships/metrics
      end loop;
    exception when others then
      raise warning 'entity dedup skipped group % : %', g.normalized_name, sqlerrm;
    end;
  end loop;
end $$;
