# Master Entity Registry (MER) — Phase 1

The single source of truth for every identifiable AI entity in Signal. Every
future intelligence system (Search, Overview, Advisor, Ask, Knowledge Graph)
resolves entities through this registry. **It extends the pre-existing entity
tables — it is not a parallel system.**

## Data model

| Table | Purpose |
|---|---|
| `entities` | First-class entity object. `id uuid`, `type`, `slug` (unique), `canonical_name`, `normalized_name`, `description`, `short_description`, `logo_url`, `website`, `official_domain`, `country`, `headquarters`, `founded_year`, `status`, `parent_company` (self-FK), `is_ai`, `extra jsonb`, timestamps. Unique `(type, normalized_name)`. |
| `entity_aliases` | Many aliases → one entity. Unique `(entity_id, normalized_alias)`. Trigram + prefix indexed. |
| `entity_identifiers` | Structured external IDs: `kind` (website, official_domain, wikipedia, crunchbase, github, huggingface, linkedin, x, youtube, developer_docs, rss, newsroom, research, api_docs, documentation, blog, changelog, press, status_page, discord, other), `value`, `verified`, `source`. Unique `(entity_id, kind, value)`. |
| `entity_relationships` | **Schema only (Phase 1).** `from_entity`/`to_entity`/`type`/`confidence`/`article_id`. Populated in a later phase. |
| `entity_metrics` | Rollups: news counts, trending/momentum. |

### Entity types (33)
company, model, product, person, organization, lab, research_lab, framework,
open_source, library, programming_library, funding, acquisition, partnership,
api, hardware, ai_chip, topic, startup, tool, dataset, research_paper,
technology, programming_language, cloud_provider, database, event, conference,
investor, investment, feature, capability.

### Status lifecycle
`active` (default) · `acquired` · `merged` · `closed` · `deprecated` · `archived`.
Soft-delete = `status='archived'` (preserves links/history).

## Normalization

One rule set, two mirrors:
- **`_shared/entity_registry.ts` `normalizeEntityName()`** — authoritative. NFKD
  accent-fold → lowercase → strip punctuation/hyphens/unicode → collapse
  whitespace. Idempotent. Used by the importer, edge function, and matching.
- **SQL `entity_normalize_v2()`** — in-DB mirror for indexed matching (ASCII-lossy
  on accents by design; no `unaccent` extension dependency).

> The legacy `normalize_entity_name()` is unchanged so existing 2,899 rows keep
> resolving. Re-normalizing existing rows onto `entity_normalize_v2` is a
> separate, reviewed step (see Deduplication).

## Deduplication

- **`find_duplicate_entities(min_sim, limit)`** — report only, makes no changes.
  Confidence = `0.6·trigram_name_sim + 0.35·shared_domain + 0.05·same_type`.
  Same weights mirrored in TS `dedupeConfidence()`.
- **`merge_entities(keeper, loser)`** — DESTRUCTIVE. Repoints aliases,
  identifiers, article links, relationships, `content_archive.primary/official
  _entity_id`, `official_publishers`, `entity_overviews`, `parent_company`;
  turns the loser's name into a keeper alias; deletes the loser. Never called
  automatically — always human-reviewed (many high-similarity pairs are distinct
  entities, e.g. `NVIDIA RTX PRO 6000` vs `4500`).

## Edge function: `entity-registry`

Admin-gated (`verify_jwt=true`; requires a `service_role`/admin JWT). `POST` JSON
with an `action`:

| action | payload | effect |
|---|---|---|
| `get` | `{id\|slug\|name}` | entity + aliases + identifiers + metrics |
| `find` | `{q}` | best-match via `resolve_entity` |
| `search` | `{q, types?, limit?}` | prefix/fuzzy via `entity_suggest` |
| `create` | `{name, type?, aliases?, website?, identifiers?, ...}` | create-or-update |
| `update` | `{id, patch}` | partial update (revalidated) |
| `delete` | `{id, hard?}` | soft-archive (default) or hard delete |
| `merge` | `{keeper, loser}` | `merge_entities` |
| `duplicates` | `{min_sim?, limit?}` | dedup candidate report |
| `import` | `{format:"json"\|"csv", data, mode?}` | bulk create/update/skip |

### Validation (`validateEntity`)
Type, status, and identifier-kind must be in the allowed sets; `website`/
identifier URLs pass through the shared `normalizeUrl` (rejects empty/`#`/
javascript:/data:/google-redirect/CDN); `official_domain` derived from website
when absent; `founded_year` ∈ [1800, 2100].

## Importer

`parseImport(data, "json"|"csv")` → `EntityInput[]`. CSV is RFC-4180-ish
(quoted fields, embedded commas/newlines); `aliases` accept a JSON array or a
`|`/`;`-delimited string. `mode: "skip_existing"` skips names that already
resolve; default `upsert` creates or updates.

## Performance

Existing indexes meet the targets: unique `slug` and `(type, normalized_name)`
(exact <10ms), trigram GIN on `canonical_name`/`normalized_name` (fuzzy), prefix
`text_pattern_ops` on `normalized_name` and `normalized_alias` (prefix <20ms).
Added btree on `status`, `parent_company`; trigram GIN on `entity_identifiers.value`.

## Tests

`_shared/entity_registry.test.ts` — normalization (case/space/punct/unicode/
idempotence), validation (types/status/URLs/domain/identifiers), dedup scoring,
name similarity, CSV/JSON import parsing. Run with `deno test`.

## Not in Phase 1 (future)
Relationship intelligence (schema only), official-source discovery, search
ranking, AI overview, semantic/vector lookup, any UI.
