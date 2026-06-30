// V4 CAP 4 — Multi-Agent Reasoning. Replaces single-pass story reasoning with
// a structured panel of specialist agents. Two grouped LLM calls per story:
//   1) ANALYSTS  — Research, Fact-Verification, Business, Founder, Builder, Market.
//   2) SYNTHESIS — Editorial Writer + Final Quality Reviewer merge into one
//      StoryIntelligence object (the V2 shape, so all downstream code is reused).
// Reason ONCE per story, cache forever, reuse for every user. Falls back to the
// V2 single-pass reasoner, then to the deterministic fallback.

import { fetchWithTimeout } from "./text.ts";
import {
  reasonStory, fallbackStoryIntel, type StoryIntelligence,
} from "./intelligence_v2.ts";
import type { StoredStory } from "./intelligence_engine.ts";

const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

async function call(systemPrompt: string, tool: any, toolName: string, userObj: unknown, apiKey: string): Promise<any | null> {
  let resp: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      resp = await fetchWithTimeout(GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: JSON.stringify(userObj) },
          ],
          tools: [tool],
          tool_choice: { type: "function", function: { name: toolName } },
        }),
      }, 30000);
    } catch { resp = null; }
    if (resp && resp.ok) break;
    if (resp && resp.status !== 429 && resp.status < 500) break;
    await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) return null;
  try {
    const j = await resp.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    return args ? JSON.parse(args) : null;
  } catch { return null; }
}

// ---- Call 1: analyst panel ------------------------------------------------
const ANALYST_PROMPT = `You are a panel of specialist AI analysts reviewing one story. Each agent has ONE job. Be concrete, no hype, ranges not fake numbers.
- research: what actually happened, why now, what changed vs status quo, novelty 1-10.
- fact_verification: are the claims credible given source/corroboration? confidence 0-100, list caveats.
- business_analyst: revenue/cost/market impact and who it affects.
- founder_advisor: the startup/founder angle — wedge, moat, timing.
- builder_advisor: what a developer/builder can ship with this; APIs/workflows.
- market_analyst: category momentum, winners/losers, capital implications.`;

const analystTool = {
  type: "function",
  function: {
    name: "analyst_panel",
    parameters: {
      type: "object",
      properties: {
        research: { type: "object", properties: {
          what_happened: { type: "string" }, why_now: { type: "string" },
          what_changed: { type: "string" }, novelty: { type: "integer", minimum: 1, maximum: 10 },
          industries: { type: "array", items: { type: "string" } },
          technologies: { type: "array", items: { type: "string" } },
          workflows_obsolete: { type: "array", items: { type: "string" } },
          workflows_enabled: { type: "array", items: { type: "string" } },
        }, required: ["what_happened", "why_now", "what_changed", "novelty"] },
        fact_verification: { type: "object", properties: {
          confidence: { type: "integer", minimum: 0, maximum: 100 },
          corroboration: { type: "string" }, caveats: { type: "array", items: { type: "string" } },
        }, required: ["confidence", "corroboration"] },
        business_analyst: { type: "object", properties: {
          finding: { type: "string" }, who_benefits: { type: "array", items: { type: "string" } },
          who_loses: { type: "array", items: { type: "string" } }, business_models_affected: { type: "array", items: { type: "string" } },
        }, required: ["finding"] },
        founder_advisor: { type: "object", properties: { finding: { type: "string" }, wedge: { type: "string" } }, required: ["finding"] },
        builder_advisor: { type: "object", properties: { finding: { type: "string" }, ship: { type: "string" } }, required: ["finding"] },
        market_analyst: { type: "object", properties: { finding: { type: "string" }, direction: { type: "string" } }, required: ["finding"] },
      },
      required: ["research", "fact_verification", "business_analyst", "founder_advisor", "builder_advisor", "market_analyst"],
    },
  },
};

// ---- Call 2: editorial writer + final reviewer ----------------------------
const SYNTHESIS_PROMPT = `You are Signal's Editorial Writer and Final Quality Reviewer. You receive the analyst panel's findings for one story. Synthesize ONE final intelligence object.
For EACH of 8 personas (developer, founder, agency, student, researcher, marketer, investor, builder) write a distinct takeaway + concrete action + why + relevance(0-100). Two personas must never get the same advice.
Opportunities: only real ones (types: Business, Automation, Learning, Career, Startup, Workflow, Product, Investment), each explained with confidence/difficulty/potential_impact (Low/Medium/High) and time_horizon.
Impact: realistic ranges or Low/Medium/High, never exact invented figures.
why_picked + supporting_evidence: ground in the analyst findings.
As Final Reviewer, ensure significance (1-10) and confidence reflect the fact_verification result. Plain language, no marketing.`;

const synthesisTool = {
  type: "function",
  function: {
    name: "final_intelligence",
    parameters: {
      type: "object",
      properties: {
        significance: { type: "integer", minimum: 1, maximum: 10 },
        personas: { type: "object", description: "8 persona keys", properties: Object.fromEntries(
          ["developer", "founder", "agency", "student", "researcher", "marketer", "investor", "builder"].map((p) => [p, {
            type: "object",
            properties: { takeaway: { type: "string" }, action: { type: "string" }, why: { type: "string" }, relevance: { type: "integer", minimum: 0, maximum: 100 } },
            required: ["takeaway", "action", "why", "relevance"],
          }]),
        ), required: ["developer", "founder", "agency", "student", "researcher", "marketer", "investor", "builder"] },
        opportunities: { type: "array", items: { type: "object", properties: {
          type: { type: "string", enum: ["Business", "Automation", "Learning", "Career", "Startup", "Workflow", "Product", "Investment"] },
          title: { type: "string" }, explanation: { type: "string" },
          confidence: { type: "string", enum: ["Low", "Medium", "High"] }, difficulty: { type: "string", enum: ["Low", "Medium", "High"] },
          potential_impact: { type: "string", enum: ["Low", "Medium", "High"] }, time_horizon: { type: "string" },
        }, required: ["type", "title", "explanation", "confidence", "difficulty", "potential_impact", "time_horizon"] } },
        impact: { type: "object", properties: {
          time_saved: { type: "string" }, cost_reduction: { type: "string" },
          business_potential: { type: "string", enum: ["Low", "Medium", "High"] }, automation_potential: { type: "string", enum: ["Low", "Medium", "High"] },
          learning_value: { type: "string", enum: ["Low", "Medium", "High"] }, career_value: { type: "string", enum: ["Low", "Medium", "High"] },
          difficulty: { type: "string", enum: ["Low", "Medium", "High"] }, confidence: { type: "string", enum: ["Low", "Medium", "High"] }, reasoning: { type: "string" },
        }, required: ["time_saved", "cost_reduction", "business_potential", "confidence", "reasoning"] },
        trend: { type: "object", properties: {
          name: { type: "string" }, direction: { type: "string", enum: ["accelerating", "slowing", "emerging", "declining", "steady"] },
          evidence: { type: "string" }, prediction: { type: "string" },
        }, required: ["name", "direction", "evidence", "prediction"] },
        why_picked: { type: "array", items: { type: "string" } },
        supporting_evidence: { type: "array", items: { type: "string" } },
      },
      required: ["significance", "personas", "opportunities", "impact", "trend", "why_picked"],
    },
  },
};

export async function runAgentReasoning(
  story: StoredStory,
  trendContext: string,
  apiKey: string,
  breaker?: { canAttempt: () => boolean },
): Promise<{ intel: StoryIntelligence; ok: boolean; degraded: boolean; agents: number }> {
  if (breaker && !breaker.canAttempt()) {
    const fb = await reasonStory(story, trendContext, apiKey, breaker);
    return { ...fb, agents: 0 };
  }

  const storyInput = {
    headline: story.title, what_happened: story.what_happened ?? story.summary,
    why_it_matters: story.why_it_matters ?? "", category: story.content_category ?? "",
    source: story.source_label ?? "", source_count: story.source_count ?? 1,
    entities: story.trend_entities ?? [], trend_context: trendContext || "none",
  };

  const analysts = await call(ANALYST_PROMPT, analystTool, "analyst_panel", storyInput, apiKey);
  if (!analysts) {
    // graceful: fall back to single-pass V2 reasoning.
    const fb = await reasonStory(story, trendContext, apiKey, breaker);
    return { ...fb, agents: 0 };
  }

  const final = await call(SYNTHESIS_PROMPT, synthesisTool, "final_intelligence",
    { story: storyInput, analyst_panel: analysts }, apiKey);
  if (!final) {
    const fb = await reasonStory(story, trendContext, apiKey, breaker);
    return { ...fb, agents: 1 };
  }

  const r = analysts.research ?? {};
  const intel: StoryIntelligence = {
    understanding: {
      what_happened: r.what_happened ?? story.what_happened ?? story.summary,
      why_it_happened: r.why_now ?? "",
      what_changed: r.what_changed ?? "",
      significance: clampInt(final.significance, 1, 10, 5),
      who_benefits: analysts.business_analyst?.who_benefits ?? [],
      who_loses: analysts.business_analyst?.who_loses ?? [],
      industries_affected: r.industries ?? [],
      technologies: r.technologies ?? story.trend_entities ?? [],
      business_models_affected: analysts.business_analyst?.business_models_affected ?? [],
      workflows_obsolete: r.workflows_obsolete ?? [],
      workflows_enabled: r.workflows_enabled ?? [],
    },
    personas: final.personas,
    opportunities: (final.opportunities ?? []).slice(0, 8),
    impact: final.impact,
    trend: final.trend,
    why_picked: (final.why_picked ?? []).slice(0, 5),
    supporting_evidence: (final.supporting_evidence ?? []).slice(0, 5),
    verification: {
      confidence: clampInt(analysts.fact_verification?.confidence, 0, 100, 60),
      corroboration: analysts.fact_verification?.corroboration ?? "",
      caveats: analysts.fact_verification?.caveats ?? [],
    },
    agent_breakdown: {
      research: analysts.research, business: analysts.business_analyst,
      founder: analysts.founder_advisor, builder: analysts.builder_advisor,
      market: analysts.market_analyst,
    },
  };
  // Ensure all 8 personas present (reviewer may skip one).
  const fb = fallbackStoryIntel(story);
  for (const p of Object.keys(fb.personas) as Array<keyof typeof fb.personas>) {
    if (!intel.personas?.[p]?.takeaway) {
      intel.personas = intel.personas ?? ({} as any);
      intel.personas[p] = fb.personas[p];
    }
  }
  return { intel, ok: true, degraded: false, agents: 2 };
}

function clampInt(v: any, lo: number, hi: number, dflt: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return dflt;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}
