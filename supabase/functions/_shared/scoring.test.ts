// Deterministic tests for Module 1 scoring. Runs under tsx/node (scoring.ts is
// dependency-free). Run: npx tsx supabase/functions/_shared/scoring.test.ts
import assert from "node:assert";
import { buildScoreBreakdown, confidenceBand, freshnessDecay, type ScorableItem } from "./scoring.ts";

let passed = 0;
const ok = (name: string) => { passed++; console.log(`  ✓ ${name}`); };

const base = (over: Partial<ScorableItem> = {}): ScorableItem => ({
  score: 88, confidence_score: 82, leverage_score: 9,
  business_impact_score: 80, builder_value_score: 74, novelty_score: 66,
  market_impact_score: 60, adoption_potential_score: 55, opportunity_score: 72,
  corroboration_score: 40, trend_score: 55, momentum_score: 48,
  published_at: new Date().toISOString(), source: "anthropic",
  ...over,
});

const NOW = Date.UTC(2026, 6, 3, 12, 0, 0);

// 1. final == item.score (ranking preserved, never recomputed)
{
  const b = buildScoreBreakdown(base({ score: 91 }), NOW);
  assert.strictEqual(b.final, 91);
  ok("final equals item.score (ranking untouched)");
}

// 2. determinism — same input twice → identical output
{
  const item = base();
  const a = JSON.stringify(buildScoreBreakdown(item, NOW));
  const c = JSON.stringify(buildScoreBreakdown(item, NOW));
  assert.strictEqual(a, c);
  ok("deterministic (same input → same output)");
}

// 3. pure — buildScoreBreakdown does not mutate the item (order-safe)
{
  const item = base();
  const snapshot = JSON.stringify(item);
  buildScoreBreakdown(item, NOW);
  assert.strictEqual(JSON.stringify(item), snapshot);
  ok("does not mutate the input item");
}

// 4. confidence bands at boundaries
{
  assert.strictEqual(confidenceBand(85), "Very High");
  assert.strictEqual(confidenceBand(84), "High");
  assert.strictEqual(confidenceBand(70), "High");
  assert.strictEqual(confidenceBand(69), "Medium");
  assert.strictEqual(confidenceBand(55), "Medium");
  assert.strictEqual(confidenceBand(54), "Low");
  ok("confidence bands (Very High/High/Medium/Low)");
}

// 5. freshness deterministic decay, clamped 0..20, monotonic in age
{
  const fresh = freshnessDecay(new Date(NOW).toISOString(), NOW);
  const day = freshnessDecay(new Date(NOW - 24 * 3600_000).toISOString(), NOW);
  const week = freshnessDecay(new Date(NOW - 7 * 24 * 3600_000).toISOString(), NOW);
  assert.ok(fresh <= 20 && fresh >= 18, `fresh ${fresh}`);
  assert.ok(fresh > day && day > week, "monotonic decay");
  assert.ok(week >= 0, "clamped non-negative");
  ok("freshness deterministic decay + monotonic + clamped");
}

// 6. every factor has label/points/description/source, points > 0, sorted desc
{
  const b = buildScoreBreakdown(base(), NOW);
  assert.ok(b.factors.length > 0);
  for (const f of b.factors) {
    assert.ok(typeof f.label === "string" && f.label.length > 0, "label");
    assert.ok(typeof f.points === "number" && f.points > 0, "points > 0");
    assert.ok(typeof f.description === "string" && f.description.length > 0, "description");
    assert.ok(typeof f.source === "string" && f.source.length > 0, "source");
  }
  for (let i = 1; i < b.factors.length; i++) assert.ok(b.factors[i - 1].points >= b.factors[i].points, "sorted desc");
  ok("factors carry {label,points,description,source}, positive, sorted");
}

// 7. per-persona value passthrough
{
  const b = buildScoreBreakdown(base({ builder_value_score: 77, business_impact_score: 81, market_impact_score: 63, novelty_score: 59 }), NOW);
  assert.strictEqual(b.developer_value, 77);
  assert.strictEqual(b.founder_value, 81);
  assert.strictEqual(b.investor_value, 63);
  assert.strictEqual(b.learning_value, 59);
  ok("per-persona value scores mapped from dimensions");
}

// 8. RANKING-IDENTICAL: adding the breakdown layer never reorders a feed.
{
  const items = [base({ id: "a", score: 91 } as any), base({ id: "b", score: 74 } as any), base({ id: "c", score: 88 } as any)] as any[];
  const before = [...items].sort((x, y) => y.score - x.score).map((i) => i.id).join(",");
  for (const it of items) {
    const b = buildScoreBreakdown(it, NOW);
    it.score_factors = b.factors; it.freshness_score = b.freshness; // simulate pipeline annotation
    it.developer_value = b.developer_value;
  }
  const after = [...items].sort((x, y) => y.score - x.score).map((i) => i.id).join(",");
  assert.strictEqual(before, after);
  assert.strictEqual(after, "a,c,b");
  ok("ranking order identical after annotation");
}

console.log(`\n${passed} tests passed.`);
