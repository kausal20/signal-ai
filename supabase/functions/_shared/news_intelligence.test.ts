// Deterministic tests for the News Intelligence prompt + validator.
// Run: npx tsx supabase/functions/_shared/news_intelligence.test.ts
import assert from "node:assert";
import { buildPrompt, validateIntelligence, CANONICAL_GROUPS } from "./news_intelligence.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

// 1. Prompt includes article fields + JSON-only instruction.
{
  const p = buildPrompt({ id: "a1", title: "OpenAI ships GPT-6", summary: "Big jump.", source: "OpenAI", tag: "models" });
  assert.ok(p.includes("OpenAI ships GPT-6"));
  assert.ok(/JSON ONLY/i.test(p));
  assert.ok(CANONICAL_GROUPS.every((g) => p.includes(g)));
  ok("buildPrompt embeds article + demands JSON-only + lists all groups");
}

// 2. Full valid payload normalizes cleanly.
{
  const intel = validateIntelligence({
    summary: "A new model launched.",
    why_it_matters: "It changes the field.",
    affected_groups: [
      { group: "Developers", impact: "High", note: "new APIs" },
      { group: "Researchers", impact: "Medium", note: "new benchmarks" },
    ],
    importance_score: 88,
    key_takeaways: ["one", "two", "three", "four", "five", "six"],
    related_topics: ["AI", "LLM", "APIs"],
    confidence: 91,
  });
  assert.strictEqual(intel.affected_groups.length, 5);              // padded to canonical 5
  assert.strictEqual(intel.affected_groups[0].group, "Developers"); // canonical order
  assert.strictEqual(intel.key_takeaways.length, 5);                // capped at 5
  assert.strictEqual(intel.importance_score, 88);
  assert.strictEqual(intel.confidence, 91);
  ok("valid payload → 5 ordered groups, 5 takeaways, scores kept");
}

// 3. Out-of-range scores clamped; missing groups default to None.
{
  const intel = validateIntelligence({
    summary: "x",
    affected_groups: [{ group: "Researchers", impact: "weird", note: "n" }],
    importance_score: 999,
    confidence: -50,
  });
  assert.strictEqual(intel.importance_score, 100);
  assert.strictEqual(intel.confidence, 0);
  const researchers = intel.affected_groups.find((g) => g.group === "Researchers")!;
  assert.strictEqual(researchers.impact, "None");      // invalid impact → None
  const creators = intel.affected_groups.find((g) => g.group === "Creators")!;
  assert.strictEqual(creators.impact, "None");         // absent → None
  ok("scores clamped 0–100; invalid/missing impacts → None");
}

// 4. Missing summary is unusable → throws (never returns junk).
{
  assert.throws(() => validateIntelligence({ why_it_matters: "no summary" }));
  assert.throws(() => validateIntelligence(null));
  ok("missing summary / non-object → throws");
}

// 5. Determinism.
{
  const input = { summary: "s", importance_score: 50, confidence: 60 };
  assert.strictEqual(JSON.stringify(validateIntelligence(input)), JSON.stringify(validateIntelligence(input)));
  ok("deterministic (same input → same output)");
}

console.log(`\n${passed} tests passed.`);
