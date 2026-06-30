// Signal Intelligence Engine V2 — genuine reasoning layer.
//
// Architecture: the EXPENSIVE reasoning runs ONCE per story (not per user).
// One LLM call produces a rich semantic understanding + 8 persona-specific
// takeaways/actions + reasoned opportunities + impact + trend direction. That
// object is cached in story_intelligence and reused across every user. The
// per-user step (learning.ts) is pure compute — zero LLM calls per user.
//
// No regex topic-matching, no string templates: the model reasons about who
// benefits/loses, which workflows die, and what each persona should DO.

import { fetchWithTimeout } from "./text.ts";
import { dbWrite } from "./reliability.ts";
import {
  detectOpportunities as detOppsFallback,
  estimateImpact as estImpactFallback,
  personalizedTakeaway as takeawayFallback,
  actionForUser as actionFallback,
  type StoredStory,
} from "./intelligence_engine.ts";
import { defaultProfile } from "./profile.ts";
import type { TrendEntity } from "./types.ts";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export const PERSONAS_V2 = [
  "developer", "founder", "agency", "student",
  "researcher", "marketer", "investor", "builder",
] as const;
export type PersonaV2 = typeof PERSONAS_V2[number];

export type Conf = "Low" | "Medium" | "High";

export interface PersonaAdvice {
  takeaway: string;   // what it means for this persona, with WHY
  action: string;     // concrete, specific, achievable
  why: string;        // reasoning: why this matters to them now
  relevance: number;  // 0..100 model's own judgement of relevance to persona
}

export interface IntelOpportunity {
  type: "Business" | "Automation" | "Learning" | "Career" | "Startup" | "Workflow" | "Product" | "Investment";
  title: string;
  explanation: string;
  confidence: Conf;
  difficulty: Conf;
  potential_impact: Conf;
  time_horizon: string;
}

export interface StoryIntelligence {
  understanding: {
    what_happened: string;
    why_it_happened: string;
    what_changed: string;
    significance: number;               // 1..10
    who_benefits: string[];
    who_loses: string[];
    industries_affected: string[];
    technologies: string[];
    business_models_affected: string[];
    workflows_obsolete: string[];
    workflows_enabled: string[];
  };
  personas: Record<PersonaV2, PersonaAdvice>;
  opportunities: IntelOpportunity[];
  impact: {
    time_saved: string;
    cost_reduction: string;
    business_potential: Conf;
    automation_potential: Conf;
    learning_value: Conf;
    career_value: Conf;
    difficulty: Conf;
    confidence: Conf;
    reasoning: string;
  };
  trend: {
    name: string;
    direction: "accelerating" | "slowing" | "emerging" | "declining" | "steady";
    evidence: string;
    prediction: string;
  };
  why_picked: string[];
  supporting_evidence: string[];
  // V4 additive (optional → backwards compatible with V2/V3 cached rows):
  roi?: ROIEstimate;
  verification?: { confidence: number; corroboration: string; caveats: string[] };
  agent_breakdown?: Record<string, unknown>;
}

// V4 CAP 5 — ROI estimate (ranges, never fake precision).
export interface ROIEstimate {
  time_saved: string;          // e.g. "5-8 hours/week"
  money_saved: string;         // e.g. "$800-$2,000/month"
  potential_revenue: string;
  implementation_cost: string;
  payback_period: string;
  difficulty: Conf;
  confidence: number;          // 0..100
  assumptions: string[];
}

// =====================================================================
// System prompt — instructs the model to REASON, persona by persona.
// =====================================================================
const SYSTEM_PROMPT = `You are Signal's AI strategist. An experienced analyst reads one AI story and explains exactly what it means for eight different kinds of professional, and what each should do.

You REASON. You do not pattern-match or fill templates. Two personas must never get the same advice — their incentives differ.

For the story you receive, think through (internally) before answering:
- What actually happened, and WHY did it happen (the underlying motive/market force)?
- What changed versus the status quo? How big a change (significance 1-10)?
- Who genuinely benefits and who loses?
- Which industries, technologies, business models are affected?
- Which existing workflows become obsolete; which new workflows become possible?
- For EACH persona: would this realistically help them? If not, say so and keep relevance low. Would you personally recommend they act?

THEN produce, per persona, a takeaway that explains the WHY, and ONE concrete action.

PERSONAS and what they care about:
- developer: shipping speed, APIs/SDKs, code quality, dev time saved.
- founder: revenue, cost, moat, fundraising signal, market timing.
- agency: packageable client services, billable automation, margin.
- student: cheap/free learning, portfolio projects, skills that get hired.
- researcher: methods, benchmarks, reproducibility, what transfers.
- marketer: content/creative leverage, channels, audience, conversion.
- investor: category momentum, capital flows, defensibility, TAM signal.
- builder: indie/no-code building, agents, automation, weekend projects.

RULES:
- Actions must be specific and achievable. Bad: "Explore this." Good: "Replace your speech-to-text API in staging and benchmark latency vs your current provider."
- Impact estimates: realistic RANGES (e.g. 10-30%) or Low/Medium/High. NEVER invent exact revenue or precise figures.
- No hype words. Plain language. Each takeaway under ~30 words.
- Opportunities: only real ones. Explain each. If a type does not apply, omit it (do not force all eight).
- Use the trend context provided to judge direction and significance.
- Be honest: if a persona should ignore this story, set their relevance below 35 and say why in 'why'.`;

const intelTool = [{
  type: "function",
  function: {
    name: "analyze_story",
    description: "Return deep, reasoned intelligence for one AI story.",
    parameters: {
      type: "object",
      properties: {
        understanding: {
          type: "object",
          properties: {
            what_happened: { type: "string" },
            why_it_happened: { type: "string" },
            what_changed: { type: "string" },
            significance: { type: "integer", minimum: 1, maximum: 10 },
            who_benefits: { type: "array", items: { type: "string" } },
            who_loses: { type: "array", items: { type: "string" } },
            industries_affected: { type: "array", items: { type: "string" } },
            technologies: { type: "array", items: { type: "string" } },
            business_models_affected: { type: "array", items: { type: "string" } },
            workflows_obsolete: { type: "array", items: { type: "string" } },
            workflows_enabled: { type: "array", items: { type: "string" } },
          },
          required: ["what_happened", "why_it_happened", "what_changed", "significance", "who_benefits", "who_loses"],
        },
        personas: {
          type: "object",
          description: "One entry per persona key.",
          properties: Object.fromEntries(PERSONAS_V2.map((p) => [p, {
            type: "object",
            properties: {
              takeaway: { type: "string" },
              action: { type: "string" },
              why: { type: "string" },
              relevance: { type: "integer", minimum: 0, maximum: 100 },
            },
            required: ["takeaway", "action", "why", "relevance"],
          }])),
          required: [...PERSONAS_V2],
        },
        opportunities: {
          type: "array",
          items: {
            type: "object",
            properties: {
              type: { type: "string", enum: ["Business", "Automation", "Learning", "Career", "Startup", "Workflow", "Product", "Investment"] },
              title: { type: "string" },
              explanation: { type: "string" },
              confidence: { type: "string", enum: ["Low", "Medium", "High"] },
              difficulty: { type: "string", enum: ["Low", "Medium", "High"] },
              potential_impact: { type: "string", enum: ["Low", "Medium", "High"] },
              time_horizon: { type: "string" },
            },
            required: ["type", "title", "explanation", "confidence", "difficulty", "potential_impact", "time_horizon"],
          },
        },
        impact: {
          type: "object",
          properties: {
            time_saved: { type: "string" },
            cost_reduction: { type: "string" },
            business_potential: { type: "string", enum: ["Low", "Medium", "High"] },
            automation_potential: { type: "string", enum: ["Low", "Medium", "High"] },
            learning_value: { type: "string", enum: ["Low", "Medium", "High"] },
            career_value: { type: "string", enum: ["Low", "Medium", "High"] },
            difficulty: { type: "string", enum: ["Low", "Medium", "High"] },
            confidence: { type: "string", enum: ["Low", "Medium", "High"] },
            reasoning: { type: "string" },
          },
          required: ["time_saved", "cost_reduction", "business_potential", "confidence", "reasoning"],
        },
        trend: {
          type: "object",
          properties: {
            name: { type: "string" },
            direction: { type: "string", enum: ["accelerating", "slowing", "emerging", "declining", "steady"] },
            evidence: { type: "string" },
            prediction: { type: "string" },
          },
          required: ["name", "direction", "evidence", "prediction"],
        },
        why_picked: { type: "array", items: { type: "string" } },
        supporting_evidence: { type: "array", items: { type: "string" } },
      },
      required: ["understanding", "personas", "opportunities", "impact", "trend", "why_picked"],
    },
  },
}];

// =====================================================================
// One reasoning call per story. Returns the reusable intelligence object.
// =====================================================================
export async function reasonStory(
  story: StoredStory,
  trendContext: string,
  apiKey: string,
  breaker?: { canAttempt: () => boolean },
): Promise<{ intel: StoryIntelligence; ok: boolean; degraded: boolean }> {
  if (breaker && !breaker.canAttempt()) {
    return { intel: fallbackStoryIntel(story), ok: false, degraded: true };
  }

  const userPayload = {
    headline: story.title,
    what_happened: story.what_happened ?? story.summary,
    why_it_matters: story.why_it_matters ?? "",
    editorial_opportunity: story.opportunity ?? "",
    category: story.content_category ?? "",
    source: story.source_label ?? "",
    source_count: story.source_count ?? 1,
    entities: story.trend_entities ?? [],
    trend_context: trendContext || "no notable trend signal",
    editorial_scores: {
      leverage: story.leverage_score, business: story.business_impact_score,
      builder: story.builder_value_score, novelty: story.novelty_score,
      adoption: story.adoption_potential_score, confidence: story.confidence_score,
    },
  };

  let resp: Response | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      resp = await fetchWithTimeout(LOVABLE_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: JSON.stringify(userPayload) },
          ],
          tools: intelTool,
          tool_choice: { type: "function", function: { name: "analyze_story" } },
        }),
      }, 30000);
    } catch (_e) { resp = null; }
    if (resp && resp.ok) break;
    if (resp && resp.status !== 429 && resp.status < 500) break;
    await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) return { intel: fallbackStoryIntel(story), ok: false, degraded: true };

  try {
    const j = await resp.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return { intel: fallbackStoryIntel(story), ok: false, degraded: true };
    const parsed = JSON.parse(args) as StoryIntelligence;
    return { intel: normalizeIntel(parsed, story), ok: true, degraded: false };
  } catch {
    return { intel: fallbackStoryIntel(story), ok: false, degraded: true };
  }
}

// Fill any persona the model skipped + clamp, so downstream is always complete.
function normalizeIntel(intel: StoryIntelligence, story: StoredStory): StoryIntelligence {
  intel.personas = intel.personas ?? ({} as any);
  for (const p of PERSONAS_V2) {
    const a = intel.personas[p];
    if (!a || !a.takeaway || !a.action) {
      intel.personas[p] = fallbackPersona(p, story);
    } else if (typeof a.relevance !== "number") {
      a.relevance = 60;
    }
  }
  intel.opportunities = (intel.opportunities ?? []).slice(0, 8);
  intel.why_picked = (intel.why_picked ?? []).slice(0, 5);
  intel.supporting_evidence = (intel.supporting_evidence ?? []).slice(0, 5);
  const sig = intel.understanding?.significance;
  if (typeof sig !== "number") intel.understanding.significance =
    Math.round(((story.leverage_score ?? 5)) );
  return intel;
}

// =====================================================================
// Deterministic fallback — used only when the gateway is down. Reuses the
// V1 deterministic helpers so the product degrades gracefully, never empty.
// =====================================================================
export function fallbackStoryIntel(story: StoredStory): StoryIntelligence {
  const opps = detOppsFallback(story).map((o) => ({
    type: o.type === "Career" ? "Career" : o.type,
    title: o.title,
    explanation: o.explanation,
    confidence: o.confidence as Conf,
    difficulty: o.difficulty as Conf,
    potential_impact: o.potential_impact as Conf,
    time_horizon: story.time_horizon ?? "this month",
  })) as IntelOpportunity[];
  const imp = estImpactFallback(story);

  const personas = {} as Record<PersonaV2, PersonaAdvice>;
  for (const p of PERSONAS_V2) personas[p] = fallbackPersona(p, story);

  return {
    understanding: {
      what_happened: story.what_happened ?? story.summary,
      why_it_happened: "Inferred from editorial summary (reasoning offline).",
      what_changed: story.why_it_matters ?? story.summary,
      significance: Math.max(1, Math.min(10, Math.round((story.leverage_score ?? 5)))),
      who_benefits: [story.who_for ?? "AI builders"],
      who_loses: [],
      industries_affected: [],
      technologies: story.trend_entities ?? [],
      business_models_affected: [],
      workflows_obsolete: [],
      workflows_enabled: [],
    },
    personas,
    opportunities: opps,
    impact: {
      time_saved: imp.time_saved,
      cost_reduction: imp.cost_reduction,
      business_potential: imp.business_value as Conf,
      automation_potential: imp.automation_value as Conf,
      learning_value: imp.learning_value as Conf,
      career_value: imp.business_value as Conf,
      difficulty: imp.difficulty as Conf,
      confidence: imp.confidence as Conf,
      reasoning: "Estimated from editorial scores (reasoning offline).",
    },
    trend: {
      name: (story.trend_entities ?? [])[0] ?? "AI",
      direction: (story.momentum_score ?? 0) >= 60 ? "accelerating" : "steady",
      evidence: story.expected_impact ?? "",
      prediction: "Monitor for follow-up signals.",
    },
    why_picked: deriveWhy(story),
    supporting_evidence: (story.source_label ? [`Reported by ${story.source_label}`] : []),
  };
}

// Map V2 personas onto the V1 deterministic persona helpers where possible.
function fallbackPersona(p: PersonaV2, story: StoredStory): PersonaAdvice {
  const v1Persona =
    p === "marketer" ? "agency" :
    p === "investor" ? "founder" :
    p === "builder" ? "developer" : p;
  const prof = defaultProfile(v1Persona as any);
  return {
    takeaway: takeawayFallback(story, prof),
    action: actionFallback(story, prof),
    why: "Relevance inferred from your role (reasoning offline).",
    relevance: Math.max(20, Math.min(95, (story.score ?? 60))),
  };
}

function deriveWhy(s: StoredStory): string[] {
  const r: string[] = [];
  if ((s.source_count ?? 1) >= 3) r.push("Confirmed by multiple trusted sources.");
  if ((s.confidence_score ?? 0) >= 80) r.push("High source confidence.");
  if (s.impact === "critical") r.push("Major AI development.");
  if ((s.momentum_score ?? 0) >= 70) r.push("Part of a fast-rising trend.");
  if (r.length === 0) r.push("Cleared Signal's editorial quality gate.");
  return r;
}

// Compact, factual trend context for the reasoning prompt (not a template for
// output — just evidence the model reasons over).
export function buildTrendContext(entities: string[], idx: Map<string, TrendEntity>): string {
  const parts: string[] = [];
  for (const id of entities ?? []) {
    const t = idx.get(id);
    if (!t) continue;
    parts.push(`${t.label}: ${t.trend_state} (${t.rolling_7d}/wk, ${t.rolling_14d}/14d, momentum ${t.momentum})`);
  }
  return parts.slice(0, 6).join("; ");
}

// Persist the reusable reasoning. One row per story, keyed by feed_item_id.
export async function persistStoryIntelligence(
  sb: any,
  rows: Array<{ feed_item_id: string; intel: StoryIntelligence; degraded: boolean }>,
): Promise<void> {
  if (rows.length === 0) return;
  const payload = rows.map((r) => ({
    feed_item_id: r.feed_item_id,
    intelligence: r.intel,
    significance: r.intel.understanding?.significance ?? 0,
    trend_name: r.intel.trend?.name ?? null,
    trend_direction: r.intel.trend?.direction ?? null,
    model: r.degraded ? "fallback" : MODEL,
    degraded: r.degraded,
    created_at: new Date().toISOString(),
  }));
  await dbWrite("story_intelligence.upsert", () =>
    sb.from("story_intelligence").upsert(payload, { onConflict: "feed_item_id" }));
}
