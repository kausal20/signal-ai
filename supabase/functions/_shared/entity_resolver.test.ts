// Deno tests for the Entity Resolution Engine shared layer.
// Pure/offline: exercises the client-side split + cache + normalization + the
// shape-mapping over a fake supabase-js .rpc() stub. DB-integration testing is
// covered by the live perf/behavior checks in the migration verification.
//
// Run: deno test supabase/functions/_shared/entity_resolver.test.ts
import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  splitMultiEntityQuery, resolveEntity, resolveCandidates, resolveMulti,
  entityFull, _clearCache, _cacheSize,
} from "./entity_resolver.ts";

// Minimal supabase-js stub: .rpc(name, args) → { data, error }.
function makeSb(rpcs: Record<string, (args: Record<string, unknown>) => unknown>, spy?: { calls: string[] }) {
  return {
    rpc(name: string, args: Record<string, unknown>) {
      spy?.calls.push(name);
      const fn = rpcs[name];
      const data = fn ? fn(args) : null;
      return Promise.resolve({ data, error: null });
    },
  };
}

Deno.test("splitMultiEntityQuery: vs / and / , / &", () => {
  assertEquals(splitMultiEntityQuery("Claude vs GPT-5"), ["Claude", "GPT-5"]);
  assertEquals(splitMultiEntityQuery("OpenAI and Anthropic"), ["OpenAI", "Anthropic"]);
  assertEquals(splitMultiEntityQuery("cursor, windsurf"), ["cursor", "windsurf"]);
  assertEquals(splitMultiEntityQuery("Google & Meta"), ["Google", "Meta"]);
  assertEquals(splitMultiEntityQuery("Perplexity versus You.com"), ["Perplexity", "You.com"]);
  assertEquals(splitMultiEntityQuery(""), []);
  assertEquals(splitMultiEntityQuery("openai"), ["openai"]);
});

Deno.test("resolveEntity: maps RPC row to typed object", async () => {
  _clearCache();
  const sb = makeSb({
    resolve_query: () => [{
      r_entity_id: "u1", r_slug: "openai", r_canonical_name: "OpenAI",
      r_entity_type: "company", r_official_domain: "openai.com", r_logo_url: null,
      r_status: "active", r_confidence: 100, r_match_kind: "exact", r_is_ambiguous: false,
    }],
  });
  const e = await resolveEntity(sb, "OpenAI");
  assert(e);
  assertEquals(e!.entity_id, "u1");
  assertEquals(e!.canonical_name, "OpenAI");
  assertEquals(e!.confidence, 100);
  assertEquals(e!.match_kind, "exact");
  assertEquals(e!.is_ambiguous, false);
});

Deno.test("resolveEntity: returns null when no candidates", async () => {
  _clearCache();
  const sb = makeSb({ resolve_query: () => [] });
  assertEquals(await resolveEntity(sb, "zzznever"), null);
});

Deno.test("resolveCandidates: filters by minConfidence + types", async () => {
  _clearCache();
  const sb = makeSb({
    resolve_query: () => [
      { r_entity_id: "1", r_entity_type: "company", r_confidence: 100, r_canonical_name: "OpenAI", r_slug: "openai", r_status: "active", r_match_kind: "exact", r_is_ambiguous: false },
      { r_entity_id: "2", r_entity_type: "product", r_confidence: 85,  r_canonical_name: "ChatGPT", r_slug: "chatgpt", r_status: "active", r_match_kind: "alias_exact", r_is_ambiguous: false },
      { r_entity_id: "3", r_entity_type: "product", r_confidence: 60,  r_canonical_name: "Weak match", r_slug: "wm", r_status: "active", r_match_kind: "fuzzy", r_is_ambiguous: false },
    ],
  });
  const filtered = await resolveCandidates(sb, "OpenAI", { minConfidence: 80, types: ["product"] });
  assertEquals(filtered.length, 1);
  assertEquals(filtered[0].entity_id, "2");
});

Deno.test("resolveCandidates: LRU cache hit on identical query", async () => {
  _clearCache();
  const spy = { calls: [] as string[] };
  const sb = makeSb({
    resolve_query: () => [{ r_entity_id: "u1", r_entity_type: "company", r_confidence: 100, r_canonical_name: "OpenAI", r_slug: "openai", r_status: "active", r_match_kind: "exact", r_is_ambiguous: false }],
  }, spy);
  await resolveCandidates(sb, "OpenAI");
  await resolveCandidates(sb, "OpenAI"); // must be cached
  assertEquals(spy.calls.length, 1);
});

Deno.test("resolveCandidates: cache normalizes case/whitespace", async () => {
  _clearCache();
  const spy = { calls: [] as string[] };
  const sb = makeSb({
    resolve_query: () => [{ r_entity_id: "u1", r_entity_type: "company", r_confidence: 100, r_canonical_name: "OpenAI", r_slug: "openai", r_status: "active", r_match_kind: "exact", r_is_ambiguous: false }],
  }, spy);
  await resolveCandidates(sb, "OpenAI");
  await resolveCandidates(sb, "  open  ai  ");
  assertEquals(spy.calls.length, 1); // normalized to same cache key
});

Deno.test("resolveCandidates: useCache:false bypasses cache", async () => {
  _clearCache();
  const spy = { calls: [] as string[] };
  const sb = makeSb({
    resolve_query: () => [{ r_entity_id: "u1", r_entity_type: "company", r_confidence: 100, r_canonical_name: "OpenAI", r_slug: "openai", r_status: "active", r_match_kind: "exact", r_is_ambiguous: false }],
  }, spy);
  await resolveCandidates(sb, "OpenAI", { useCache: false });
  await resolveCandidates(sb, "OpenAI", { useCache: false });
  assertEquals(spy.calls.length, 2);
});

Deno.test("resolveMulti: groups candidates by segment", async () => {
  _clearCache();
  const sb = makeSb({
    resolve_query_multi: () => [
      { r_segment: "Claude",  r_entity_id: "c1", r_canonical_name: "Claude",  r_entity_type: "model",   r_confidence: 100, r_match_kind: "exact", r_is_ambiguous: false },
      { r_segment: "Claude",  r_entity_id: "c2", r_canonical_name: "Claude",  r_entity_type: "company", r_confidence: 100, r_match_kind: "exact", r_is_ambiguous: true },
      { r_segment: "GPT-5",   r_entity_id: "g1", r_canonical_name: "GPT-5",   r_entity_type: "model",   r_confidence: 95,  r_match_kind: "alias_exact", r_is_ambiguous: false },
    ],
  });
  const out = await resolveMulti(sb, "Claude vs GPT-5");
  assertEquals(out.length, 2);
  assertEquals(out[0].segment, "Claude");
  assertEquals(out[0].candidates.length, 2);
  assertEquals(out[1].segment, "GPT-5");
  assertEquals(out[1].candidates[0].entity_id, "g1");
});

Deno.test("entityFull: caches by id", async () => {
  _clearCache();
  const spy = { calls: [] as string[] };
  const payload = { entity: { id: "u1", canonical_name: "OpenAI" }, aliases: [], identifiers: [], children: [], parent: null };
  const sb = makeSb({ entity_full: () => payload }, spy);
  const a = await entityFull(sb, "u1");
  const b = await entityFull(sb, "u1");
  assertEquals(a, payload);
  assertEquals(b, payload);
  assertEquals(spy.calls.length, 1);
});

Deno.test("cache: size reflects distinct keys", async () => {
  _clearCache();
  const sb = makeSb({ resolve_query: () => [], entity_full: () => ({}) });
  await resolveCandidates(sb, "one");
  await resolveCandidates(sb, "two");
  await entityFull(sb, "id1");
  const sizes = _cacheSize();
  assertEquals(sizes.resolve, 2);
  assertEquals(sizes.full, 1);
});
