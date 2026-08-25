// supabase/functions/_shared/entity_resolver.ts
// ---------------------------------------------------------------------------
// Entity Resolution Engine (ERE) — the single gateway every query passes
// through before hitting search / AI. Wraps the DB RPCs (resolve_query,
// resolve_query_multi, entity_full) with an in-process LRU+TTL cache. Same
// normalization rules as _shared/entity_registry.ts (NFKD).
//
//   resolveEntity(sb, q, opts?)      → best candidate (or null)
//   resolveCandidates(sb, q, opts?)  → top-N with confidence, ambiguity flag
//   resolveMulti(sb, q, opts?)       → per-segment resolution ("A vs B", "A and B")
//   entityFull(sb, id)               → full entity payload (aliases/idents/parent/children)
//   splitMultiEntityQuery(q)         → pure client-side split for UI hints
// ---------------------------------------------------------------------------
import { normalizeEntityName } from "./entity_registry.ts";

// deno-lint-ignore no-explicit-any
type SB = any;

export interface ResolvedEntity {
  entity_id: string;
  slug: string;
  canonical_name: string;
  entity_type: string;
  official_domain: string | null;
  logo_url: string | null;
  status: string;
  confidence: number;              // 0-100
  match_kind: "exact" | "alias_exact" | "prefix" | "alias_prefix" | "fuzzy";
  is_ambiguous: boolean;
}

export interface ResolveOptions {
  limit?: number;                  // default 5
  minConfidence?: number;          // filter below this; default 0 (return all)
  types?: string[];                // restrict to these entity types
  useCache?: boolean;              // default true
  ttlMs?: number;                  // default 5 min
}

export interface MultiResolution {
  segment: string;
  candidates: ResolvedEntity[];    // best-first
}

// ── LRU + TTL cache (in-process; sized for a single Deno isolate) ────────────
const DEFAULT_TTL_MS = 5 * 60_000;
const DEFAULT_CAP = 500;
class LRU<T> {
  private map = new Map<string, { v: T; exp: number }>();
  constructor(private cap = DEFAULT_CAP) {}
  get(k: string): T | undefined {
    const hit = this.map.get(k);
    if (!hit) return undefined;
    if (hit.exp < Date.now()) { this.map.delete(k); return undefined; }
    // touch → move to end for LRU eviction
    this.map.delete(k); this.map.set(k, hit);
    return hit.v;
  }
  set(k: string, v: T, ttlMs: number) {
    if (this.map.has(k)) this.map.delete(k);
    this.map.set(k, { v, exp: Date.now() + ttlMs });
    if (this.map.size > this.cap) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
  }
  clear() { this.map.clear(); }
  get size() { return this.map.size; }
}
const resolveCache = new LRU<ResolvedEntity[]>();
const fullCache    = new LRU<unknown>();

function cacheKey(q: string, opts: ResolveOptions): string {
  return `${normalizeEntityName(q)}|${opts.limit ?? 5}|${(opts.types ?? []).join(",")}|${opts.minConfidence ?? 0}`;
}

// ── Public API ───────────────────────────────────────────────────────────────

/** Resolve a query into the best-matching entity, or null if nothing plausible. */
export async function resolveEntity(sb: SB, q: string, opts: ResolveOptions = {}): Promise<ResolvedEntity | null> {
  const list = await resolveCandidates(sb, q, { ...opts, limit: 1 });
  return list[0] ?? null;
}

/** Top-N candidates with confidence; empty array if the query is blank/no hit. */
export async function resolveCandidates(sb: SB, q: string, opts: ResolveOptions = {}): Promise<ResolvedEntity[]> {
  const norm = normalizeEntityName(q);
  if (!norm) return [];
  const useCache = opts.useCache ?? true;
  const ttl = opts.ttlMs ?? DEFAULT_TTL_MS;
  const key = cacheKey(q, opts);
  if (useCache) {
    const cached = resolveCache.get(key);
    if (cached) return cached;
  }

  const { data, error } = await sb.rpc("resolve_query", { q_raw: q, max_results: opts.limit ?? 5 });
  if (error || !Array.isArray(data)) return [];

  const wanted = opts.types && opts.types.length ? new Set(opts.types) : null;
  const min = opts.minConfidence ?? 0;

  const out: ResolvedEntity[] = [];
  for (const r of data) {
    const conf = Number(r.r_confidence ?? 0);
    if (conf < min) continue;
    const type = String(r.r_entity_type ?? "");
    if (wanted && !wanted.has(type)) continue;
    out.push({
      entity_id: String(r.r_entity_id),
      slug: String(r.r_slug ?? ""),
      canonical_name: String(r.r_canonical_name ?? ""),
      entity_type: type,
      official_domain: r.r_official_domain ?? null,
      logo_url: r.r_logo_url ?? null,
      status: String(r.r_status ?? "active"),
      confidence: conf,
      match_kind: (r.r_match_kind ?? "fuzzy") as ResolvedEntity["match_kind"],
      is_ambiguous: !!r.r_is_ambiguous,
    });
  }
  if (useCache) resolveCache.set(key, out, ttl);
  return out;
}

/** Detect + resolve multiple entities in one query ("Claude vs GPT-5"). */
export async function resolveMulti(sb: SB, q: string, opts: ResolveOptions = {}): Promise<MultiResolution[]> {
  if (!q || !q.trim()) return [];
  const { data, error } = await sb.rpc("resolve_query_multi", { q_raw: q, per_segment: opts.limit ?? 3 });
  if (error || !Array.isArray(data)) return [];
  const bySeg = new Map<string, ResolvedEntity[]>();
  const min = opts.minConfidence ?? 0;
  const wanted = opts.types && opts.types.length ? new Set(opts.types) : null;
  for (const r of data) {
    const conf = Number(r.r_confidence ?? 0);
    if (conf < min) continue;
    const type = String(r.r_entity_type ?? "");
    if (wanted && !wanted.has(type)) continue;
    const seg = String(r.r_segment ?? "").trim();
    const cand: ResolvedEntity = {
      entity_id: String(r.r_entity_id), slug: String(r.r_slug ?? ""),
      canonical_name: String(r.r_canonical_name ?? ""), entity_type: type,
      official_domain: null, logo_url: null, status: "active",
      confidence: conf, match_kind: (r.r_match_kind ?? "fuzzy") as ResolvedEntity["match_kind"],
      is_ambiguous: !!r.r_is_ambiguous,
    };
    const arr = bySeg.get(seg) ?? [];
    arr.push(cand);
    bySeg.set(seg, arr);
  }
  return Array.from(bySeg.entries()).map(([segment, candidates]) => ({ segment, candidates }));
}

/** Full entity payload (aliases + identifiers + parent + children + metrics). */
export async function entityFull(sb: SB, id: string): Promise<unknown | null> {
  if (!id) return null;
  const cached = fullCache.get(id);
  if (cached) return cached;
  const { data, error } = await sb.rpc("entity_full", { p_id: id });
  if (error) return null;
  fullCache.set(id, data, 5 * 60_000);
  return data;
}

/** Pure client-side hint: split "OpenAI and Anthropic" / "Claude vs GPT-5". */
export function splitMultiEntityQuery(q: string): string[] {
  if (!q) return [];
  return q
    .split(/\s+(?:vs\.?|versus|and|&)\s+|\s*[,/]\s*/i)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Test/introspection helpers (not exported to the edge fn's public surface). */
export function _clearCache() { resolveCache.clear(); fullCache.clear(); }
export function _cacheSize() { return { resolve: resolveCache.size, full: fullCache.size }; }
