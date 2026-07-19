// Deterministic tests for AI Pulse prompt + validator.
// Run: npx tsx supabase/functions/_shared/ai_pulse.test.ts
import assert from "node:assert";
import { buildPrompt, validatePulse } from "./ai_pulse.ts";

let passed = 0;
const ok = (n: string) => { passed++; console.log(`  ✓ ${n}`); };

const base = () => ({
  overview: { launches: 5, funding_rounds: 8, acquisitions: 1, research_papers: 34, open_source: 12, model_launches: 3, api_releases: 4 },
  leader: { company: "OpenAI", launches: 5, partnerships: 2, acquisitions: 1 },
  companies: [{ name: "OpenAI", latest_model: "GPT-5.6", latest_release: "2d ago", activity_score: 96, trend: "up" }],
  trending: [{ name: "xAI", note: "Grok surges", change: 18 }],
  releases: [{ company: "Google", title: "Gemini 3", when: "1d ago", kind: "Model" }],
  funding: [{ company: "Anthropic", amount: "$40B", round: "Series G", investor: "Multiple" }],
  partnerships: [{ a: "OpenAI", b: "Microsoft", note: "Azure pact" }],
  heatmap: [{ label: "Agents", level: "green", note: "Hot" }],
  analysis: { industry_trend: "t", key_insight: "k", biggest_winner: "w", biggest_loser: "l", developer_impact: "d", business_impact: "b" },
});

// 1. Prompt demands JSON-only.
{
  const p = buildPrompt();
  assert.ok(/JSON ONLY/i.test(p));
  assert.ok(/leaderboard/i.test(p));
  ok("buildPrompt demands JSON-only + covers leaderboard");
}

// 2. Valid payload passes through with clamped score + coerced trend.
{
  const d = validatePulse(base());
  assert.strictEqual(d.companies[0].activity_score, 96);
  assert.strictEqual(d.companies[0].trend, "up");
  assert.strictEqual(d.overview.launches, 5);
  assert.strictEqual(d.leader.company, "OpenAI");
  assert.strictEqual(d.heatmap[0].level, "green");
  ok("valid payload normalizes cleanly");
}

// 3. Bad enums/scores are coerced (never crash).
{
  const raw = base();
  (raw.companies[0] as any).trend = "sideways";
  (raw.companies[0] as any).activity_score = 999;
  (raw.heatmap[0] as any).level = "purple";
  const d = validatePulse(raw);
  assert.strictEqual(d.companies[0].trend, "flat");     // invalid → flat
  assert.strictEqual(d.companies[0].activity_score, 100); // clamped
  assert.strictEqual(d.heatmap[0].level, "yellow");     // invalid → yellow
  ok("invalid enums/scores coerced to safe defaults");
}

// 4. Missing companies is unusable → throws.
{
  const raw = base(); (raw as any).companies = [];
  assert.throws(() => validatePulse(raw));
  assert.throws(() => validatePulse(null));
  ok("no companies / non-object → throws");
}

// 5. Determinism + list caps.
{
  const raw = base();
  raw.companies = Array.from({ length: 20 }, (_, i) => ({ name: `C${i}`, latest_model: "m", latest_release: "1d", activity_score: 50, trend: "up" }));
  const d = validatePulse(raw);
  assert.strictEqual(d.companies.length, 12);           // capped at 12
  assert.strictEqual(JSON.stringify(validatePulse(base())), JSON.stringify(validatePulse(base())));
  ok("company list capped + deterministic");
}

console.log(`\n${passed} tests passed.`);
