-- Clear false-positive official flags on third-party media + reclassify roundup titles.
-- ---------------------------------------------------------------------------
-- Media articles (is_official_source = false) must never carry
-- is_official_company_news = true — that flag was incorrectly gating the top
-- search section on v6 and caused roundups (e.g. National Law Review listing
-- Cursor, Lovable, Bolt.new) to appear as "Official Company News".
-- signal_search v7 (20260718280000) already sections by is_official_source;
-- this migration fixes existing archive rows immediately on deploy.
-- ---------------------------------------------------------------------------

update public.content_archive
set is_official_company_news = false
where is_official_company_news = true
  and coalesce(is_official_source, false) = false;

-- Re-type obvious multi-company roundup titles so they land in comparison section.
update public.content_archive
set content_type = 'comparison'
where content_type is distinct from 'comparison'
  and (
    title ~* '\m(fits?|sits?)[[:space:]]+among\M'
    or title ~* '\mwhere\M.+\m(fits|among)\M'
    or title ~* '\mamong\M.{0,140}(,|\yand\y|&).{0,80}(,|\yand\y|&)'
  );
