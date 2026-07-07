// Deterministic tests for Module 4 Opportunity Engine. Runs under tsx/node.
// Run: npx tsx supabase/functions/_shared/opportunity.test.ts
import assert from "node:assert";
import { generateOpportunity, personalizeOpportunity, type OpportunityInput } from "./opportunity.ts";
import { runRuleEngine, buildRuleContext } from "./rules/engine.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

// Build a realistic input by running the REAL Module 8 engine (no rule dup).
function inputFrom(title: string, over: Partial<OpportunityInput> = {}): OpportunityInput {
  const re = runRuleEngine(buildRuleContext({ title, summary: "", developer_value: 40, founder_value: 40, investor_value: 40, learning_value: 40 }));
  return {
    id: "story_x", title, summary: "s", why_it_matters: "w", score: 88,
    rule_intelligence: re.merged, matched_rules: re.merged.matched_rules,
    source_quality: { tier: "S+", source_name: "OpenAI", confidence: 80, official: true, spam_risk: 0 },
    ...over,
  };
}

// 1. Open-source API → Developer-facing opportunity
{
  const o = generateOpportunity(inputFrom("Open-source public API released on GitHub with MIT license"));
  assert.ok(o, "opportunity produced");
  assert.ok(o!.who_should_act.includes("Developer"));
  assert.ok(["API Release", "Open Source Project", "Developer Opportunity", "Tool Opportunity"].includes(o!.type));
  ok("Open-source API → Developer opportunity");
}

// 2. Funding announcement → Founder/Investor opportunity
{
  const o = generateOpportunity(inputFrom("Acme raises $40M Series B led by a16z"));
  assert.ok(o);
  assert.strictEqual(o!.type, "Startup Opportunity");
  assert.ok(o!.who_should_act.includes("Founder") || o!.who_should_act.includes("Investor"));
  ok("Funding → Startup/Founder opportunity");
}

// 3. Research paper → Learning opportunity
{
  const o = generateOpportunity(inputFrom("New arXiv paper proposes state of the art reasoning"));
  assert.ok(o);
  assert.ok(["Research Breakthrough", "Learning Opportunity"].includes(o!.type));
  assert.ok(o!.who_should_act.includes("Student") || o!.who_should_act.includes("Researcher"));
  ok("Research paper → Learning opportunity");
}

// 4. Security vulnerability → Immediate action
{
  const o = generateOpportunity(inputFrom("Critical zero-day vulnerability CVE-2025-1234 exploited"));
  assert.ok(o);
  assert.strictEqual(o!.type, "Security Opportunity");
  assert.strictEqual(o!.time_window, "Immediate");
  assert.ok(o!.urgency >= 85);
  ok("Security vuln → Immediate action");
}

// 5. No opportunity → no output (null)
{
  const o = generateOpportunity(inputFrom("A calm walk in the park"));
  assert.strictEqual(o, null);
  ok("no rules matched → null (no output)");
}

// 6. Weak signal → no output even if a rule matches
{
  const o = generateOpportunity(inputFrom("Some tutorial on basics", { score: 40 }));
  assert.strictEqual(o, null);
  ok("score < 50 → null");
}

// 7. Full output shape
{
  const o = generateOpportunity(inputFrom("OpenAI ships new model API and agent tools"))!;
  for (const k of ["id","type","title","summary","why_it_matters","who_should_act","recommended_action","urgency","difficulty","time_window","estimated_effort","business_value","developer_value","founder_value","investor_value","learning_value","risk","confidence","required_skills","recommended_resources","reasoning","related_rules"]) {
    assert.ok(k in o, `missing ${k}`);
  }
  for (const k of ["action","priority","estimated_time","difficulty","expected_value"]) assert.ok(k in o.recommended_action, `action.${k}`);
  for (const k of ["technical","business","execution","market","confidence"]) assert.ok(k in o.risk, `risk.${k}`);
  ok("full Opportunity output shape");
}

// 8. Determinism
{
  const a = JSON.stringify(generateOpportunity(inputFrom("New AI agent with MCP tool use")));
  const b = JSON.stringify(generateOpportunity(inputFrom("New AI agent with MCP tool use")));
  assert.strictEqual(a, b);
  ok("deterministic (same input → same opportunity)");
}

// 9. Personalization reframes for persona (read-time, over cached opp)
{
  const o = generateOpportunity(inputFrom("New developer tool CLI with public API"))!;
  const dev = personalizeOpportunity(o, "Developer");
  const inv = personalizeOpportunity(o, "Investor");
  assert.strictEqual(dev.who_should_act[0], "Developer");
  assert.notStrictEqual(dev.recommended_action.priority === inv.recommended_action.priority && dev.reasoning.length === o.reasoning.length, true);
  assert.ok(dev.reasoning.some((r) => /Personalized for Developer/.test(r)));
  // pure: does not mutate the cached opportunity
  assert.ok(o.reasoning.every((r) => !/Personalized/.test(r)));
  ok("personalization reframes per persona (pure, cached-safe)");
}

// 10. reasoning explains itself (rules, source, score, audience, time)
{
  const o = generateOpportunity(inputFrom("Anthropic launches Claude model API"))!;
  const joined = o.reasoning.join(" | ");
  assert.ok(/Rules matched/.test(joined) && /Source/.test(joined) && /Signal score/.test(joined) && /Target audience/.test(joined) && /Time sensitivity/.test(joined));
  ok("reasoning is self-explaining");
}

console.log(`\n${passed} tests passed.`);
