// Deno tests for the Master Entity Registry shared layer.
// Run: deno test supabase/functions/_shared/entity_registry.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  normalizeEntityName, slugify, validateEntity, dedupeConfidence,
  nameSimilarity, parseImport, parseCsv, isValidType,
} from "./entity_registry.ts";

Deno.test("normalize: case, whitespace, punctuation, hyphens", () => {
  assertEquals(normalizeEntityName("  OpenAI  "), "openai");
  assertEquals(normalizeEntityName("Open-AI"), "open ai");
  assertEquals(normalizeEntityName("OpenAI, Inc."), "openai inc");
  assertEquals(normalizeEntityName("GPT‑5"), "gpt 5"); // unicode hyphen
});

Deno.test("normalize: unicode accent folding (NFKD)", () => {
  assertEquals(normalizeEntityName("Café"), "cafe");
  assertEquals(normalizeEntityName("Misträl"), "mistral");
});

Deno.test("normalize: idempotent", () => {
  const once = normalizeEntityName("Google DeepMind!!");
  assertEquals(normalizeEntityName(once), once);
});

Deno.test("slugify", () => {
  assertEquals(slugify("Google DeepMind"), "google-deepmind");
  assertEquals(slugify("GPT-4o"), "gpt-4o");
});

Deno.test("validate: rejects bad type / status / website", () => {
  const bad = validateEntity({ name: "X", type: "not_a_type" });
  assert(!bad.valid);
  assert(bad.errors.some((e) => e.includes("invalid type")));

  const badUrl = validateEntity({ name: "OpenAI", website: "not a url" });
  assert(!badUrl.valid);

  const badYear = validateEntity({ name: "OpenAI", founded_year: 1500 });
  assert(!badYear.valid);
});

Deno.test("validate: derives domain from website; canonicalizes", () => {
  const v = validateEntity({ name: "OpenAI", website: "http://www.openai.com/blog?utm_source=x" });
  assert(v.valid);
  assertEquals(v.clean!.official_domain, "openai.com");
  assert(v.clean!.website!.startsWith("http")); // normalized, utm stripped
  assert(!v.clean!.website!.includes("utm_"));
});

Deno.test("validate: identifiers — url kinds must be URLs, handle kinds pass", () => {
  const v = validateEntity({
    name: "OpenAI",
    identifiers: [
      { kind: "github", value: "https://github.com/openai" },
      { kind: "x", value: "@openai" },
      { kind: "wikipedia", value: "not-a-url" },
    ],
  });
  assert(!v.valid); // the bad wikipedia URL fails validation
  assert(v.errors.some((e) => e.includes("wikipedia")));
});

Deno.test("validate: rejects google-redirect website (shared url rules)", () => {
  const v = validateEntity({ name: "OpenAI", website: "https://news.google.com/rss/articles/abc" });
  assert(!v.valid);
});

Deno.test("dedupe confidence weighting", () => {
  const high = dedupeConfidence({ nameSimilarity: 1, sharedDomain: true, sameType: true });
  assertEquals(high, 1);
  const low = dedupeConfidence({ nameSimilarity: 0.5, sharedDomain: false, sameType: false });
  assertEquals(Math.round(low * 100) / 100, 0.3);
});

Deno.test("nameSimilarity: identical vs distinct", () => {
  assertEquals(nameSimilarity("OpenAI", "open ai"), 1); // normalize to same
  assert(nameSimilarity("OpenAI", "Anthropic") < 0.3);
  assert(nameSimilarity("Large Language Model", "Large Language Models") > 0.8);
});

Deno.test("isValidType covers new MER types", () => {
  assert(isValidType("dataset"));
  assert(isValidType("cloud_provider"));
  assert(isValidType("research_paper"));
  assert(!isValidType("banana"));
});

Deno.test("import: JSON array", () => {
  const rows = parseImport(
    JSON.stringify([{ name: "OpenAI", type: "company", aliases: ["Open AI", "OpenAI Inc"] }]),
    "json",
  );
  assertEquals(rows.length, 1);
  assertEquals(rows[0].aliases, ["Open AI", "OpenAI Inc"]);
});

Deno.test("import: CSV with quoted fields + pipe aliases", () => {
  const csv = 'name,type,aliases\n"Moonshot AI",company,"Moonshot|Kimi Company"\n"Groq",company,\n';
  const rows = parseImport(csv, "csv");
  assertEquals(rows.length, 2);
  assertEquals(rows[0].name, "Moonshot AI");
  assertEquals(rows[0].aliases, ["Moonshot", "Kimi Company"]);
  assertEquals(rows[1].name, "Groq");
});

Deno.test("parseCsv: embedded comma inside quotes", () => {
  const rows = parseCsv('name,description\n"OpenAI","Maker of GPT, DALL-E"\n');
  assertEquals(rows[0].description, "Maker of GPT, DALL-E");
});
