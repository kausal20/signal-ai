# Critical Backend Fix Report

Date: 2026-07-11
Scope: Fix only the first five critical issues from `BACKEND_AUDIT_REPORT.md`.

## Summary

The first five critical backend issues were fixed with minimal, targeted changes:

1. Admin Edge Functions now require JWT verification in `supabase/config.toml`.
2. Admin Edge Functions now require an authorized admin/service-role JWT before executing.
3. The frontend no longer triggers ingestion or AI pipeline work.
4. Notification logging now writes only columns that exist in the canonical schema.
5. Onboarding `expert` is preserved as `experience_level` but mapped to `advanced` for the legacy `skill_level` column.

No frontend UI, styling, animations, dependency versions, or unrelated backend architecture were changed.

## Files Changed

| File | Reason Modified | Problem Fixed | Code Impact | Risk Level | Testing Performed |
| --- | --- | --- | --- | --- | --- |
| `supabase/functions/_shared/admin_auth.ts` | Added shared admin authorization helper | Avoid duplicated admin JWT parsing/authorization logic | New helper returns `401` for missing/invalid bearer tokens and `403` for non-admin JWTs | Medium | Targeted ESLint passed |
| `supabase/config.toml` | Enabled JWT verification for admin functions | Admin functions were publicly callable with `verify_jwt = false` | Set `verify_jwt = true` for `fetch-feed`, `send-notifications`, `signal-health`, `ingest-tier`, `publish-feed`, `update-trends`, `cluster-users` | Medium | Static config inspection |
| `supabase/functions/fetch-feed/index.ts` | Protected one-shot ingestion pipeline | Public callers could trigger full ingestion/AI/publish flow | Added admin guard; changed internal notification trigger to service-role JWT; hid internal error body | Medium | Static scan; TypeScript/build unaffected |
| `supabase/functions/publish-feed/index.ts` | Protected publisher pipeline | Public callers could trigger publish/AI flow | Added admin guard; changed internal notification trigger to service-role JWT; hid internal error bodies | Medium | Static scan; TypeScript/build unaffected |
| `supabase/functions/ingest-tier/index.ts` | Protected tier ingestion | Public callers could trigger source fetching | Added admin guard; hid internal error body | Medium | Static scan; TypeScript/build unaffected |
| `supabase/functions/send-notifications/index.ts` | Protected push sender and fixed schema writes | Public callers could trigger notifications; function wrote non-canonical columns | Added admin guard; removed `attempts` and `delivered_at` DB writes | Medium | Static schema scan; TypeScript/build unaffected |
| `supabase/functions/update-trends/index.ts` | Protected trend updater | Public callers could trigger expensive trend processing | Added admin guard; hid DB error body | Medium | Static scan; TypeScript/build unaffected |
| `supabase/functions/cluster-users/index.ts` | Protected user clustering job | Public callers could trigger user embedding clustering | Added admin guard; hid internal error body | Medium | Static scan; TypeScript/build unaffected |
| `supabase/functions/signal-health/index.ts` | Protected operational health endpoint | Public callers could inspect internal backend state | Added admin guard; removed non-canonical notification columns from health query | Low | Static schema scan; TypeScript/build unaffected |
| `src/hooks/useLiveFeed.ts` | Removed frontend-triggered ingestion | Browser was invoking `fetch-feed` directly | `refresh` now rereads cached `feed_items` only; 30-minute live refresh remains | Low | `npx tsc --noEmit`, `npm run build`, targeted ESLint passed |
| `supabase/functions/save-onboarding-profile/index.ts` | Fixed `expert` onboarding persistence | DB `skill_level` check rejects `expert` | Added `expert -> advanced` mapping for `skill_level` while preserving `experience_level = expert` | Low | Static schema check; TypeScript/build unaffected |

## Critical Issues Fixed

### Issue 1: Edge Functions had `verify_jwt = false`

Fixed for protected/admin functions:

- `fetch-feed`
- `publish-feed`
- `ingest-tier`
- `send-notifications`
- `update-trends`
- `cluster-users`
- `signal-health`

Kept public intentionally:

- `register-push`
- `record-signal`
- `personalize`
- `save-onboarding-profile`
- `record-outcome`

Reason: the current app uses anonymous users/client IDs. Blocking those endpoints would break onboarding, personalization, behavior recording, and push registration. These endpoints still need future rate limiting and signed client identity, but they are not admin-only background jobs.

### Issue 2: Admin Edge Functions were publicly callable

Fixed by:

- Adding `requireAdmin(req, corsHeaders)`.
- Returning `401 Unauthorized` for missing/invalid bearer tokens.
- Returning `403 Forbidden` for valid but non-admin JWTs.
- Allowing `service_role` JWTs and JWTs with admin role metadata.
- Moving admin function config to `verify_jwt = true`.

Important deployment note: scheduled cron/admin callers must now send `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` or an authenticated JWT with admin metadata.

### Issue 3: Frontend triggered ingestion pipeline

Fixed in `src/hooks/useLiveFeed.ts`.

Before:

- Browser called `supabase.functions.invoke("fetch-feed")`.
- Every app open could trigger ingestion/AI/publish work.

After:

- Browser reads cached `feed_items`.
- Manual/interval refresh reloads processed feed rows only.
- Existing live refresh behavior remains, but background jobs stay backend-only.

### Issue 4: Notification schema mismatch

Fixed in `send-notifications` and `signal-health`.

Before:

- `send-notifications` inserted `attempts` and `delivered_at`.
- Canonical `notification_log` only has `id`, `subscription_endpoint`, `feed_item_id`, `status`, `sent_at`.
- `signal-health` queried `attempts` and `delivered_at`.

After:

- Notification inserts use only existing canonical columns.
- Health check reads only `status` and `sent_at`.
- Delivery attempt count remains available in structured logs.

### Issue 5: Onboarding skill level mismatch

Fixed in `save-onboarding-profile`.

Before:

- API accepted `experience_level = expert`.
- Function wrote `skill_level = expert`.
- DB check allowed only `beginner`, `intermediate`, `advanced`.

After:

- `experience_level = expert` is preserved for personalization.
- `skill_level` stores `advanced` for compatibility with the existing DB constraint.
- No DB enum/check change was required.

## Validation Results

| Validation | Result | Notes |
| --- | --- | --- |
| `npx tsc --noEmit` | Passed | Frontend TypeScript check passed |
| `npm run build` | Passed | Existing bundle-size, Browserslist, and Tailwind warnings remain |
| `npm test` | Passed | 1 Vitest test ran |
| `npm run lint` | Failed | Existing lint backlog remains: 145 errors, 13 warnings |
| Targeted ESLint: `src/hooks/useLiveFeed.ts supabase/functions/_shared/admin_auth.ts` | Passed | New helper and changed frontend hook are clean |
| Targeted ESLint: changed Edge Function files | Failed | Existing `any` lint errors remain in those files |
| Edge Function Deno compile | Blocked | Deno CLI is not installed; Supabase CLI has no non-deploy dry-run compile command |
| Feed loading static verification | Passed | `useLiveFeed` still selects from `feed_items` and refreshes every 30 minutes |
| Frontend ingestion static verification | Passed | No remaining `supabase.functions.invoke("fetch-feed")` match in `src` |
| Notification schema static verification | Passed | No remaining DB writes to `attempts` or `delivered_at` |
| Onboarding static verification | Passed | `expert` maps to `advanced` only for `skill_level` |

## Remaining Known Issues

- Public anonymous user endpoints still need rate limiting and signed client identity.
- Existing lint backlog still needs a separate cleanup pass.
- Dependency vulnerabilities from the audit were not changed because the task explicitly said not to upgrade dependencies.
- Deno is missing locally, so Supabase Edge Functions could not be Deno-compiled in this environment.
- Existing deployed cron jobs, if any, must be updated to send an authorized JWT/service-role bearer token.
- `signal-health` is now protected, but it still returns detailed operational data to authorized admins.

## Security Improvements

- Public users can no longer call admin/background jobs directly.
- Normal app launches no longer trigger ingestion, publishing, AI processing, or notification jobs.
- Internal admin function chaining now uses the service-role JWT instead of the anon key.
- Admin function error responses no longer expose raw exception strings in the patched paths.
- Onboarding can accept Expert users without breaking the backend write.
- Notification logging matches the canonical schema.

## Production Readiness Score

Updated score: `67 / 100`.

Reason:

The five highest-risk critical blockers are now addressed, especially the public admin function surface and browser-triggered ingestion. The score is not higher because rate limiting, signed anonymous identity, dependency vulnerabilities, lint debt, cron deployment verification, and Deno Edge Function compile validation still remain.

