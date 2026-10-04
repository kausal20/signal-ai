// Phase 3B — evidence-backed relationship extraction between already-resolved
// entities. Never invents entities (candidates must match the exact names of
// entities already linked to the article via link_article_entities) and never
// creates a relationship from names alone — every accepted candidate must
// carry a verbatim, in-article evidence quote. No deterministic fallback: if
// the AI provider is unavailable or content is too thin, this returns zero
// candidates rather than guessing (unlike entity_extract.ts's regex fallback,
// there is no safe non-semantic way to infer a *typed* relationship).

import { generateContent, isConfigured } from "./ai_provider.ts";

export const ALLOWED_RELATIONSHIP_TYPES = [
  "partnership", "acquisition", "competitor", "product_of", "works_at",
  "investor", "integration", "related", "owns", "develops", "depends_on",
] as const;
export type RelationshipType = (typeof ALLOWED_RELATIONSHIP_TYPES)[number];

export interface EntityRef {
  id: string;
  name: string;
  type: string;
}

export interface RawCandidate {
  from: unknown;
  to: unknown;
  type: unknown;
  confidence: unknown;
  evidence: unknown;
}

export interface ValidatedCandidate {
  fromId: string;
  fromName: string;
  toId: string;
  toName: string;
  type: RelationshipType;
  confidence: number;
  evidence: string;
}

export interface RejectedCandidate {
  raw: RawCandidate;
  reason: string;
}

export interface ArticleForRelationships {
  id: string;
  title: string;
  summary?: string | null;
  full_content?: string | null;
}

export interface RelationshipExtractionResult {
  candidatesRaw: RawCandidate[];
  accepted: ValidatedCandidate[];
  rejected: RejectedCandidate[];
  source: "ai" | "unavailable";
}

// Conservative thresholds: below AMBIGUOUS_FLOOR = "low_confidence" reject;
// between the floor and MIN_CONFIDENCE = "ambiguous" reject; only >= MIN_CONFIDENCE
// is accepted. When evidence is ambiguous, we do not create the relationship.
export const MIN_CONFIDENCE = 0.75;
export const AMBIGUOUS_FLOOR = 0.4;

export function normalizeForGrounding(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

/**
 * Pure validation — no network. Checks: allowed type, both endpoints resolve
 * to entities actually present in the supplied list (never invents one),
 * no self-reference, well-formed confidence within a conservative accept
 * band, and evidence that is a verbatim substring of the article text
 * (rejects paraphrased/hallucinated evidence).
 */
export function validateCandidate(
  raw: RawCandidate,
  entitiesByName: Map<string, EntityRef>,
  articleTextNormalized: string,
): { ok: true; value: ValidatedCandidate } | { ok: false; reason: string } {
  const type = typeof raw.type === "string" ? raw.type.trim() : "";
  if (!(ALLOWED_RELATIONSHIP_TYPES as readonly string[]).includes(type)) {
    return { ok: false, reason: `invalid_type:${type || "empty"}` };
  }

  const fromKey = typeof raw.from === "string" ? raw.from.trim().toLowerCase() : "";
  const toKey = typeof raw.to === "string" ? raw.to.trim().toLowerCase() : "";
  const fromEnt = entitiesByName.get(fromKey);
  const toEnt = entitiesByName.get(toKey);
  if (!fromEnt) return { ok: false, reason: "unknown_from_entity" };
  if (!toEnt) return { ok: false, reason: "unknown_to_entity" };
  if (fromEnt.id === toEnt.id) return { ok: false, reason: "self_reference" };

  const confidence = Number(raw.confidence);
  if (!Number.isFinite(confidence) || confidence < 0 || confidence > 1) {
    return { ok: false, reason: "invalid_confidence" };
  }

  const evidence = typeof raw.evidence === "string" ? raw.evidence.trim() : "";
  if (!evidence || evidence.length < 8) return { ok: false, reason: "missing_evidence" };

  const groundedEvidence = normalizeForGrounding(evidence);
  if (!articleTextNormalized.includes(groundedEvidence)) {
    return { ok: false, reason: "evidence_not_grounded" };
  }

  if (confidence < AMBIGUOUS_FLOOR) return { ok: false, reason: "low_confidence" };
  if (confidence < MIN_CONFIDENCE) return { ok: false, reason: "ambiguous" };

  return {
    ok: true,
    value: {
      fromId: fromEnt.id, fromName: fromEnt.name,
      toId: toEnt.id, toName: toEnt.name,
      type: type as RelationshipType, confidence, evidence,
    },
  };
}

const SYSTEM = `You are a relationship-extraction engine for an AI-industry knowledge graph.
You are given a news article and a list of named entities that are DEFINITELY present in it (already resolved — do not add, rename, or guess any other entity).

Identify factual relationships stated in the article BETWEEN PAIRS of entities from that exact list, using ONLY these relationship types:
partnership, acquisition, competitor, product_of, works_at, investor, integration, related, owns, develops, depends_on.

Direction convention (from -> to):
- owns: company -> product
- develops: company -> model
- product_of: product -> company (the product belongs to / was built by the company)
- works_at: person -> company
- depends_on: product -> framework
- acquisition: acquirer -> acquired
- partnership, competitor, investor, integration, related: direction is not meaningful; report either valid order.

Rules:
- Use entity names EXACTLY as given in the list — copy them verbatim, never invent an entity not in the list.
- Only report a relationship the article explicitly states. Never infer from general/outside knowledge, never guess from names alone.
- "evidence" MUST be an exact verbatim quote copied character-for-character from the article text (not a paraphrase or summary) that supports the relationship.
- "confidence": 0..1, how clearly and directly the article states this specific relationship.
- If nothing in the article clearly supports a relationship between two listed entities, omit it. Empty array if none qualify.

Output a single JSON object exactly:
{"relationships":[{"from":"","to":"","type":"","confidence":0,"evidence":""}]}`;

/**
 * Extract relationship candidates for one article. Returns raw model output
 * plus the accepted/rejected split from validateCandidate. Never throws;
 * returns an empty/"unavailable" result on any provider or parsing failure.
 */
export async function extractRelationships(
  article: ArticleForRelationships,
  entities: EntityRef[],
): Promise<RelationshipExtractionResult> {
  const empty = (source: "ai" | "unavailable"): RelationshipExtractionResult =>
    ({ candidatesRaw: [], accepted: [], rejected: [], source });

  if (entities.length < 2) return empty("unavailable");
  if (!isConfigured()) return empty("unavailable");

  const text = [article.title, article.summary, article.full_content]
    .filter(Boolean).join(". ").slice(0, 6000);
  if (!text.trim()) return empty("unavailable");

  const entityList = entities.map((e) => `"${e.name}" (${e.type})`).join(", ");

  try {
    const res = await generateContent<Record<string, unknown>>({
      feature: "relationship-extract",
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{
        role: "user",
        parts: [{ text: `ENTITIES (only use these names, exactly as written): ${entityList}\n\nARTICLE:\n${text}` }],
      }],
      generationConfig: { temperature: 0, maxOutputTokens: 900, responseMimeType: "application/json" },
      timeoutMs: 25_000,
    });
    if (!res.success || !res.data || typeof res.data !== "object") return empty("unavailable");

    const d = res.data as Record<string, unknown>;
    const raw = Array.isArray(d.relationships) ? (d.relationships as RawCandidate[]) : [];

    const entitiesByName = new Map<string, EntityRef>();
    for (const e of entities) entitiesByName.set(e.name.trim().toLowerCase(), e);
    const articleTextNormalized = normalizeForGrounding(text);

    const accepted: ValidatedCandidate[] = [];
    const rejected: RejectedCandidate[] = [];
    for (const c of raw) {
      const v = validateCandidate(c, entitiesByName, articleTextNormalized);
      if (v.ok) accepted.push(v.value); else rejected.push({ raw: c, reason: v.reason });
    }
    return { candidatesRaw: raw, accepted, rejected, source: "ai" };
  } catch {
    return empty("unavailable");
  }
}
