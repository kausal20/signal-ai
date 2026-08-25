# Entity Resolution Engine (ERE) — Phase 2

The single gateway every query passes through before hitting search / AI /
official-news / overview. Sits between raw user input and the Knowledge Graph.
Reuses Phase 1's Master Entity Registry — no new entity storage.

## Pipeline

```
query → normalize (NFKD) → tokenize → exact → alias-exact → prefix → alias-prefix → fuzzy (trigram) → confidence → ranked candidates
```

Every stage is a UNION branch in `resolve_query`. Fuzzy is **skipped when an
exact/alias-exact hit exists** — the short-circuit that dropped exact-hit cost
from ~14ms to ~2ms.

## Confidence (0-100)

| Tier | Base score | Notes |
|---|---|---|
| exact match on `entities.normalized_name` | 100 | canonical wins |
| exact match on `entity_aliases.normalized_alias` | 95 | |
| prefix on `entities.normalized_name` | 85 | requires q length ≥ 2 |
| prefix on `entity_aliases.normalized_alias` | 80 | |
| fuzzy (trigram sim ≥ 0.35) | `60 + sim·35` (72-95) | skipped if any exact hit |

Popularity bonus (+0-5) via `entity_metrics.news_count`, capped at 100. Same
formula lives in TS (`dedupeConfidence` weights are separate — used only for
Phase 1 dedup).

**`is_ambiguous` = true** when the top match is under 100 AND the runner-up is
≥ 70 AND their gap is ≤ 10. UIs should present a candidate list in this case.

## RPCs

| RPC | Purpose |
|---|---|
| `resolve_query(q, limit)` | tiered match, returns top-N with confidence + ambiguity flag |
| `resolve_query_multi(q, per_segment)` | splits on ` vs / and / , / & ` and resolves each segment |
| `entity_full(id)` | jsonb payload — entity + aliases + identifiers + parent + children + metrics |
| `resolution_cache_get/put/sweep` | DB warm cache (jsonb per normalized query) |

Output column names are `r_*` prefixed so PL/pgSQL callers don't hit the
"ambiguous column reference" trap when RETURNS TABLE names collide with entity
column names.

## Shared TS: `_shared/entity_resolver.ts`

```ts
import { resolveEntity, resolveCandidates, resolveMulti, entityFull } from "../_shared/entity_resolver.ts";

const winner = await resolveEntity(sb, "Anthropic");
// { entity_id, canonical_name: "Anthropic", entity_type: "company", confidence: 100, ... }

const list = await resolveCandidates(sb, "Claude", { limit: 5, minConfidence: 70 });
// [Claude/company (100, ambiguous), Claude/model (100), Claude/product (100), ...]

const multi = await resolveMulti(sb, "Claude vs GPT-5");
// [{ segment: "Claude", candidates: [...] }, { segment: "GPT-5", candidates: [...] }]

const full = await entityFull(sb, winner.entity_id);
// { entity: {...}, aliases: [...], identifiers: [...], parent: {...}|null, children: [...], metrics: {...} }
```

In-process LRU + 5-min TTL (500 entries). Cache key normalizes case/whitespace,
so `"OpenAI"` and `"  open  ai  "` hit the same slot.

## Edge function actions (`entity-registry`)

Admin-gated. `POST` with `{"action": "..."}`:

| action | body | returns |
|---|---|---|
| `resolve` | `{q, types?, min_confidence?}` | `{resolved, full}` — best entity + full payload |
| `candidates` | `{q, limit?, types?, min_confidence?}` | `{candidates, is_ambiguous}` |
| `resolve_multi` | `{q, per_segment?, min_confidence?}` | `{split, segments}` |
| `confidence` | `{q}` | cheap `{entity_id, confidence, is_ambiguous}` |

Plus the Phase 1 actions: `get / find / search / create / update / delete /
merge / duplicates / import`.

## Performance (measured, prod, 2,899 entities / 2,936 aliases)

| Case | Target | Actual (avg / p95) |
|---|---|---|
| exact (`OpenAI`) | <5ms | **2.3 / 2.9 ms** ✓ |
| alias (`ChatGPT`) | <10ms | **1.4 / 1.5 ms** ✓ |
| prefix (`Anth`) | <20ms | **12.8 / 12.9 ms** ✓ |
| fuzzy (`Anthorpic`) | <25ms | **15.1 / 15.2 ms** ✓ |
| multi (`Claude vs GPT-5`) | — | 16.1 / 16.4 ms |

Reused indexes: unique `slug`, unique `(type, normalized_name)`, trigram GIN on
`entities.canonical_name` + `normalized_name` and `entity_aliases.normalized_alias`,
prefix `text_pattern_ops` on both. Nothing new added — the fast path is the
short-circuit + probe on the unique index.

## Parent / Product resolution

`entity_full` returns `parent` and `children` when populated. Phase 2 seeded
~11 obvious product→company links (ChatGPT/GPT → OpenAI, Claude/Claude Sonnet 5
→ Anthropic, Kimi → Moonshot, Gemini → Google DeepMind, Copilot → Microsoft,
Grok → xAI, LLaMA → Meta, Chat → Mistral) via a resolver-driven `DO` block in
the migration. Broader parent-child inference is deferred to the relationship
intelligence phase per spec.

## Legacy resolvers (NOT retired this phase, per plan)

- `_shared/search.ts` `ALIASES` / `expandQuery`
- `_shared/ask_intelligence.ts` `ENTITY_PATTERNS` / `extractEntities`
- `_shared/trends.ts` `BUILTIN_ENTITIES` / `detectEntities`

Kept as-is. Retirement is a follow-up once the new resolver is proven on real
traffic. New call sites SHOULD use `resolveEntity` / `resolveCandidates`.

## Tests

`_shared/entity_resolver.test.ts` (Deno) — split, mapping, filters, LRU cache
hit/miss/normalization, multi-segment grouping, `entity_full` caching. Run:
`deno test supabase/functions/_shared/entity_resolver.test.ts`.
