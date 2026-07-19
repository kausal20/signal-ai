-- Editorial Intelligence Layer — distinguishes genuine company EVENTS from
-- articles that merely have the company as the primary entity.
-- ---------------------------------------------------------------------------
-- A company being the primary subject is NOT sufficient for "Official Company
-- News". A crypto price-prediction, a stock-forecast SEO piece, a review, or an
-- opinion column can all be "primary + news" yet must never sit in the company
-- timeline. These columns encode the editorial judgement:
--   event_type                genuine event class (launch/funding/acquisition/…)
--                             or 'none' when the article reports no company event
--   editorial_quality_score   0-100 (junk/SEO/clickbait heavily penalized)
--   is_official_company_news   TRUE only for a genuine, on-topic company event
-- ---------------------------------------------------------------------------

alter table public.content_archive add column if not exists event_type              text;
alter table public.content_archive add column if not exists editorial_quality_score  integer;
alter table public.content_archive add column if not exists is_official_company_news boolean not null default false;

create index if not exists idx_archive_official on public.content_archive (is_official_company_news);
create index if not exists idx_archive_event    on public.content_archive (event_type);
