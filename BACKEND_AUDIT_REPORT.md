# Signal Backend Audit Report

Date: 2026-07-11
Repository: `C:\signal AI\signal-project-export`

## Executive Summary

Signal has a serious backend foundation for a hackathon product: the news ingestion pipeline, scoring, personalization, fallback AI behavior, structured logging, job locks, RLS-enabled tables, onboarding persistence, push delivery, and advisor logic are all present.

The backend is not production-ready yet. The main blocker is not feature depth. It is control-plane safety: expensive and privileged Supabase Edge Functions are public, configured with `verify_jwt = false`, use the service role inside the function, allow `Access-Control-Allow-Origin: *`, and several can be triggered by anyone on the internet.

The second blocker is deployment drift. The canonical migrations do not contain every object the runtime code expects, and some legacy migrations still point to an older Supabase project ref. A fresh deployment can build successfully but fail at runtime in notifications, onboarding Expert saves, scheduled ingestion, or cron behavior.

Scores:

| Area | Score | Verdict |
| --- | ---: | --- |
| Overall backend readiness | 58 / 100 | Strong prototype, unsafe production surface |
| Security | 42 / 100 | Public service-role functions are the biggest issue |
| Database integrity | 62 / 100 | Good schema/RLS base, but migration drift exists |
| API design | 54 / 100 | Useful endpoints, weak auth/rate/method boundaries |
| AI pipeline | 70 / 100 | Good fallback and caching, cost exposure risk |
| News pipeline | 67 / 100 | Solid orchestration, unsafe triggers |
| Performance/scalability | 55 / 100 | OK for seeded demo, risky under public traffic |
| Maintainability | 58 / 100 | TypeScript passes, lint fails heavily |
| Hackathon demo readiness | 72 / 100 | Demoable if backend jobs are protected/pre-seeded |
| Production readiness | 45 / 100 | Do not ship public until critical items are fixed |

Verification run:

| Check | Result |
| --- | --- |
| `npx tsc --noEmit` | Passed |
| `npm test` | Passed, but only 1 Vitest test ran |
| `npm run build` | Passed |
| `npm run lint` | Failed: 145 errors, 13 warnings |
| `npm audit --omit=dev` | Failed: 10 vulnerabilities, including 7 high |
| Supabase/Deno function typecheck | Not completed locally: Deno CLI is not installed |

## Architecture Observed

Frontend calls Supabase directly for read paths and invokes Supabase Edge Functions for backend actions. Backend state lives in Supabase Postgres.

Main backend areas:

| Area | Files |
| --- | --- |
| Edge functions | `supabase/functions/*/index.ts` |
| Shared backend modules | `supabase/functions/_shared/*.ts` |
| Database migrations | `supabase/migrations/*.sql` |
| Legacy migrations | `supabase/migrations/_legacy_v0/*.sql` |
| Frontend Supabase client | `src/integrations/supabase/client.ts` |
| Frontend backend hooks | `src/hooks/useLiveFeed.ts`, `src/hooks/useOnboarding.ts`, `src/hooks/usePersonalizedFeed.ts`, `src/lib/signals.ts`, `src/lib/push.ts` |
| Deployment config | `supabase/config.toml`, `vercel.json`, `DEPLOY.md` |

Strengths:

- News ingestion is modular and source-aware.
- Pipeline code has retries, fallback behavior, circuit breakers, locks, metrics, and logging.
- Personalization has declared profile, inferred behavior, outcomes, search history, embeddings, and advisor hooks.
- RLS is enabled on important tables.
- Public read models are separated from many write-heavy tables.
- Onboarding answers are persisted to backend tables, not only local storage.

Primary risks:

- Admin/background jobs are publicly callable.
- Several public functions bypass RLS with the service role.
- Frontend currently auto-triggers `fetch-feed`, which can start a full backend ingestion/AI pipeline from normal app usage.
- Canonical migrations do not fully match runtime code.
- Legacy deployment references point to a different Supabase project.
- CI-quality backend verification is missing for Deno Edge Functions.

## Endpoint Audit

| Endpoint | Purpose | Auth config | Service role | Main issue | Severity |
| --- | --- | --- | --- | --- | --- |
| `fetch-feed` | Full ingest + publish + notifications path | `verify_jwt = false` | Yes | Public expensive control-plane job, frontend auto-calls it | Critical |
| `ingest-tier` | Fetch one source tier | `verify_jwt = false` | Yes | Public scheduled/admin ingest job | Critical |
| `publish-feed` | Publish curated feed | `verify_jwt = false` | Yes | Public AI/publish job | Critical |
| `send-notifications` | Push notifications | `verify_jwt = false` | Yes | Public notification sender plus schema mismatch | Critical |
| `update-trends` | Trend intelligence refresh | `verify_jwt = false` | Yes | Public expensive AI/DB scan | High |
| `cluster-users` | User embedding clustering | `verify_jwt = false` | Yes | Public user-clustering job | High |
| `signal-health` | Health checks/ops data | `verify_jwt = false` | Yes | Public internal observability | High |
| `register-push` | Push subscription CRUD | `verify_jwt = false` | Yes | Endpoint-based unauthenticated mutation | High |
| `save-onboarding-profile` | Onboarding profile save | `verify_jwt = false` | Yes | Arbitrary client profile writes; Expert mismatch | High |
| `personalize` | Personalized feed/advisor | `verify_jwt = false` | Yes | Arbitrary `client_id`, behavior/search poisoning | Medium |
| `record-signal` | User behavior events | `verify_jwt = false` | Yes | Arbitrary signal writes; one outcome mapping is broken | Medium |
| `record-outcome` | Outcome learning events | `verify_jwt = false` | Yes | Arbitrary outcome poisoning | Medium |

## Critical Issues

### 1. All Edge Functions Are Public While Using Service-Role Access

Problem:
All functions in `supabase/config.toml` are configured with `verify_jwt = false`, and every entrypoint creates or uses a Supabase service-role client.

Why it matters:
RLS protects direct browser table access, but it does not protect service-role code. Public service-role functions become the real authorization boundary.

Risk:
Anyone can trigger costly jobs, mutate user profile data, poison learning signals, inspect health state, send push attempts, or cause backend load. This is the top production blocker.

Exact file:
`supabase/config.toml:3-37`

Exact functions:
`fetch-feed`, `ingest-tier`, `publish-feed`, `send-notifications`, `update-trends`, `cluster-users`, `signal-health`, `register-push`, `save-onboarding-profile`, `personalize`, `record-signal`, `record-outcome`

Root cause:
The same public Edge Function model is used for both user-facing actions and internal/admin jobs.

Recommended fix:
Split endpoints into public and protected groups. For background/admin jobs, require a server-only secret such as `x-signal-cron-secret`, enable JWT verification where suitable, and reject requests before creating the service-role client. Keep public endpoints narrowly scoped and validate ownership.

### 2. Normal App Launch Can Trigger the Full Ingestion Pipeline

Problem:
`useLiveFeed.refresh()` invokes `fetch-feed`, and the hook calls `refresh()` on mount plus every 30 minutes.

Why it matters:
Every app visitor can trigger backend ingestion and AI processing. The pipeline is not just a read refresh; it fetches sources, scores content, writes DB rows, publishes, and can trigger notifications.

Risk:
Cost spikes, upstream source throttling, Supabase function concurrency pressure, and inconsistent demo behavior under traffic.

Exact file:
`src/hooks/useLiveFeed.ts:103-128`

Exact function:
`refresh`

Root cause:
The frontend treats a backend control-plane job like a client refresh API.

Recommended fix:
Change the client refresh to only read `feed_items`. Move ingestion/publish to protected cron/admin functions. If a demo refresh button is needed, gate it behind an admin-only endpoint or local dev flag.

### 3. Notification Runtime Code Does Not Match the Canonical Schema

Problem:
`send-notifications` inserts `attempts` and `delivered_at`, but the canonical `notification_log` table does not define those columns.

Why it matters:
Push delivery can succeed but logging can fail, which breaks daily caps, duplicate suppression, delivery analytics, and health checks.

Risk:
Runtime errors in the notification job and unreliable notification fatigue control.

Exact files:
`supabase/functions/send-notifications/index.ts:142-148`
`supabase/functions/send-notifications/index.ts:158-163`
`supabase/migrations/20260703170000_missing_persistence.sql:210-216`

Exact function:
`send-notifications` Edge Function request handler

Root cause:
The schema fix exists only in legacy migration history, not in the canonical migration chain.

Recommended fix:
Add a canonical migration that adds `attempts integer` and `delivered_at timestamptz` to `public.notification_log`, or remove those writes. Regenerate Supabase types afterward.

### 4. Onboarding Expert Choice Can Fail Backend Persistence

Problem:
The onboarding save function accepts `expert`, then writes it to `user_profiles.skill_level`. The canonical DB check only allows `beginner`, `intermediate`, and `advanced`.

Why it matters:
The UI asks for Expert and the API accepts Expert, but the database rejects it.

Risk:
Users who choose Expert may be marked complete locally while the backend profile save fails.

Exact files:
`supabase/functions/save-onboarding-profile/index.ts:21-23`
`supabase/functions/save-onboarding-profile/index.ts:173-183`
`supabase/migrations/20260628090003_identity.sql:33-34`
`src/hooks/useOnboarding.ts:91-103`

Exact functions:
`save-onboarding-profile` request handler
`completeOnboarding`

Root cause:
Frontend/API option set and database enum/check constraint are out of sync. The hook also marks onboarding complete after the save attempt regardless of success.

Recommended fix:
Either add `expert` to the DB check constraint or map `expert` to `advanced` in `skill_level` while storing `experience_level = expert`. Only mark onboarding complete after backend persistence succeeds, or clearly enter an offline/retry state.

### 5. Canonical Migrations Do Not Contain the Cron Jobs or Current Project URLs

Problem:
Canonical migrations intentionally do not enable `pg_cron`/`pg_net`, and cron scheduling appears only in `_legacy_v0` migrations with an old project URL.

Why it matters:
A clean database created from `supabase/migrations/*.sql` may not have scheduled ingestion, publish, trend, notification, or cluster jobs.

Risk:
The deployed app may appear stale unless a user happens to trigger `fetch-feed`. If legacy cron SQL is applied manually, jobs may call the wrong Supabase project.

Exact files:
`supabase/migrations/20260628090001_extensions.sql:5`
`supabase/migrations/_legacy_v0/20260624140000_intelligence_platform.sql:223-292`
`supabase/migrations/_legacy_v0/20260624180000_intelligence_v4.sql:138-146`
`DEPLOY.md:3-10`

Exact functions affected:
`fetch-feed`, `ingest-tier`, `publish-feed`, `update-trends`, `send-notifications`, `cluster-users`

Root cause:
Migration history was partially moved into `_legacy_v0`, but runtime expectations still depend on objects introduced there.

Recommended fix:
Create fresh canonical migrations for required extensions, source seed data, and cron schedules. Use the current project ref from `supabase/config.toml` or, better, avoid hard-coded project URLs in docs and cron SQL where possible.

## High Issues

### 6. Deployment Documentation Points to the Wrong Supabase Project

Problem:
`supabase/config.toml` uses project `ywsnuijybcbxylgsjvqi`, but `DEPLOY.md` references `ahxhbufgpcqpafdehfaj`.

Why it matters:
Following the deploy docs can deploy functions, generate types, or test endpoints against the wrong project.

Risk:
Black screens, missing data, stale functions, wrong database types, and hard-to-debug environment drift.

Exact files:
`supabase/config.toml:1`
`DEPLOY.md:3-10`
`DEPLOY.md:75`
`DEPLOY.md:85-90`
`DEPLOY.md:129`

Exact function:
Deployment flow, not a runtime function.

Root cause:
Project ref changed but docs and legacy SQL were not reconciled.

Recommended fix:
Update `DEPLOY.md` and any cron SQL to the current project. Add an environment checklist for Vercel and Supabase secrets.

### 7. Public Health Endpoint Exposes Internal Backend State

Problem:
`signal-health` is public and uses the service role to read internal health, logs, source status, and notification tables.

Why it matters:
Health endpoints are useful, but public health endpoints should not expose operational internals.

Risk:
Attackers can discover pipeline state, stale jobs, failures, source health, and table behavior.

Exact file:
`supabase/functions/signal-health/index.ts:32-34`

Exact function:
`signal-health` request handler

Root cause:
Operational endpoint has the same public access posture as user-facing endpoints.

Recommended fix:
Require an admin secret/JWT and return a redacted public health response only if one is needed for uptime checks.

### 8. Push Subscription Management Is Unauthenticated

Problem:
`register-push` allows subscribe, update, unsubscribe, and get actions without user ownership verification.

Why it matters:
The endpoint uses the push endpoint string as the only authority.

Risk:
Anyone with or guessing a subscription endpoint can alter preferences or unsubscribe. Public mutation also allows table spam.

Exact file:
`supabase/functions/register-push/index.ts:14-20`

Exact function:
`register-push` request handler

Root cause:
The product uses anonymous client IDs/subscriptions without a signed ownership token.

Recommended fix:
Bind subscriptions to a signed client identity, Supabase auth user, or one-time token issued by the backend. Rate-limit and validate mutations.

### 9. Job Locks Fail Open

Problem:
If the `acquire_job_lock` RPC errors, `acquireLock` returns `true`.

Why it matters:
The lock is supposed to prevent overlapping expensive jobs. On DB/RPC trouble, the system currently runs the job anyway.

Risk:
Duplicate ingestion, duplicate AI calls, DB contention, and worse behavior exactly when lock infrastructure is unhealthy.

Exact file:
`supabase/functions/_shared/reliability.ts:185-195`

Exact function:
`acquireLock`

Root cause:
Pipeline availability was prioritized over cost/consistency.

Recommended fix:
For expensive control-plane jobs, fail closed. Return `false` on lock errors and log/alert. If a fail-open mode is desired for dev, make it explicit through an environment flag.

### 10. Dependency Audit Has High-Severity Findings

Problem:
`npm audit --omit=dev` reports 10 vulnerabilities, including 7 high.

Why it matters:
The app is frontend-heavy and router/build dependencies are on the request path or deployment path.

Risk:
Known XSS/open-redirect and package-level vulnerabilities remain in the dependency tree.

Exact file:
`package.json`

Exact function:
Dependency management.

Root cause:
Dependencies have not been upgraded after known advisories.

Recommended fix:
Run targeted upgrades, especially for React Router packages, `glob`, `lodash`, `minimatch`, `picomatch`, `postcss`, and transitive vulnerable packages. Re-run `npm test`, `npm run build`, and a visual smoke test.

### 11. Lint Fails Across Backend and Frontend

Problem:
`npm run lint` fails with 145 errors and 13 warnings.

Why it matters:
A failing lint gate hides real issues and weakens confidence in future changes.

Risk:
Type holes, unused expressions, broad `any`, CommonJS import drift, and Fast Refresh warnings can accumulate.

Exact files:
Multiple files under `supabase/functions`, `src`, and `tailwind.config.ts`.

Exact function:
Repository quality gate.

Root cause:
The project has no clean lint baseline and Deno function code is being checked under a frontend-oriented ESLint setup.

Recommended fix:
Separate lint configs for browser code and Supabase Edge Functions, or tune overrides for Deno modules. Then fix the remaining real errors.

## Medium Issues

### 12. Topic Revisit Outcome Is Not Persisted Correctly

Problem:
`record-signal` maps `topic_revisit` to `returns`, but canonical `bump_outcome` only handles impressions, clicks, saves, shares, and ignores.

Why it matters:
Topic return behavior is a valuable personalization signal.

Risk:
The app records the signal row, but the recommendation outcome aggregate does not learn from it.

Exact files:
`supabase/functions/record-signal/index.ts:31-37`
`supabase/migrations/20260703170000_missing_persistence.sql:254-273`

Exact functions:
`record-signal` request handler
`public.bump_outcome`

Root cause:
Legacy migration supported `returns`, but canonical outcome schema/RPC no longer does.

Recommended fix:
Add a `returns` column and update `bump_outcome`, or map `topic_revisit` to an existing canonical field intentionally.

### 13. Public Personalization Can Be Poisoned By Arbitrary Client IDs

Problem:
`personalize`, `record-signal`, `record-outcome`, and `save-onboarding-profile` accept arbitrary `client_id` values.

Why it matters:
The recommendation engine trusts client-submitted identity and behavior.

Risk:
A malicious client can poison another profile, inflate/deflate story outcomes, or skew personalization.

Exact files:
`supabase/functions/personalize/index.ts:36-41`
`supabase/functions/record-signal/index.ts:62-78`
`supabase/functions/record-outcome/index.ts:44-58`
`supabase/functions/save-onboarding-profile/index.ts:127-162`

Exact functions:
Request handlers for the listed functions.

Root cause:
Anonymous personalization does not have signed client identity.

Recommended fix:
Issue a server-signed anonymous client token during onboarding/session creation, or use Supabase Auth. Require that token for profile and behavior writes.

### 14. No Function-Level Rate Limiting

Problem:
Public functions have no rate limit by IP, client ID, endpoint, or secret scope.

Why it matters:
Even correctly validated endpoints can be abused without throttling.

Risk:
Cost spikes, DB writes, notification abuse, and noisy analytics.

Exact files:
All public function entrypoints under `supabase/functions/*/index.ts`.

Exact function:
Request handlers.

Root cause:
Rate control is not implemented at the edge layer.

Recommended fix:
Add rate limiting for public write endpoints and hard reject unauthenticated admin endpoints. Supabase table-backed rate limits or an edge-friendly KV/rate service would be enough for v1.

### 15. AI Prompt/Data Boundary Needs Hardening

Problem:
External news/source data is sent through AI reasoning flows. The system has schemas and fallbacks, but there is no explicit prompt-injection policy for untrusted source text.

Why it matters:
News titles/descriptions can contain adversarial text.

Risk:
Bad summaries, unsafe recommendations, malformed tool requests, or poisoned ranking explanations.

Exact files:
`supabase/functions/_shared/editor.ts`
`supabase/functions/_shared/intelligence_v2.ts`
`supabase/functions/_shared/trend_intel.ts`

Exact functions:
AI reasoning and editor functions.

Root cause:
Untrusted content is treated as content, but there is no central sanitizer/instruction boundary helper.

Recommended fix:
Wrap external text in explicit untrusted-content delimiters, strip obvious instruction payloads where possible, keep schema validation strict, and record degraded/fallback decisions.

### 16. Backend Tests Are Not Part of the Main Test Run

Problem:
`npm test` ran only one Vitest test. Backend shared test files exist under `supabase/functions/_shared`, but they were not included in the observed test run.

Why it matters:
Important backend logic can regress without CI noticing.

Risk:
Rules, scoring, opportunity logic, and learning logic can drift.

Exact files:
`supabase/functions/_shared/*.test.ts`
`package.json`

Exact function:
Test configuration.

Root cause:
The Node/Vitest test config does not include or execute Deno-oriented backend tests.

Recommended fix:
Add a dedicated backend test command, such as Deno tests for Supabase functions, and include it in CI.

### 17. Deno Edge Function Typecheck Is Missing Locally

Problem:
Deno CLI is not installed in this environment, so Supabase Edge Functions were not locally Deno typechecked.

Why it matters:
Node TypeScript checks do not fully validate Deno imports, `Deno.env`, npm specifiers, or Supabase Edge runtime behavior.

Risk:
Build can pass while Edge Function deployment/runtime fails.

Exact files:
`supabase/functions/*/index.ts`
`supabase/functions/_shared/*.ts`

Exact function:
Supabase Edge runtime validation.

Root cause:
No local/CI Deno validation step is available.

Recommended fix:
Install Deno in CI/dev tooling and add `deno check`/`deno test` for function code, or use `supabase functions serve` validation in CI.

### 18. Vercel Env Is Hard-Coded In Deployment Config

Problem:
`vercel.json` injects public Supabase values directly into the build command.

Why it matters:
The publishable key and URL are not secrets, but hard-coding them increases drift and makes project switching error-prone.

Risk:
Deployments can silently target the wrong Supabase backend.

Exact file:
`vercel.json`

Exact function:
Deployment configuration.

Root cause:
Vercel environment variables were patched at config level instead of managed in Vercel project settings.

Recommended fix:
Move values to Vercel environment variables and keep `vercel.json` generic.

## Low Issues

### 19. Frontend Bundle Is Large

Problem:
The production build produces a large JavaScript chunk of about 946 kB minified.

Why it matters:
Signal is mobile-first. Heavy initial JS can hurt first load, especially on lower-end devices.

Risk:
Slower demo load and worse perceived performance.

Exact files:
`src/App.tsx`, route/page imports, Vite build output.

Recommended fix:
Add route-level code splitting and lazy-load heavy sections like Advisor/Search/detail views.

### 20. Build Tooling Warnings Are Unresolved

Problem:
Build reports outdated Browserslist data and Tailwind ambiguous class warnings.

Why it matters:
Warnings are not urgent, but noisy builds hide future real warnings.

Risk:
Minor CSS generation ambiguity or stale browser targeting.

Exact files:
`tailwind.config.ts`, generated CSS usage in UI files.

Recommended fix:
Run Browserslist update and replace ambiguous Tailwind arbitrary classes with unambiguous utilities or CSS variables.

## Database Audit

Good:

- RLS is enabled on many important tables.
- Public feed read access is separated from internal writes.
- `clients`, `user_profiles`, `user_signals`, `user_searches`, `recommendation_outcomes`, `story_intelligence`, `pipeline_runs`, `job_locks`, and push tables give the app a real personalization foundation.
- Indexes exist for common feed, raw item, source, profile, signal, and notification paths.

Needs work:

- Canonical migrations do not fully match runtime code.
- Legacy migrations contain operational objects and current runtime fixes that may not apply in clean deployments.
- Cron jobs and source seed data should be moved into canonical migrations.
- `notification_log` schema needs to match `send-notifications`.
- `user_profiles.skill_level` must match onboarding values.
- `recommendation_outcomes` should either support `returns` or stop writing it.
- Add cleanup/retention policies for behavioral tables, raw items, logs, and search history.
- Reconfirm vector indexes in the canonical migration path if semantic lookup is expected to scale.

## Auth And Security Audit

Current posture:

- The browser uses a Supabase publishable key, which is normal.
- Direct DB RLS is better than average for a prototype.
- Edge Functions weaken that protection because they are public and use service-role access.

Production minimum:

- Protect internal jobs.
- Add method checks to all functions.
- Add rate limits to public write endpoints.
- Add signed anonymous identity or Supabase Auth for profile/signal ownership.
- Redact or protect health output.
- Keep secrets out of client-visible config.
- Add dependency patching to release flow.

## AI And Personalization Audit

Good:

- Onboarding captures declared role, goal, interests, weekly time, and experience.
- Behavior learning uses reading events, saves, searches, outcomes, and profile state.
- AI reasoning has fallbacks and cached story intelligence.
- Advisor output is built on personalized cards rather than being fully generic.

Risks:

- Public endpoints allow profile/signal poisoning.
- Expensive AI jobs can be triggered publicly.
- Prompt-injection boundaries around untrusted source text should be stronger.
- Silent async writes in personalization can hide learning failures.

How each onboarding answer should be used:

| Field | Backend use |
| --- | --- |
| `primary_role` | Persona mix, tone, opportunity framing, advisor strategy |
| `primary_goal` | Ranking boosts, CTA selection, recommendation explanation |
| `interests[]` | Topic filtering, semantic affinity seed, cold-start feed |
| `weekly_time_budget` | Recommendation volume, task size, advisor action depth |
| `experience_level` | Explanation depth, technicality, beginner/expert filtering |

How profile should evolve:

- `user_signals` should update interest weights and behavior counters.
- `user_searches` should update explicit intent and semantic profile.
- `recommendation_outcomes` should update ranking priors.
- Saves/clicks/shares/ignores should change both personal and global scoring.
- Ignored recommendations should reduce similar future suggestions.

This is mostly architected, but public identity and outcome poisoning must be fixed before trusting the learned profile.

## News Pipeline Audit

Good:

- Source abstraction exists.
- Source health and trust concepts exist.
- The pipeline has stages, retries, fallback, and metrics.
- Feed publishing is separate from raw ingestion.

Risks:

- Ingestion/publish can be triggered by public users.
- Cron and source registry state are not guaranteed by canonical migrations.
- External fetch behavior under load depends on upstream services and public trigger control.
- Lock fail-open weakens protection during infrastructure errors.

## Performance And Stress Analysis

For 100 users:

- If users only read `feed_items`, the backend should likely handle it.
- With the current frontend auto-triggering `fetch-feed`, 100 users can create serious backend job pressure.

For 500 to 1,000 users:

- Public job triggers can overload source fetching, AI calls, and DB writes.
- Personalization reads are likely acceptable if indexed, but signal writes need rate limits.
- Push jobs need schema fixes and controlled scheduling.

For 5,000 users:

- Current setup is not safe without protected jobs, rate limits, queueing, and stronger identity.
- AI cost and concurrency become the main scaling bottleneck.
- Behavioral tables need retention and aggregation strategy.

## Top 20 Improvements

1. Protect `fetch-feed`, `ingest-tier`, `publish-feed`, `send-notifications`, `update-trends`, `cluster-users`, and `signal-health`.
2. Remove frontend auto-triggering of `fetch-feed`.
3. Add strict method checks to all functions.
4. Add rate limits to public write endpoints.
5. Split public user functions from protected admin/cron functions.
6. Fix `notification_log` canonical schema.
7. Fix `expert` onboarding persistence.
8. Move cron jobs into canonical migrations.
9. Update all project refs in `DEPLOY.md` and legacy operational SQL.
10. Add environment validation at function startup.
11. Change expensive job locks to fail closed.
12. Add signed anonymous client identity or Supabase Auth.
13. Protect/redact `signal-health`.
14. Fix `topic_revisit`/`returns` outcome aggregation.
15. Add Deno function typecheck/test command.
16. Include backend tests in CI.
17. Patch high-severity npm vulnerabilities.
18. Fix or properly scope lint errors.
19. Add prompt-injection boundaries for untrusted source content.
20. Add monitoring/alerts for job failures, AI fallback rate, source freshness, and notification errors.

## Final Verdict

Signal is hackathon-demo capable if the database is pre-seeded and backend jobs are not exposed to public traffic during judging.

Signal is not production-ready until the public service-role function surface is fixed. The product idea and backend architecture are promising, but the current deployment shape lets normal users and external callers trigger privileged backend jobs. Fixing that should happen before adding more features.

The fastest safe path is:

1. Protect admin/cron Edge Functions.
2. Stop frontend auto-ingestion.
3. Fix canonical migration drift.
4. Add rate limiting and signed client identity.
5. Add Deno backend checks to CI.

