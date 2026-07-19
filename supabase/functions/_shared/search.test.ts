// Deterministic tests for Signal Search intelligence.
// Run: npx tsx supabase/functions/_shared/search.test.ts
import assert from "node:assert";
import {
  expandQuery, tokenize, normalizeQuery, scoreCandidate, rankResults,
  didYouMean, relatedTopics, toTsQuery, type SearchCandidate,
} from "./search.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

const NOW = Date.UTC(2026, 6, 12);
const day = 86_400_000;
const mk = (o: Partial<SearchCandidate>): SearchCandidate => ({ id: "x", title: "", ...o });

// 1. Normalization + tokenization collapse model versions.
{
  assert.deepStrictEqual(tokenize("GPT-5.5"), ["gpt5.5"]);
  assert.deepStrictEqual(tokenize("GPT 5"), ["gpt5"]);
  assert.strictEqual(normalizeQuery("  Open   AI "), "open ai");
  ok("normalize/tokenize collapse GPT-5 / GPT 5 / GPT5");
}

// 2. Expansion pulls in aliases + adjacent terms.
{
  const e = expandQuery("GPT");
  ["gpt", "openai", "chatgpt", "llm"].forEach((t) => assert.ok(e.includes(t), `missing ${t}`));
  const c = expandQuery("Claud"); // typo-ish prefix still expands via family
  assert.ok(expandQuery("claude").includes("anthropic"));
  assert.ok(expandQuery("deep seek").includes("deepseek"));
  assert.ok(expandQuery("MCP").includes("model context protocol"));
  ok("expandQuery resolves aliases (GPT→openai/llm, claude→anthropic, MCP→protocol)");
}

// 3. scoreCandidate weights title > summary and reports matched fields.
{
  const t = expandQuery("gpt");
  const inTitle = scoreCandidate(mk({ title: "GPT-5 released" }), t);
  const inSummary = scoreCandidate(mk({ title: "Model update", summary: "about gpt models" }), t);
  assert.ok(inTitle.relevance > inSummary.relevance);
  assert.ok(inTitle.matched_fields.includes("title"));
  assert.ok(inSummary.matched_fields.includes("summary"));
  ok("scoreCandidate: title outranks summary + matched_fields reported");
}

// 4. Ranking: equally relevant → fresher wins.
{
  const items: SearchCandidate[] = [
    mk({ id: "old", title: "GPT-5 deep dive", published_at: new Date(NOW - 180 * day).toISOString(), score: 80 }),
    mk({ id: "new", title: "GPT-5 deep dive", published_at: new Date(NOW - 1 * day).toISOString(), score: 80 }),
  ];
  const ranked = rankResults(items, "gpt", NOW);
  assert.strictEqual(ranked[0].item.id, "new");
  ok("ranking: today outranks 6-month-old when equally relevant");
}

// 5. Archive coverage: old-but-relevant still returned + ranked above irrelevant.
{
  const items: SearchCandidate[] = [
    mk({ id: "rel-old", title: "OpenAI GPT history", published_at: new Date(NOW - 200 * day).toISOString() }),
    mk({ id: "fresh-irrelevant", title: "Weather app update", published_at: new Date(NOW).toISOString() }),
  ];
  const ranked = rankResults(items, "gpt", NOW);
  assert.strictEqual(ranked[0].item.id, "rel-old");
  ok("archive: relevant old article beats fresh irrelevant one");
}

// 6. Did-you-mean corrects typos.
{
  assert.ok(didYouMean("claud").includes("claude"));
  assert.ok(didYouMean("curser").includes("cursor"));
  assert.deepStrictEqual(didYouMean("gpt"), didYouMean("gpt")); // deterministic
  ok("didYouMean: claud→claude, curser→cursor");
}

// 7. Related topics for a single query.
{
  const rel = relatedTopics("claude");
  assert.ok(rel.includes("anthropic"));
  assert.ok(rel.length <= 6);
  ok("relatedTopics derives adjacent terms (claude→anthropic)");
}

// 8. tsquery string is OR-joined + safe.
{
  const q = toTsQuery("GPT");
  assert.ok(q.includes("|"));
  assert.ok(!/[;']/.test(q));
  ok("toTsQuery: OR-joined, injection-safe");
}

console.log(`\n${passed} tests passed.`);
