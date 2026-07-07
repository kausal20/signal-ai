// Deterministic tests for Module 2 Source Quality. Runs under tsx/node.
// Run: npx tsx supabase/functions/_shared/source_quality.test.ts
import assert from "node:assert";
import { evaluateSource, domainOf } from "./source_quality.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

// 1. Official OpenAI blog → Very High (S+, official, high quality)
{
  const q = evaluateSource({ url: "https://openai.com/blog/gpt-5", source_label: "OpenAI", title: "GPT-5 rolls out advanced reasoning", summary: "New model release", source_count: 2 });
  assert.strictEqual(q.tier, "S+");
  assert.strictEqual(q.official, true);
  assert.ok(q.quality_score >= 80, `quality ${q.quality_score}`);
  assert.ok(q.reasoning.length > 0);
  ok("Official OpenAI blog → S+ / Very High");
}

// 2. Unknown blog → Low (D)
{
  const q = evaluateSource({ url: "https://random-ai-blog-9931.com/post", source_label: "random-ai-blog", title: "Some AI thoughts", summary: "", source_count: 1 });
  assert.strictEqual(q.tier, "D");
  assert.strictEqual(q.official, false);
  assert.ok(q.quality_score <= 45, `quality ${q.quality_score}`);
  assert.strictEqual(q.verification, "Unverified");
  ok("Unknown blog → D / Low / Unverified");
}

// 3. arXiv → High (S, deep, verified path)
{
  const q = evaluateSource({ url: "https://arxiv.org/abs/2501.01234", source_label: "arXiv", title: "A new benchmark for reasoning", summary: "research paper evaluation", source_count: 1 });
  assert.strictEqual(q.tier, "S");
  assert.ok(q.technical_depth >= 90, `depth ${q.technical_depth}`);
  assert.ok(q.quality_score >= 75, `quality ${q.quality_score}`);
  assert.strictEqual(q.original_reporting, "Original");
  ok("arXiv → S / High / deep");
}

// 4. Marketing landing page → bias reduces quality (Medium)
{
  const q = evaluateSource({ url: "https://acme.io/launch", source_label: "Acme", title: "Introducing our revolutionary game-changing AI — available now", summary: "Supercharge your workflow, unlock the power", source_count: 1 });
  assert.ok(q.bias_risk > 0, "bias detected");
  assert.strictEqual(q.original_reporting, "Marketing");
  assert.ok(q.quality_score < 55, `quality ${q.quality_score}`);
  ok("Marketing landing page → bias down, ~Medium/Low");
}

// 5. Corroboration: 3+ sources incl. trusted → Verified 92
{
  const q = evaluateSource({ url: "https://anthropic.com/news/claude", source_label: "Anthropic", title: "Claude update", summary: "", source_count: 3 });
  assert.strictEqual(q.verification, "Verified");
  assert.strictEqual(q.confidence, 92);
  ok("3+ sources incl. trusted → Verified / confidence 92");
}

// 6. Single unknown source → confidence reduced
{
  const q = evaluateSource({ url: "https://obscure-news.net/x", title: "Rumor about a model", source_count: 1 });
  assert.strictEqual(q.verification, "Unverified");
  assert.ok(q.confidence <= 45, `conf ${q.confidence}`);
  ok("Single unknown source → confidence reduced");
}

// 7. Spam demotes tier
{
  const q = evaluateSource({ url: "https://openai.com/x", source_label: "OpenAI", title: "10 shocking tips you won't believe — mind-blowing tricks", summary: "clickbait clickbait clickbait clickbait clickbait", source_count: 1 });
  assert.ok(q.spam_risk >= 40, `spam ${q.spam_risk}`);
  assert.notStrictEqual(q.tier, "S+"); // demoted from S+
  ok("High spam demotes tier");
}

// 8. Label fallback when url missing (Google-News republish → "Anthropic coverage")
{
  const q = evaluateSource({ source: "blog", source_label: "Anthropic coverage", title: "Claude gains computer use", source_count: 2 });
  assert.strictEqual(q.source_name, "Anthropic");
  assert.strictEqual(q.original_reporting, "Aggregated");
  ok("label fallback resolves publisher + Aggregated");
}

// 9. Determinism + output shape
{
  const inp = { url: "https://arxiv.org/abs/1", title: "x", summary: "y", source_count: 1 };
  const a = JSON.stringify(evaluateSource(inp));
  const b = JSON.stringify(evaluateSource(inp));
  assert.strictEqual(a, b);
  const q = evaluateSource(inp);
  for (const k of ["source_name","tier","quality_score","confidence","official","technical_depth","bias_risk","original_reporting","verification","spam_risk","update_frequency","reasoning"]) {
    assert.ok(k in q, `missing ${k}`);
  }
  ok("deterministic + full output shape");
}

// 10. domainOf strips www + subdomain preserved
{
  assert.strictEqual(domainOf("https://www.openai.com/blog"), "openai.com");
  assert.strictEqual(domainOf("https://research.google/pub"), "research.google");
  assert.strictEqual(domainOf("not a url"), "");
  ok("domainOf extraction");
}

console.log(`\n${passed} tests passed.`);
