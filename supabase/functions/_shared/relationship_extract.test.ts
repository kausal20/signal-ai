// Deno tests for the Phase 3B relationship-extraction validation layer.
// Pure/offline: exercises validateCandidate() only — no network, no LLM call.
// The extraction→validation→write→dedup path end-to-end is covered by the
// live SQL checks in supabase/tests/knowledge_graph_regression.sql (write
// path) plus manual sample-batch runs (extraction path); this file locks
// down the pure decision logic in between.
//
// Run: deno test supabase/functions/_shared/relationship_extract.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  validateCandidate, normalizeForGrounding, ALLOWED_RELATIONSHIP_TYPES,
  MIN_CONFIDENCE, AMBIGUOUS_FLOOR, type EntityRef, type RawCandidate,
} from "./relationship_extract.ts";

const CO: EntityRef = { id: "co-1", name: "OpenAI", type: "company" };
const PRODUCT: EntityRef = { id: "prod-1", name: "ChatGPT", type: "product" };
const OTHER: EntityRef = { id: "co-2", name: "Anthropic", type: "company" };

function names(...entities: EntityRef[]): Map<string, EntityRef> {
  const m = new Map<string, EntityRef>();
  for (const e of entities) m.set(e.name.toLowerCase(), e);
  return m;
}

const ARTICLE_TEXT = normalizeForGrounding(
  "OpenAI today announced that it owns and operates ChatGPT, its flagship consumer product. " +
  "Meanwhile Anthropic remains a fierce competitor in the space."
);

function candidate(overrides: Partial<RawCandidate> = {}): RawCandidate {
  return {
    from: "OpenAI", to: "ChatGPT", type: "owns", confidence: 0.9,
    evidence: "it owns and operates ChatGPT, its flagship consumer product",
    ...overrides,
  };
}

Deno.test("accepts a well-formed, grounded, high-confidence candidate", () => {
  const r = validateCandidate(candidate(), names(CO, PRODUCT, OTHER), ARTICLE_TEXT);
  assert(r.ok);
  if (r.ok) {
    assertEquals(r.value.fromId, "co-1");
    assertEquals(r.value.toId, "prod-1");
    assertEquals(r.value.type, "owns");
  }
});

Deno.test("rejects a relationship type outside the approved taxonomy", () => {
  const r = validateCandidate(candidate({ type: "rumored_to_like" }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r.ok);
  if (!r.ok) assert(r.reason.startsWith("invalid_type"));
});

Deno.test("every ALLOWED_RELATIONSHIP_TYPES entry is individually accepted", () => {
  for (const type of ALLOWED_RELATIONSHIP_TYPES) {
    const r = validateCandidate(candidate({ type }), names(CO, PRODUCT), ARTICLE_TEXT);
    assert(r.ok, `expected type "${type}" to be accepted`);
  }
});

Deno.test("rejects an entity name not in the resolved list (never invents entities)", () => {
  const r1 = validateCandidate(candidate({ from: "Some Random Startup" }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r1.ok);
  if (!r1.ok) assertEquals(r1.reason, "unknown_from_entity");

  const r2 = validateCandidate(candidate({ to: "Some Random Startup" }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r2.ok);
  if (!r2.ok) assertEquals(r2.reason, "unknown_to_entity");
});

Deno.test("rejects self-referential candidates", () => {
  const r = validateCandidate(candidate({ from: "OpenAI", to: "OpenAI" }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "self_reference");
});

Deno.test("rejects malformed confidence (non-numeric, out of range)", () => {
  const r1 = validateCandidate(candidate({ confidence: "high" }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r1.ok);
  if (!r1.ok) assertEquals(r1.reason, "invalid_confidence");

  const r2 = validateCandidate(candidate({ confidence: 1.5 }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r2.ok);
  if (!r2.ok) assertEquals(r2.reason, "invalid_confidence");
});

Deno.test("rejects missing or trivially short evidence", () => {
  const r1 = validateCandidate(candidate({ evidence: "" }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r1.ok);
  if (!r1.ok) assertEquals(r1.reason, "missing_evidence");

  const r2 = validateCandidate(candidate({ evidence: "yes" }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r2.ok);
  if (!r2.ok) assertEquals(r2.reason, "missing_evidence");
});

Deno.test("rejects evidence that is not a verbatim quote from the article (hallucination guard)", () => {
  const r = validateCandidate(
    candidate({ evidence: "OpenAI completely dominates the entire AI industry worldwide" }),
    names(CO, PRODUCT), ARTICLE_TEXT,
  );
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "evidence_not_grounded");
});

Deno.test("rejects low-confidence candidates (never creates from ambiguous evidence)", () => {
  const r = validateCandidate(candidate({ confidence: 0.2 }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "low_confidence");
});

Deno.test("rejects ambiguous mid-band confidence (between floor and accept threshold)", () => {
  const mid = (AMBIGUOUS_FLOOR + MIN_CONFIDENCE) / 2;
  const r = validateCandidate(candidate({ confidence: mid }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(!r.ok);
  if (!r.ok) assertEquals(r.reason, "ambiguous");
});

Deno.test("accepts exactly at the MIN_CONFIDENCE threshold", () => {
  const r = validateCandidate(candidate({ confidence: MIN_CONFIDENCE }), names(CO, PRODUCT), ARTICLE_TEXT);
  assert(r.ok);
});

Deno.test("name matching is case-insensitive and trims whitespace", () => {
  const r = validateCandidate(
    candidate({ from: "  openai  ", to: "CHATGPT" }),
    names(CO, PRODUCT), ARTICLE_TEXT,
  );
  assert(r.ok);
});

Deno.test("grounding check normalizes whitespace but requires the real substring", () => {
  const r = validateCandidate(
    candidate({ evidence: "it   owns   and operates ChatGPT,\nits flagship consumer product" }),
    names(CO, PRODUCT), ARTICLE_TEXT,
  );
  assert(r.ok);
});

Deno.test("competitor relationship extracted between two companies", () => {
  const r = validateCandidate(
    { from: "OpenAI", to: "Anthropic", type: "competitor", confidence: 0.85, evidence: "Anthropic remains a fierce competitor in the space" },
    names(CO, PRODUCT, OTHER), ARTICLE_TEXT,
  );
  assert(r.ok);
  if (r.ok) assertEquals(r.value.type, "competitor");
});
