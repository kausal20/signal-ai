# Signal — safe deploy + validation

Project ref: `ahxhbufgpcqpafdehfaj`. Run everything from `signal-project-export/`.

## 0. One-time prereqs

```bash
npm i -g supabase
supabase login
supabase link --project-ref ahxhbufgpcqpafdehfaj
```

Edge function secrets (set once; values stay in Supabase):

```bash
supabase secrets set \
  LOVABLE_API_KEY=... \
  VAPID_SUBJECT=mailto:signal@yourdomain \
  VAPID_PUBLIC_KEY=... \
  VAPID_PRIVATE_KEY=...
```

## 1. Snapshot before the change

```bash
supabase db dump --linked -f backups/pre_engine_fix_$(date +%Y%m%d_%H%M).sql
```

## 2. Apply migrations (schema first, code second)

```bash
supabase db push
```

This applies, in order:
- `20260624093000_signal_intelligence_engine.sql` — scoring cols, raw_items, story_clusters
- `20260624120000_signal_engine_fixes.sql` — **the columns that were silently breaking the upsert** (`who_for`, `usefulness`, `vibe_friendly`, `corroboration_score`, `source_count`, `opportunity_score`) + `source_health` + notification retry cols + hourly notification cron
- `20260624130000_pipeline_metrics.sql` — telemetry table + `signal_pipeline_status` view

Schema sanity:

```bash
supabase db remote commit --linked --dry-run
psql "$DATABASE_URL" -c "\d public.feed_items"
psql "$DATABASE_URL" -c "SELECT * FROM signal_pipeline_status;"
```

## 3. Deploy edge functions

```bash
supabase functions deploy fetch-feed
supabase functions deploy ingest-tier
supabase functions deploy publish-feed
supabase functions deploy update-trends
supabase functions deploy record-signal
supabase functions deploy send-notifications
supabase functions deploy signal-health
supabase functions deploy register-push
```

The `_shared/` directory ships automatically with each function bundle (Supabase
includes any sibling module under `supabase/functions/_shared/`).

Cron jobs registered by `20260624140000_intelligence_platform.sql`:
- `ingest-fast`   `*/10 * * * *` → frontier labs
- `ingest-medium` `*/30 * * * *` → community + launches
- `ingest-slow`   `0 */2 * * *`  → research + funding + market
- `publish-feed`  `*/30 * * * *` → cluster + edit + publish + notify
- `update-trends` `20 * * * *`   → trend memory refresh
- `send-signal-notifications` `15 * * * *` → push delivery

## 4. Regenerate frontend types (eliminates drift)

```bash
supabase gen types typescript --project-id ahxhbufgpcqpafdehfaj \
  > src/integrations/supabase/types.ts
npm run build
```

## 5. Trigger one manual pipeline run + validate

```bash
# Run the pipeline once on demand.
curl -sS -X POST \
  "https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/fetch-feed" \
  -H "Content-Type: application/json" \
  -d '{}' | jq '{curation_mode,stored,clusters,raw,disabled_sources}'

# Now hit the health endpoint — returns HTTP 200 if all checks pass, 503 if any fail.
curl -sS "https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/signal-health" \
  | jq '{ok,summary,checks:[.checks[]|{id,name,status,detail}]}'
```

Pass criteria: `summary.fail == 0` and `summary.pass >= 8` (some may legitimately `skip` if no subscribers exist).

`signal-health` now runs 16 checks (added: pipeline run health, 6h error-log rate, self-healing state, trend memory, learning signals, stage telemetry).

### Reliability tables to watch
```sql
SELECT * FROM pipeline_runs ORDER BY started_at DESC LIMIT 10;       -- per-run record
SELECT level, event, count(*) FROM event_log WHERE occurred_at > now() - interval '6 hours' GROUP BY 1,2 ORDER BY 3 DESC;
SELECT source, disabled, disabled_until, circuit_state, uptime_pct, avg_response_ms, duplicate_rate FROM source_health ORDER BY uptime_pct;
SELECT * FROM circuit_breakers WHERE state <> 'closed';
SELECT * FROM job_locks;                                             -- should self-expire
```
Nightly `signal-cleanup` cron prunes event_log (14d), pipeline_runs (30d), fetch_log (14d), raw_items (21d), trend_observations (60d), sent/dead notification_queue (7d), expired job_locks.

## 6. Validation checklist (mapped to `signal-health`)

| # | Check                              | Source of truth                                    |
|---|------------------------------------|----------------------------------------------------|
| 1 | Stories stored                     | `feed_items` row count > 0                         |
| 2 | New stories in 24h                 | `feed_items.fetched_at >= now() - 24h`             |
| 3 | Clustering active                  | `story_clusters` recent + multi-source share       |
| 4 | Source health monitoring           | `source_health` populated, not >50% disabled       |
| 5 | Fallback editor resilience         | `pipeline_metrics.curation_mode` history           |
| 6 | Notifications queued               | candidate count vs active subscribers              |
| 7 | Notification delivery              | `notification_log` alert vs error ratio            |
| 8 | Feed freshness <6h                 | newest `fetched_at` age                            |
| 9 | Category distribution              | last-50 `content_category` mix                     |
| 10| Top-ranked-only daily feed         | last-24h count <= 10, score >= 76, conf >= 58      |

## 7. Recurring monitoring

`pg_cron` already runs `fetch-feed` every 4h and `send-notifications` every hour (set by migrations).
Hit `signal-health` from any uptime service (UptimeRobot, Better Stack, etc.):

```
GET https://ahxhbufgpcqpafdehfaj.supabase.co/functions/v1/signal-health
Alert when: HTTP != 200
```

For a richer dashboard query:

```sql
SELECT * FROM pipeline_metrics ORDER BY ran_at DESC LIMIT 20;
SELECT * FROM signal_pipeline_status;
SELECT source, consecutive_failures, disabled, last_status, last_error
  FROM source_health ORDER BY consecutive_failures DESC;
```

## 8. Rollback

Schema changes are additive (only `ADD COLUMN IF NOT EXISTS` + new tables), so
restoring is just redeploying the prior `fetch-feed` revision:

```bash
git revert <commit-of-engine-fix>
supabase functions deploy fetch-feed
```

The added columns can be left in place; nothing reads them after rollback.

## 9. Common failure modes after deploy

- **Health check 503, check 1 still fails** → the migration didn't apply. Re-run `supabase db push` and verify `\d public.feed_items` shows `who_for`, `vibe_friendly`, `usefulness`, etc.
- **Check 5 stuck on `fallback`** → `LOVABLE_API_KEY` secret missing/expired or the model id changed. Inspect `supabase functions logs fetch-feed`.
- **Check 4 shows >50% disabled** → upstream RSS feeds broken. Inspect `source_health.last_error`; the `fetchWithFallback` helper should mask most of these via Google News.
- **Check 7 fails with errors** → VAPID keys wrong. Re-run `supabase secrets set`.
