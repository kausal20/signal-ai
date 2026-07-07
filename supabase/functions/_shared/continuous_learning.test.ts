// Deterministic tests for Module 5 Continuous Learning. Runs under tsx/node.
// Run: npx tsx supabase/functions/_shared/continuous_learning.test.ts
import assert from "node:assert";
import {
  actionWeight, timeDecay, computeConfidence, classifyClusters,
  computeOpportunityWeights, explainRecommendation, deriveLearning, type ProfileLike,
} from "./continuous_learning.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

const profile = (over: Partial<ProfileLike> = {}): ProfileLike => ({
  persona: "developer",
  persona_mix: { developer: 0.7, founder: 0.2, student: 0.1 },
  interest_weights: { coding: 1.2, agents: 0.9, automation: 0.5, business: 0.3, research: 0.1 },
  concept_affinity: { mcp: 0.8, openai: 0.9 },
  revisit_counts: { mcp: 4 },
  searches: ["mcp servers", "claude api"],
  signal_count: 20, opened_count: 12, saved_count: 5, dismissed_count: 2,
  ...over,
});

// 1. Bookmark → weight increases (positive), Dismiss → decreases (negative)
{
  assert.ok(actionWeight("bookmarked") > 0);
  assert.ok(actionWeight("dismissed") < 0);
  assert.ok(actionWeight("hidden") <= -10);
  assert.ok(actionWeight("project_completed") >= actionWeight("project_started"));
  assert.strictEqual(actionWeight("nonsense"), 0);
  ok("action weights: bookmark +, dismiss −, hide −10, completed ≥ started");
}

// 2. Repeated search weighted higher than a single open
{
  assert.ok(actionWeight("topic_revisit") > actionWeight("opened"));
  ok("repeated search weighted above single open");
}

// 3. Time decay: 0d=1.0, 30d≈0.6, 90d≈0.3, monotonic
{
  assert.strictEqual(timeDecay(0), 1);
  assert.strictEqual(timeDecay(30), 0.6);
  assert.strictEqual(timeDecay(90), 0.3);
  assert.ok(timeDecay(0) > timeDecay(30) && timeDecay(30) > timeDecay(90) && timeDecay(90) > timeDecay(180));
  ok("time decay 100%/60%/30% + monotonic");
}

// 4. Confidence: strong dimension high, weak dimension low; more signals → higher
{
  const c = computeConfidence(profile());
  assert.ok(c.developer >= 85, `dev ${c.developer}`);
  assert.ok(c.founder < c.developer, `founder ${c.founder} < dev`);
  const more = computeConfidence(profile({ signal_count: 60 }));
  assert.ok(more.developer >= c.developer, "more signals → ≥ confidence");
  ok("confidence: strong dim high, weak low, grows with evidence");
}

// 5. Clusters: multi-label, includes AI Builder + Agent Developer for this profile
{
  const cl = classifyClusters(profile());
  assert.ok(cl.includes("AI Builder"));
  assert.ok(cl.includes("Agent Developer"));
  assert.ok(cl.length >= 2, "multi-label");
  ok("clusters multi-label (AI Builder + Agent Developer)");
}

// 6. Student cluster for a brand-new user (few signals)
{
  const cl = classifyClusters(profile({ signal_count: 2, persona_mix: { student: 0.6, builder: 0.4 }, interest_weights: {}, concept_affinity: {} }));
  assert.ok(cl.includes("Student"));
  ok("new user → Student cluster");
}

// 7. Opportunity weights derived from interest axes
{
  const ow = computeOpportunityWeights(profile());
  assert.ok((ow["Developer Opportunity"] ?? 0) > 0);
  assert.ok((ow["AI Agent Opportunity"] ?? 0) > 0);
  assert.ok((ow["Business Opportunity"] ?? 0) > 0);
  ok("opportunity weights from interest axes");
}

// 8. Explanation is behavior-based + self-explaining
{
  const ex = explainRecommendation(profile(), { axes: ["coding", "agents"], entities: ["mcp", "openai"], content_category: "Tool of the Day" });
  const joined = ex.join(" | ");
  assert.ok(ex.length > 0);
  assert.ok(/bookmarked|searched|engage|returning|developer/i.test(joined));
  ok("recommendation explains itself from behavior");
}

// 9. Repeated search increases topic confidence signal (revisit surfaced)
{
  const ex = explainRecommendation(profile(), { axes: ["agents"], entities: ["mcp"] });
  assert.ok(ex.some((r) => /mcp/i.test(r)), "mcp surfaced from searches/revisits");
  ok("repeated search/revisit → topic surfaced in explanation");
}

// 10. Determinism + deriveLearning bundle shape
{
  const a = JSON.stringify(deriveLearning(profile()));
  const b = JSON.stringify(deriveLearning(profile()));
  assert.strictEqual(a, b);
  const d = deriveLearning(profile());
  assert.ok("dimension_confidence" in d && "clusters" in d && "opportunity_weights" in d);
  ok("deterministic + deriveLearning bundle shape");
}

// 11. No-behavior profile degrades gracefully (never empty clusters)
{
  const empty = profile({ signal_count: 0, persona_mix: {}, interest_weights: {}, concept_affinity: {}, revisit_counts: {}, searches: [], saved_count: 0, opened_count: 0 });
  const d = deriveLearning(empty);
  assert.ok(d.clusters.length >= 1, "never empty clusters");
  ok("cold-start profile degrades gracefully");
}

console.log(`\n${passed} tests passed.`);
