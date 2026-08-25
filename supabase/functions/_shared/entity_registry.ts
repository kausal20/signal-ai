// supabase/functions/_shared/entity_registry.ts
// ---------------------------------------------------------------------------
// Master Entity Registry (MER) — reusable normalization, validation, dedup
// scoring, and import parsing. Pure TS (Deno), no DB deps, so the edge function,
// importer, and tests all share ONE implementation. This is the authoritative
// name normalizer (NFKD accent-folding); the SQL `entity_normalize_v2` is the
// ASCII-lossy in-DB mirror for indexed matching.
// ---------------------------------------------------------------------------
import { normalizeUrl, domainOf } from "./url.ts";

// The full MER type vocabulary (mirrors entities_type_check in the migration).
export const ENTITY_TYPES = [
  "company", "model", "product", "person", "organization", "lab", "framework",
  "open_source", "library", "funding", "acquisition", "partnership", "api",
  "hardware", "ai_chip", "topic", "startup", "tool", "dataset", "research_paper",
  "technology", "programming_language", "cloud_provider", "database", "event",
  "conference", "investor", "investment", "feature", "capability", "research_lab",
  "programming_library",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export const ENTITY_STATUSES = [
  "active", "acquired", "merged", "closed", "deprecated", "archived",
] as const;
export type EntityStatus = (typeof ENTITY_STATUSES)[number];

export const IDENTIFIER_KINDS = [
  "website", "official_domain", "wikipedia", "crunchbase", "github", "huggingface",
  "linkedin", "x", "youtube", "developer_docs", "rss", "newsroom", "research",
  "api_docs", "documentation", "blog", "changelog", "press", "status_page",
  "discord", "other",
] as const;
export type IdentifierKind = (typeof IDENTIFIER_KINDS)[number];

// ── Normalization ──────────────────────────────────────────────────────────
/**
 * Canonical name normalization: NFKD accent-fold → lowercase → strip all
 * punctuation/hyphens/unicode to single spaces → collapse whitespace → trim.
 * Deterministic and idempotent. This is the key used for equality/dedup.
 */
export function normalizeEntityName(raw?: string | null): string {
  if (!raw || typeof raw !== "string") return "";
  return raw
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // strip combining diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** URL-safe slug derived from the normalized name. */
export function slugify(raw?: string | null): string {
  return normalizeEntityName(raw).replace(/\s+/g, "-");
}

// ── Validation ─────────────────────────────────────────────────────────────
export interface EntityInput {
  name: string;
  type?: string;
  aliases?: string[];
  website?: string | null;
  official_domain?: string | null;
  description?: string | null;
  short_description?: string | null;
  country?: string | null;
  headquarters?: string | null;
  founded_year?: number | null;
  status?: string | null;
  is_ai?: boolean;
  identifiers?: Array<{ kind: string; value: string }>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  // Cleaned/canonical values ready for DB write.
  clean: {
    name: string;
    normalized_name: string;
    slug: string;
    type: EntityType;
    website: string | null;
    official_domain: string | null;
    status: EntityStatus;
    founded_year: number | null;
    identifiers: Array<{ kind: IdentifierKind; value: string }>;
  } | null;
}

export function isValidType(t?: string | null): t is EntityType {
  return !!t && (ENTITY_TYPES as readonly string[]).includes(t);
}
export function isValidStatus(s?: string | null): s is EntityStatus {
  return !!s && (ENTITY_STATUSES as readonly string[]).includes(s);
}
export function isValidIdentifierKind(k?: string | null): k is IdentifierKind {
  return !!k && (IDENTIFIER_KINDS as readonly string[]).includes(k);
}

/** Validate + canonicalize an entity input into DB-ready values. */
export function validateEntity(input: EntityInput): ValidationResult {
  const errors: string[] = [];

  const name = (input.name ?? "").trim();
  if (name.length < 1) errors.push("name is required");
  if (name.length > 200) errors.push("name too long (>200)");

  const normalized_name = normalizeEntityName(name);
  if (!normalized_name) errors.push("name normalizes to empty");

  const type = (input.type ?? "company").trim();
  if (!isValidType(type)) errors.push(`invalid type "${type}"`);

  const status = (input.status ?? "active").trim();
  if (!isValidStatus(status)) errors.push(`invalid status "${status}"`);

  // Website / domain validated through the shared URL normalizer.
  let website: string | null = null;
  if (input.website) {
    website = normalizeUrl(input.website);
    if (!website) errors.push(`invalid website "${input.website}"`);
  }
  let official_domain: string | null = input.official_domain?.trim().toLowerCase().replace(/^www\./, "") || null;
  if (!official_domain && website) official_domain = domainOf(website) || null;
  if (official_domain && !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(official_domain)) {
    errors.push(`invalid official_domain "${official_domain}"`);
  }

  let founded_year: number | null = null;
  if (input.founded_year != null) {
    const y = Number(input.founded_year);
    if (!Number.isInteger(y) || y < 1800 || y > 2100) errors.push(`invalid founded_year "${input.founded_year}"`);
    else founded_year = y;
  }

  // Identifiers: validate kind + canonicalize URL-ish values.
  const identifiers: Array<{ kind: IdentifierKind; value: string }> = [];
  for (const id of input.identifiers ?? []) {
    if (!isValidIdentifierKind(id.kind)) { errors.push(`invalid identifier kind "${id.kind}"`); continue; }
    const raw = (id.value ?? "").trim();
    if (!raw) continue;
    // URL-typed kinds must be real URLs; handle-typed kinds (x) pass through.
    const urlKinds = new Set(["website", "wikipedia", "crunchbase", "github", "huggingface",
      "linkedin", "youtube", "developer_docs", "rss", "newsroom", "research", "api_docs",
      "documentation", "blog", "changelog", "press", "status_page", "discord"]);
    if (urlKinds.has(id.kind)) {
      const u = normalizeUrl(raw);
      if (!u) { errors.push(`identifier ${id.kind} has invalid URL "${raw}"`); continue; }
      identifiers.push({ kind: id.kind, value: u });
    } else {
      identifiers.push({ kind: id.kind, value: raw });
    }
  }

  const valid = errors.length === 0;
  return {
    valid,
    errors,
    clean: valid
      ? {
          name, normalized_name, slug: slugify(name), type: type as EntityType,
          website, official_domain, status: status as EntityStatus, founded_year, identifiers,
        }
      : null,
  };
}

// ── Deduplication scoring (mirror of SQL find_duplicate_entities weights) ────
/** Blend name similarity + shared domain + same type into a 0..1 confidence. */
export function dedupeConfidence(opts: {
  nameSimilarity: number; sharedDomain: boolean; sameType: boolean;
}): number {
  const base = 0.6 * clamp01(opts.nameSimilarity)
    + (opts.sharedDomain ? 0.35 : 0)
    + (opts.sameType ? 0.05 : 0);
  return Math.min(1, base);
}

/** Cheap Dice-coefficient bigram similarity for client-side pre-checks. */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeEntityName(a), nb = normalizeEntityName(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  const bg = (s: string) => {
    const out = new Set<string>();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  };
  const A = bg(na), B = bg(nb);
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size || 1);
}

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

// ── Import parsing (CSV / JSON → EntityInput[]) ──────────────────────────────
/** Parse a JSON array or a CSV string into EntityInput rows. */
export function parseImport(payload: unknown, format: "json" | "csv"): EntityInput[] {
  if (format === "json") {
    const arr = typeof payload === "string" ? JSON.parse(payload) : payload;
    if (!Array.isArray(arr)) throw new Error("JSON import must be an array");
    return arr.map(coerceRow);
  }
  return parseCsv(String(payload)).map(coerceRow);
}

function coerceRow(row: Record<string, unknown>): EntityInput {
  const aliases = row.aliases;
  return {
    name: String(row.name ?? row.canonical_name ?? "").trim(),
    type: row.type ? String(row.type) : undefined,
    website: row.website ? String(row.website) : null,
    official_domain: row.official_domain ? String(row.official_domain) : null,
    description: row.description ? String(row.description) : null,
    short_description: row.short_description ? String(row.short_description) : null,
    country: row.country ? String(row.country) : null,
    headquarters: row.headquarters ? String(row.headquarters) : null,
    founded_year: row.founded_year != null && row.founded_year !== "" ? Number(row.founded_year) : null,
    status: row.status ? String(row.status) : undefined,
    is_ai: row.is_ai == null ? undefined : (row.is_ai === true || row.is_ai === "true" || row.is_ai === 1),
    aliases: Array.isArray(aliases)
      ? aliases.map(String)
      : typeof aliases === "string" && aliases.trim()
        ? aliases.split(/[;|]/).map((s) => s.trim()).filter(Boolean)
        : [],
  };
}

/** Minimal RFC-4180-ish CSV parser (quoted fields, embedded commas/newlines). */
export function parseCsv(text: string): Array<Record<string, string>> {
  const rows: string[][] = [];
  let field = "", row: string[] = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') inQ = false;
      else field += c;
    } else if (c === '"') inQ = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && text[i + 1] === "\n") i++;
      row.push(field); field = "";
      if (row.some((f) => f !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length) { row.push(field); if (row.some((f) => f !== "")) rows.push(row); }
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim().toLowerCase());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    header.forEach((h, i) => (obj[h] = (r[i] ?? "").trim()));
    return obj;
  });
}
