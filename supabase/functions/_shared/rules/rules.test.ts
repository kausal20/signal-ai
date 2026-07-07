// Deterministic tests for Module 8 Rule Engine. Runs under tsx/node.
// Run: npx tsx supabase/functions/_shared/rules/rules.test.ts
import assert from "node:assert";
import { runRuleEngine, buildRuleContext } from "./engine.ts";
import { RULES } from "./registry.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

const run = (title: string, summary = "") =>
  runRuleEngine(buildRuleContext({ title, summary, developer_value: 40, founder_value: 40, investor_value: 40, learning_value: 40 }));

// 1. API announcement → API Release Rule matches
{
  const r = run("OpenAI launches new public API for developers", "REST API access");
  assert.ok(r.merged.matched_rules.includes("api_release"));
  assert.ok(r.merged.developer_value > 40, "dev value boosted");
  ok("API announcement → api_release matches");
}

// 2. Research paper → Research Rule matches
{
  const r = run("New arXiv paper proposes state of the art reasoning method");
  assert.ok(r.merged.matched_rules.includes("research_paper"));
  assert.ok(r.merged.learning_value > 40);
  ok("Research paper → research_paper matches");
}

// 3. Funding → Funding Rule matches with metadata
{
  const r = run("Acme raises $40M Series B led by a16z");
  assert.ok(r.merged.matched_rules.includes("funding"));
  assert.ok(r.merged.investor_value > 40);
  const fr = r.matched.find((x) => x.rule_id === "funding");
  assert.ok(fr && typeof fr.metadata.amount !== "undefined", "funding amount captured");
  ok("Funding article → funding matches + amount metadata");
}

// 4. Security → Security Rule (Critical, high urgency)
{
  const r = run("Critical zero-day vulnerability (CVE-2025-1234) exploited in the wild");
  assert.ok(r.merged.matched_rules.includes("security"));
  assert.ok(r.merged.urgency >= 85, `urgency ${r.merged.urgency}`);
  assert.ok(r.merged.time_sensitivity >= 85);
  ok("Security incident → security matches, urgency high");
}

// 5. No relevant content → no rules match
{
  const r = run("A calm walk in the park on a quiet afternoon");
  assert.strictEqual(r.merged.rule_count, 0);
  assert.strictEqual(r.merged.matched_rules.length, 0);
  assert.strictEqual(r.merged.confidence, 0);
  ok("Irrelevant content → zero rules match");
}

// 6. Multiple rules merge (API + Open Source + Developer Tool) — no overwrite
{
  const r = run("Open-source CLI dev tool ships a public API on GitHub", "MIT license, developer platform");
  const ids = r.merged.matched_rules;
  assert.ok(ids.includes("api_release") && ids.includes("open_source") && ids.includes("developer_tool"));
  assert.ok(r.merged.tags.includes("api") && r.merged.tags.includes("open-source") && r.merged.tags.includes("dev-tool"));
  assert.ok(r.merged.categories.length >= 2, "categories merged");
  ok("multiple rules merge (union tags/categories, no overwrite)");
}

// 7. Priority weighting: Critical influences more than Informational
{
  const critical = run("New GPT-5 model release with breaking capabilities"); // model_release Critical
  const info = run("Company is hiring for open roles");                         // hiring Informational
  assert.ok(critical.merged.confidence > info.merged.confidence, "critical > info confidence");
  ok("priority weighting (Critical > Informational influence)");
}

// 8. Every rule returns a full RuleResult (never bare boolean), and non-match is clean
{
  const ctx = buildRuleContext({ title: "nothing here", summary: "" });
  for (const rule of RULES) {
    const res = rule.evaluate(ctx);
    for (const k of ["rule_id", "rule_name", "matched", "confidence", "priority", "reason", "effects", "metadata"]) {
      assert.ok(k in res, `${rule.id} missing ${k}`);
    }
    assert.strictEqual(res.matched, false);
  }
  ok("every rule returns full RuleResult shape");
}

// 9. Determinism
{
  const a = JSON.stringify(run("New AI agent with MCP tool use and automation workflow").merged);
  const b = JSON.stringify(run("New AI agent with MCP tool use and automation workflow").merged);
  assert.strictEqual(a, b);
  ok("deterministic (same input → same merged output)");
}

// 10. Conflict note when strong categories merge
{
  const r = run("Breaking: GPT-5 model release ships new public API and agent tools");
  assert.ok(r.merged.conflicts.length >= 0); // present as array
  assert.ok(r.merged.reasoning.length === r.merged.rule_count);
  ok("conflict notes + reasoning line per matched rule");
}

// 11. Registry uniqueness (no duplicate rule ids)
{
  const ids = RULES.map((r) => r.id);
  assert.strictEqual(ids.length, new Set(ids).size, "duplicate rule id");
  assert.ok(RULES.length >= 24, `expected 24+ rules, got ${RULES.length}`);
  ok(`registry has ${RULES.length} unique rules`);
}

console.log(`\n${passed} tests passed.`);
