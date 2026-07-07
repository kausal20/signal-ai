// Phase 4 · Module 4 — Opportunity Intelligence Engine (deterministic, no LLM).
//
// Answers "what should the user do next?" for one story, by CONSUMING the
// upstream modules (never re-deriving them):
//   • Module 8 rule_intelligence + matched_rules  (what kind of thing this is)
//   • Module 2 source_quality                      (how trustworthy)
//   • Module 1 score + per-persona values          (how strong)
// Produces ONE cached Opportunity per story. Personalization is a pure read-time
// reframe (personalizeOpportunity) — never recomputed per user. Additive: it
// never touches ranking or Modules 1/2/8.

import { RULES } from "./rules/registry.ts";
import { PRIORITY_WEIGHT, type MergedIntelligence } from "./rules/types.ts";

export type OpportunityType =
  | "API Release" | "Open Source Project" | "Research Breakthrough" | "Startup Opportunity"
  | "Business Opportunity" | "Developer Opportunity" | "Automation Opportunity" | "AI Agent Opportunity"
  | "Investment Opportunity" | "Hiring Opportunity" | "Enterprise Opportunity" | "Learning Opportunity"
  | "Prompt Opportunity" | "Tool Opportunity" | "Framework Opportunity" | "Integration Opportunity"
  | "Security Opportunity" | "Regulation Opportunity" | "Market Opportunity";

export type Persona =
  | "Developer" | "Founder" | "Investor" | "Student" | "Researcher"
  | "Content Creator" | "Enterprise" | "Freelancer" | "Agency";

export type ActionVerb =
  | "Build" | "Learn" | "Integrate" | "Test" | "Watch" | "Ignore" | "Experiment"
  | "Deploy" | "Invest" | "Research" | "Compare" | "Monitor";

export type TimeWindow = "Immediate" | "24 Hours" | "3 Days" | "1 Week" | "1 Month" | "Long Term";
export type Level = "Low" | "Medium" | "High";

export interface RecommendedAction {
  action: ActionVerb;
  priority: Level;
  estimated_time: string;
  difficulty: Level;
  expected_value: Level;
}

export interface OpportunityRisk {
  technical: Level;
  business: Level;
  execution: Level;
  market: Level;
  confidence: number;      // 0..100
}

export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  summary: string;
  why_it_matters: string;
  who_should_act: Persona[];
  recommended_action: RecommendedAction;
  urgency: number;         // 0..100
  difficulty: Level;
  time_window: TimeWindow;
  estimated_effort: string;
  business_value: number;
  developer_value: number;
  founder_value: number;
  investor_value: number;
  learning_value: number;
  risk: OpportunityRisk;
  confidence: number;      // 0..100
  required_skills: string[];
  recommended_resources: string[];
  reasoning: string[];
  related_rules: string[];
}

// rule_id → opportunity type + default action + skills/resources. Reuses the
// SAME rule ids from Module 8 (no rule duplication).
const RULE_MAP: Record<string, { type: OpportunityType; action: ActionVerb; skills: string[]; resources: string[] }> = {
  api_release:    { type: "API Release", action: "Integrate", skills: ["API integration", "Backend"], resources: ["API reference docs", "A minimal client (curl/Postman)"] },
  open_source:    { type: "Open Source Project", action: "Experiment", skills: ["Git", "The project's language"], resources: ["Repo README", "examples/ directory"] },
  research_paper: { type: "Research Breakthrough", action: "Research", skills: ["Reading ML papers"], resources: ["Abstract + method section", "Any reference implementation"] },
  benchmark:      { type: "Learning Opportunity", action: "Compare", skills: ["Evaluation"], resources: ["The benchmark leaderboard"] },
  funding:        { type: "Startup Opportunity", action: "Research", skills: ["Market analysis"], resources: ["The funding announcement", "Competitor landscape"] },
  acquisition:    { type: "Market Opportunity", action: "Monitor", skills: ["Market analysis"], resources: ["Deal terms", "Affected customer base"] },
  startup_launch: { type: "Startup Opportunity", action: "Test", skills: ["Product evaluation"], resources: ["The product itself", "Its docs"] },
  security:       { type: "Security Opportunity", action: "Deploy", skills: ["Security", "DevOps"], resources: ["The advisory / CVE", "Patch notes"] },
  breaking_news:  { type: "Market Opportunity", action: "Watch", skills: [], resources: ["Primary source"] },
  enterprise:     { type: "Enterprise Opportunity", action: "Build", skills: ["B2B", "Compliance"], resources: ["Feature docs", "Pricing page"] },
  developer_tool: { type: "Tool Opportunity", action: "Test", skills: ["Tooling"], resources: ["Tool docs", "Quickstart"] },
  framework:      { type: "Framework Opportunity", action: "Learn", skills: ["The framework's language"], resources: ["Migration guide", "Changelog"] },
  library:        { type: "Integration Opportunity", action: "Integrate", skills: ["Package management"], resources: ["Package README"] },
  prog_language:  { type: "Learning Opportunity", action: "Learn", skills: ["Programming"], resources: ["Language docs"] },
  cloud:          { type: "Integration Opportunity", action: "Deploy", skills: ["Cloud/DevOps"], resources: ["Provider docs"] },
  model_release:  { type: "Developer Opportunity", action: "Test", skills: ["Prompting", "Evaluation"], resources: ["Model card", "API/playground"] },
  ai_agent:       { type: "AI Agent Opportunity", action: "Build", skills: ["Agent design", "Tool use"], resources: ["Agent docs", "MCP/tool schema"] },
  automation:     { type: "Automation Opportunity", action: "Build", skills: ["Workflow design"], resources: ["Templates", "Integration list"] },
  pricing_change: { type: "Market Opportunity", action: "Compare", skills: ["Unit economics"], resources: ["Pricing page"] },
  hiring:         { type: "Hiring Opportunity", action: "Watch", skills: [], resources: ["Careers page"] },
  investment:     { type: "Investment Opportunity", action: "Invest", skills: ["Diligence"], resources: ["Company profile", "Market data"] },
  government:     { type: "Regulation Opportunity", action: "Monitor", skills: ["Policy"], resources: ["Official statement"] },
  regulation:     { type: "Regulation Opportunity", action: "Monitor", skills: ["Compliance"], resources: ["The regulation text"] },
  education:      { type: "Learning Opportunity", action: "Learn", skills: [], resources: ["The course/material"] },
  tutorial:       { type: "Learning Opportunity", action: "Learn", skills: [], resources: ["The tutorial"] },
};

// Rule priority lookup (reuse Module 8 registry — single source of truth).
const RULE_PRIORITY: Record<string, number> = Object.fromEntries(
  RULES.map((r) => [r.id, PRIORITY_WEIGHT[r.priority]]),
);

const ACTION_DIFFICULTY: Record<ActionVerb, Level> = {
  Build: "High", Deploy: "High", Integrate: "Medium", Test: "Medium", Experiment: "Medium",
  Learn: "Low", Watch: "Low", Monitor: "Low", Compare: "Low", Research: "Low", Invest: "Medium", Ignore: "Low",
};
const DIFFICULTY_EFFORT: Record<Level, string> = { Low: "~30 min", Medium: "~1 day", High: "~1 week" };

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));
}
function level(n: number): Level { return n >= 66 ? "High" : n >= 40 ? "Medium" : "Low"; }

function timeWindow(urgency: number, timeSensitivity: number): TimeWindow {
  const u = Math.max(urgency, timeSensitivity);
  if (u >= 85) return "Immediate";
  if (u >= 70) return "24 Hours";
  if (u >= 55) return "3 Days";
  if (u >= 40) return "1 Week";
  if (u >= 20) return "1 Month";
  return "Long Term";
}

export interface OpportunityInput {
  id: string;
  title?: string;
  summary?: string;
  why_it_matters?: string;
  score?: number;                                  // Module 1 final
  rule_intelligence?: MergedIntelligence | null;   // Module 8
  matched_rules?: string[];                        // Module 8
  source_quality?: { tier?: string; source_name?: string; confidence?: number; official?: boolean; spam_risk?: number } | null; // Module 2
}

/**
 * Generate the cached, story-level Opportunity. Returns null when there is no
 * actionable signal (no rules matched, or the story is too weak) — "no output".
 */
export function generateOpportunity(input: OpportunityInput): Opportunity | null {
  const ri = input.rule_intelligence;
  const matched = (input.matched_rules ?? ri?.matched_rules ?? []).filter((id) => RULE_MAP[id]);
  const score = clamp(input.score ?? 0);
  if (matched.length === 0 || score < 50) return null;   // no actionable opportunity

  // Primary type = highest-priority matched rule (reuse Module 8 priority).
  const primaryId = [...matched].sort((a, b) => (RULE_PRIORITY[b] ?? 0) - (RULE_PRIORITY[a] ?? 0))[0];
  const meta = RULE_MAP[primaryId];

  const dev = clamp(ri?.developer_value ?? 0);
  const fnd = clamp(ri?.founder_value ?? 0);
  const inv = clamp(ri?.investor_value ?? 0);
  const lrn = clamp(ri?.learning_value ?? 0);
  const business = clamp(Math.max(fnd, ri?.opportunity_boost ?? 0));
  const urgency = clamp(ri?.urgency ?? 0);
  const timeSens = clamp(ri?.time_sensitivity ?? 0);

  // Who should act — deterministic from the merged per-persona values + type.
  const who: Persona[] = [];
  if (dev >= 50) who.push("Developer");
  if (fnd >= 50) who.push("Founder");
  if (inv >= 50) who.push("Investor");
  if (lrn >= 55) { who.push("Student"); if (meta.type === "Research Breakthrough") who.push("Researcher"); }
  if (meta.type === "Enterprise Opportunity") who.push("Enterprise");
  if (meta.type === "Automation Opportunity") { who.push("Freelancer"); who.push("Agency"); }
  if (who.length === 0) who.push(dev >= fnd ? "Developer" : "Founder");   // never empty

  const difficulty = ACTION_DIFFICULTY[meta.action];
  const expected = level(Math.max(dev, fnd, inv, lrn, business));
  const actionPriority: Level = urgency >= 70 ? "High" : urgency >= 40 ? "Medium" : "Low";

  const risk: OpportunityRisk = {
    technical: meta.action === "Build" || meta.action === "Deploy" ? (meta.type === "AI Agent Opportunity" || meta.type === "Developer Opportunity" ? "High" : "Medium") : "Low",
    business: level(100 - business),                                    // low founder value → higher business risk
    execution: difficulty,
    market: meta.type === "Market Opportunity" || meta.type === "Regulation Opportunity" || primaryId === "acquisition" || primaryId === "pricing_change" ? "High" : "Medium",
    confidence: clamp(((ri?.confidence ?? 0) + (input.source_quality?.confidence ?? 50) + score) / 3),
  };

  const reasoning: string[] = [
    `Why it exists: ${meta.type} detected from the story`,
    `Rules matched: ${matched.join(", ")}`,
    `Source: ${input.source_quality?.source_name ?? "unknown"} (tier ${input.source_quality?.tier ?? "?"}${input.source_quality?.official ? ", official" : ""})`,
    `Signal score: ${score}`,
    `Time sensitivity: ${timeWindow(urgency, timeSens)} (urgency ${urgency})`,
    `Target audience: ${who.join(", ")}`,
  ];

  return {
    id: `${input.id}:opp`,
    type: meta.type,
    title: `${meta.action}: ${input.title ?? meta.type}`.slice(0, 160),
    summary: (input.summary ?? "").slice(0, 280),
    why_it_matters: (input.why_it_matters ?? `${meta.type} worth acting on.`).slice(0, 280),
    who_should_act: who,
    recommended_action: { action: meta.action, priority: actionPriority, estimated_time: DIFFICULTY_EFFORT[difficulty], difficulty, expected_value: expected },
    urgency,
    difficulty,
    time_window: timeWindow(urgency, timeSens),
    estimated_effort: DIFFICULTY_EFFORT[difficulty],
    business_value: business,
    developer_value: dev,
    founder_value: fnd,
    investor_value: inv,
    learning_value: lrn,
    risk,
    confidence: risk.confidence,
    required_skills: meta.skills,
    recommended_resources: meta.resources,
    reasoning,
    related_rules: matched,
  };
}

// Persona → the value dimension that matters + a reframed action emphasis.
const PERSONA_VALUE: Record<Persona, keyof Pick<Opportunity, "developer_value" | "founder_value" | "investor_value" | "learning_value" | "business_value">> = {
  Developer: "developer_value", Founder: "founder_value", Investor: "investor_value",
  Student: "learning_value", Researcher: "learning_value", "Content Creator": "learning_value",
  Enterprise: "founder_value", Freelancer: "developer_value", Agency: "business_value",
};

/**
 * Read-time personalization — pure reframe over the CACHED opportunity. Never
 * recomputes rules/scores. Bumps the action priority + expected value for the
 * persona whose dimension the opportunity serves; marks primary audience.
 */
export function personalizeOpportunity(opp: Opportunity, persona: Persona): Opportunity {
  const dim = PERSONA_VALUE[persona];
  const v = clamp(opp[dim]);
  const priority: Level = v >= 66 ? "High" : v >= 40 ? "Medium" : "Low";
  const primary = opp.who_should_act.includes(persona);
  return {
    ...opp,
    who_should_act: primary ? [persona, ...opp.who_should_act.filter((p) => p !== persona)] : opp.who_should_act,
    recommended_action: { ...opp.recommended_action, priority, expected_value: level(v) },
    reasoning: [...opp.reasoning, `Personalized for ${persona}: relevance ${v}/100 → ${priority} priority`],
  };
}
