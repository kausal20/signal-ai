-- Normalize article source URLs across the pipeline (permanent single source of
-- truth = _shared/url.ts / src/lib/url.ts). Two goals:
--   1. Allow NULL so an unrecoverable link is stored as NULL, never a redirect
--      shell, empty string, "#", or malformed value.
--   2. Clean existing rows: recover the real link where possible, else NULL out
--      google-news redirects / Google CDN shells / non-http values.
-- Non-destructive: no rows are deleted; raw_items retains the raw fetched link
-- for debugging, and content_archive.original_url preserves the decoded link.

-- ── 1. Make the user-facing url columns nullable ─────────────────────────────
alter table public.feed_items      alter column url drop not null;
alter table public.content_archive alter column url drop not null;

-- Shared "bad URL" predicate (kept inline; matches _shared/url.ts rejects):
--   empty / '#' / missing http(s) / google-news redirect / google CDN shells.

-- ── 2a. content_archive: recover from original_url, else NULL ─────────────────
update public.content_archive
set url = case
    when original_url ~* '^https?://'
     and original_url !~* '(news\.google\.com|googleusercontent\.com|gstatic\.com|//google\.com)'
    then original_url
    else null
  end
where url is null
   or btrim(url) = ''
   or url = '#'
   or url !~* '^https?://'
   or url ~* '(news\.google\.com|googleusercontent\.com|gstatic\.com|//google\.com)';

update public.content_archive
set original_url = null
where original_url is not null
  and (original_url !~* '^https?://'
       or original_url ~* '(news\.google\.com|googleusercontent\.com|gstatic\.com|//google\.com)');

update public.content_archive
set canonical_url = null
where canonical_url is not null
  and (canonical_url !~* '^https?://'
       or canonical_url ~* '(news\.google\.com|googleusercontent\.com|gstatic\.com|//google\.com)');

-- ── 2b. feed_items: recover from source_urls when a clean link exists ─────────
update public.feed_items f
set url = sub.clean
from (
  select f2.id, (
    select e
    from jsonb_array_elements_text(f2.source_urls) e
    where e ~* '^https?://'
      and e !~* '(news\.google\.com|googleusercontent\.com|gstatic\.com|//google\.com)'
    limit 1
  ) as clean
  from public.feed_items f2
  where jsonb_typeof(f2.source_urls) = 'array'
    and (f2.url ~* '(news\.google\.com|googleusercontent\.com|gstatic\.com|//google\.com)'
         or f2.url !~* '^https?://'
         or btrim(f2.url) = ''
         or f2.url = '#')
) sub
where f.id = sub.id and sub.clean is not null;

-- ...then NULL out any still-bad feed_items url.
update public.feed_items
set url = null
where url is not null
  and (btrim(url) = ''
       or url = '#'
       or url !~* '^https?://'
       or url ~* '(news\.google\.com|googleusercontent\.com|gstatic\.com|//google\.com)');
