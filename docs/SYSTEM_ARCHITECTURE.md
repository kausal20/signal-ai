# Signal AI — System Architecture, Data Flow & Execution Points

Single reference: app structure, how data moves end-to-end, every executable entry point, and the main execution sequence that produces what the user sees.

---

## 1. Stack

- **Frontend:** React + TypeScript + Vite, Tailwind CSS, Framer Motion, React Router, TanStack Query. Mobile-simulated in a `PhoneFrame` shell.
- **Backend:** Supabase — Postgres (schema + RPCs) + Deno Edge Functions + `pg_cron`/`pg_net` for scheduled jobs.
- **No separate app server.** The browser talks directly to Supabase (anon key for reads, edge functions for writes/AI/search).

---

## 2. Executable entry points

| Entry point | File | Triggered by |
|---|---|---|
| App boot | `src/main.tsx` → `createRoot(...).render(<App/>)` | Browser loads `index.html` |
| Route root | `src/App.tsx` | Mounts `BrowserRouter`, `QueryClientProvider`, `PhoneFrame`, `AnimatedRoutes` |
| Page router | `AnimatedRoutes` in `App.tsx:57` | URL change → `Routes`/`Route` match |
| Edge functions | `supabase/functions/<name>/index.ts` — `Deno.serve(async (req) => {...})` | HTTP POST from frontend (`supabase.functions.invoke`) or `pg_cron` via `pg_net.http_post` |
| DB RPCs | `create function public.<name>(...)` in migrations | Called via `supabase.rpc()` from frontend/hooks, or from inside edge functions |
| Scheduled jobs | `pg_cron.schedule(...)` (in migrations) | Postgres cron, no HTTP entry — fires on schedule, calls edge functions via `pg_net` |

### Routes (`App.tsx:68-77`)
`/` Home+Search+Saved (tab state in `Index.tsx`) · `/advisor` · `/strategy` · `/weekly` · `/settings` · `/onboarding` · `/ai-pulse` · `/prompts` · `/showcase` (fullscreen, outside PhoneFrame) · `*` → NotFound.

`Index.tsx` is itself a router-within-a-route: it reads `activeTab`/pathname and conditionally renders `HomePage` / `SearchPage` / `SavedPage` (all `ui-v2`) behind `USE_V2_*` flags (all `true` in prod).

---

## 3. Frontend structure

```
src/
  main.tsx                 entry
  App.tsx                  routes + providers
  pages/                   route-level containers (legacy names, wrap ui-v2 pages)
    Index.tsx               Home/Search/Saved host — owns feed state, bookmarks, tab routing
    Advisor.tsx, Settings.tsx, Strategy.tsx, Weekly.tsx, Onboarding.tsx, PromptLibrary.tsx
  ui-v2/                   actual presentation layer (current design system)
    pages/                  HomePage, SearchPage, SavedPage, AdvisorPage, SettingsPage, AiPulsePage
    components/              FeedCard, TopStoryCard, LiquidGlassBar (bottom nav), SourceAttribution, NewsIntelligenceSheet
    ask/                     AskSignalLauncher, AskSignalOverlay (the one global AI chat)
    layouts/                 ScreenShell, PageTransition, BottomNav
    animations/               motion.ts (shared Framer Motion tokens)
  hooks/                   data-fetching layer (see §4)
  adapters/                homeV2.ts — maps raw feed rows → ui-v2 Signal/Recommendation shapes
  lib/                     url.ts (URL normalizer), askSignal.ts, clientId.ts
  components/               PullToRefresh, PhoneFrame, BrandLogo, shadcn ui/ primitives
  integrations/supabase/    client.ts (the one Supabase client instance)
```

---

## 4. Data flow — Home feed (main "output" path)

```
User opens "/"
  → Index.tsx mounts
  → useLiveFeed()              GET-equivalent: supabase.from("feed_items").select(...)
  → usePersonalizedFeed()      wraps useLiveFeed; also invokes edge fn "personalize"
                                 (supplements from content_archive when feed_items is
                                  thin/stale; applies score multipliers)
  → useAdvisorFallback()       (Advisor page only) guarantees a hero pick exists
  → adapters/homeV2.ts          maps FeedItem[] → Signal[]/Recommendation (ui-v2 shapes)
  → HomePage renders            TopStoryCard, FeedCard list, LiquidGlassBar nav
  → PullToRefresh                calls refresh() → re-runs useLiveFeed fetch
```

**Underlying ingestion (why `feed_items`/`content_archive` have data at all — runs independently of any user request, on cron):**

```
pg_cron → ingest-tier (fast/medium/slow tier)
  → _shared/sources.ts: connectorFetch() per source_connectors row
  → _shared/fetchers.ts: RSS/sitemap/blog/github fetchers → RawItem[]
  → _shared/cluster.ts: dedupeByCanonicalUrl, rejectRaw
  → _shared/store.ts: storeRawItems()
      → raw_items (upsert)
      → archiveAcceptedItems() → content_archive (upsert, classifies content_type/
        editorial/source_type, normalizes URL via _shared/url.ts)
pg_cron → publish-feed
  → selects/ranks top items → feed_items (the curated Home feed, ~12/run)
pg_cron → backfill-entities (default action)
  → entity_extract.ts → entities/entity_aliases/entity_article_links
      (Master Entity Registry — see §6)
```

---

## 5. Data flow — Search

```
User types in SearchPage
  → Index.tsx: setQuery(q)
  → useSignalSearch(query, enabled)   (src/hooks/useSignalSearch.ts)
      debounced 250ms
      → supabase.functions.invoke("search", { body: { q } })
  → edge fn supabase/functions/search/index.ts
      → RPC signal_search(q_ts, q_raw, max_results)
          resolves entity via resolve_entity()/resolve_query() (§6) →
          entity-scoped result set (official/analysis/mentioned sections)
          OR free-text FTS+trigram ranking if no entity match
  → rowToSignal() maps rows → Signal[]
  → SearchPage renders sectioned results (Official Company News / Related / …)
```

`useSignalSearch` also exposes `refresh()` (re-invokes the same query) — used by `PullToRefresh` on the Search page.

---

## 6. Data flow — Entity resolution (Master Entity Registry, MER)

The layer every "which company/model is this" decision goes through.

```
entities / entity_aliases / entity_identifiers / entity_relationships (schema-only)
  / entity_metrics / entity_resolution_cache      [Postgres tables]

resolve_query(q, limit)        tiered: exact(100) → alias_exact(95) → prefix(85/80)
                                 → fuzzy trigram(60-95), short-circuits fuzzy on exact hit
resolve_query_multi(q)         splits "A vs B" / "A and B" → resolve_query per segment
entity_full(id)                → jsonb {entity, aliases, identifiers, parent, children, metrics}

Called from:
  - edge fn entity-registry (actions: resolve/candidates/resolve_multi/get/find/search/
    create/update/delete/merge/duplicates/import) — admin-gated CRUD + resolution API
  - edge fn search (via signal_search → resolve_entity, the legacy single-match RPC)
  - _shared/entity_resolver.ts (shared TS wrapper w/ in-process LRU+TTL cache) —
    importable by any edge function
```

Frontend does not call `entity-registry` directly today (it's the backend's internal
resolution gateway); Search/Advisor/News-Intelligence consume its output indirectly
through `signal_search` / `content_archive.primary_entity_id` / `official_entity_id`.

---

## 7. Data flow — Ask Signal AI (chat)

```
User taps "Signal AI" (Home header) or "Ask Signal" (Top Story, with article context)
  → navigate("/", { state: { openAsk: true, article? } })
  → AskSignalLauncher (mounted in HomePage) reads location.state → opens AskSignalOverlay
  → useAskSignal(context?) → lib/askSignal.ts streamAskSignal()
      → supabase.functions.invoke("ask-signal", { body: { message, article_context } })
  → edge fn ask-signal/index.ts
      → _shared/ask_intelligence.ts: classifyIntent, extractEntities (regex, legacy)
      → _shared/search.ts / content_archive: retrieveGrounding (RAG-style context pull)
      → _shared/ai_provider.ts: generateContent() (streamed) — the LLM call
  → streamed tokens rendered progressively in AskSignalOverlay's chat bubbles
```

---

## 8. Data flow — Top Story "Signal Analysis" (deep AI report)

```
User opens Signal Analysis sheet on Top Story
  → useNewsIntelligence(article) → supabase.functions.invoke("news-intelligence", {...})
  → edge fn news-intelligence/index.ts
      → cache check: signal_analysis table (article_hash key) → instant hit if cached
      → miss: assembleGrounding (signal_search + related archive rows)
               → _shared/news_intelligence.ts buildPrompt() → generateContent()
               → validate → cache into signal_analysis
  → returns { intelligence, related_stories } → NewsIntelligenceSheet renders sections
```

---

## 9. Other write paths (user actions → DB)

| Action | Hook/call | Edge fn / RPC |
|---|---|---|
| Bookmark toggle | `toggleBookmark` (Index.tsx, localStorage-backed) | none server-side today (client-only) |
| Search telemetry | debounced effect in Index.tsx | `record-signal` edge fn → `event_log`/`user_searches` |
| Outcome tracking | `track()` calls throughout | `record-outcome` edge fn |
| Push subscribe | Settings page | `register-push` edge fn → `push_subscriptions` |
| Onboarding save | Onboarding.tsx | `save-onboarding-profile` edge fn → `clients`/`user_profiles` |
| Article one-liner summary | `useArticleSummary` | `article-summary` edge fn (cached) |
| Entity overview card | Search "Signal AI Overview" | `entity-overview` edge fn |
| AI Pulse industry page | AiPulsePage | `ai-pulse` edge fn (cached in `ai_pulse_cache`) |
| Prompt library generation | PromptLibrary page | `prompt-generate` edge fn |

---

## 10. Scheduled/background execution (no user request involved)

All via `pg_cron` → `pg_net.http_post` → edge function, defined in migrations (search `cron.schedule` in `supabase/migrations/`):

| Job | Edge fn | Cadence (approx) |
|---|---|---|
| Fast-tier ingest | `ingest-tier` (`tier:"fast"`) | every 10 min |
| Medium-tier ingest | `ingest-tier` (`tier:"medium"`) | every 30 min |
| Slow-tier ingest | `ingest-tier` (`tier:"slow"`) | every 2 hrs |
| Curate Home feed | `publish-feed` | after ingest |
| Entity backfill/processor | `backfill-entities` (default action) | every 5-10 min |
| Source discovery | `discover-sources` | every 30 min |
| Source health/maintenance | `run_source_maintenance()` RPC (orchestrator) | every 10 min |
| Trend refresh | `update-trends` | periodic |
| Notification dispatch | `send-notifications` | periodic |
| User clustering | `cluster-users` | periodic |
| Health snapshot | `signal-health` | on-demand/monitoring |

---

## 11. Key Postgres tables (by role)

| Role | Tables |
|---|---|
| Raw ingestion | `raw_items`, `fetch_log`, `source_connectors`, `source_health` |
| Searchable knowledge base | `content_archive` (permanent, all articles) |
| Curated Home feed | `feed_items` (~12/run, editorial) |
| Master Entity Registry | `entities`, `entity_aliases`, `entity_identifiers`, `entity_relationships`, `entity_metrics`, `entity_article_links`, `entity_resolution_cache` |
| Source authority | `official_publishers`, `source_registry` |
| AI caches | `signal_analysis`, `ai_pulse_cache`, `entity_overviews` |
| User/engagement | `clients`, `user_profiles`, `user_searches`, `event_log`, `push_subscriptions` |
| Ops | `pipeline_runs`, `pipeline_metrics`, `source_ops_log`, `editorial_audits` |

---

## 12. End-to-end: "what happens from cron tick to a user seeing an article"

1. `pg_cron` fires `ingest-tier` → fetches source RSS/sitemaps → `raw_items` + `content_archive` (URL normalized, classified).
2. `pg_cron` fires `publish-feed` → ranks/selects → `feed_items`.
3. `pg_cron` fires `backfill-entities` → extracts entities from new `content_archive` rows → `entities`/`entity_article_links`.
4. User opens app → `useLiveFeed` reads `feed_items` → `usePersonalizedFeed` supplements/ranks (calls `personalize` edge fn, which itself queries `feed_items` + `content_archive`) → `adapters/homeV2.ts` maps to UI shape → `HomePage` renders `TopStoryCard`/`FeedCard`.
5. User taps a card → `FeedCard`'s "Source" button → `openOriginal()` (`lib/url.ts`) opens the real publisher URL (validated/normalized at ingestion AND again at render).
6. User searches → `search` edge fn → `signal_search` RPC → entity-resolved, section-ranked results.
7. User asks AI → `ask-signal` edge fn → grounded retrieval from `content_archive`/entities → streamed LLM response.

---

## 13. Config / auth

- Supabase client: `src/integrations/supabase/client.ts` (anon key, public).
- Edge fn auth: most read-only fns (`search`, `ask-signal`, `ai-pulse`, `entity-overview`, `article-summary`, `prompt-generate`) have `verify_jwt=false` (anon-callable). Write/admin fns (`fetch-feed`, `ingest-tier`, `backfill-entities`, `discover-sources`, `entity-registry`, `send-notifications`, `signal-health`) have `verify_jwt=true` (`supabase/config.toml`) — require a `service_role`/admin JWT, only invoked by cron or admin tooling, never the client app.
