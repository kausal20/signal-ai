-- Signal Analysis phased generation — fixes the "one long wait" UX.
-- The report is generated in two parallel phases so the first useful content
-- lands in ~2-3s instead of ~16s:
--   core → executive_summary + why_it_matters + relevance (+ related stories)
--   deep → market impact, technology breakdown, timeline, takeaways, companies
-- Each phase is cached independently, so a reopen is instant per phase.
-- ---------------------------------------------------------------------------

alter table public.signal_analysis add column if not exists phase text not null default 'full';

-- Cache key becomes (article_hash, phase).
alter table public.signal_analysis drop constraint if exists signal_analysis_article_hash_key;
create unique index if not exists idx_signal_analysis_hash_phase
  on public.signal_analysis (article_hash, phase);
