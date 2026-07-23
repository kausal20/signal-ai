-- Official Source Discovery — self-maintaining. A cron crawls each AI entity's
-- own website to find its Blog / Newsroom / RSS / GitHub / Docs / Changelog /
-- Research / Press, stores them on the entity + source_registry, and auto-creates
-- an OFFICIAL connector so the existing ingestion pipeline monitors it. No manual
-- connector lists; any future company is discovered automatically.
-- ---------------------------------------------------------------------------

-- Cursor for the discovery cron (which entities still need crawling / recrawl).
alter table public.entities add column if not exists official_sources_checked_at timestamptz;
alter table public.entities add column if not exists official_discovery_status    text;   -- ok | partial | none | error

-- Cron picks unchecked first, then the stalest. Only AI companies are crawled.
create index if not exists idx_entities_discovery
  on public.entities (official_sources_checked_at nulls first)
  where is_ai and type = 'company';
