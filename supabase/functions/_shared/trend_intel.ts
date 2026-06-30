// Signal Intelligence Engine V3 — Trend Intelligence (CAP 4).
//
// Reasons ACROSS stories, not story-by-story. Once per day the engine takes the
// top moving entities (momentum + acceleration) and produces, in ONE LLM call:
// trend summary, why it matters, prediction, confidence, evidence. Cached in
// trend_intelligence and reused by every user. Cost = ~1 call/day, O(1) in users.

import { fetchWithTimeout } from "./text.ts";
import { dbWrite } from "./reliability.ts";
import type { TrendEntity } from "./types.ts";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const MODEL = "google/gemini-3-flash-preview";

export interface TrendInsight {
  entity_id: string;
  label: string;
  summary: string;
  why_it_matters: string;
  prediction: string;
  direction: "accelerating" | "slowing" | "emerging" | "declining" | "steady";
  acceleration: number;
  confidence: number;
  evidence: string[];
  degraded: boolean;
}

// Week-over-week acceleration from observation history.
export function computeAcceleration(thisWeek: number, priorWeek: number): number {
  const denom = Math.max(1, priorWeek);
  return Math.round(((thisWeek - priorWeek) / denom) * 100) / 100;
}

function directionFrom(state: string, accel: number): TrendInsight["direction"] {
  if (state === "rising" && accel >= 0.8) return "accelerating";
  if (state === "rising") return "emerging";
  if (state === "declining") return "declining";
  if (accel <= -0.4) return "slowing";
  return "steady";
}

interface TrendInput {
  entity: TrendEntity;
  acceleration: number;
  sampleHeadlines: string[];
}

const SYSTEM_PROMPT = `You are Signal's trend analyst. You see momentum data and sample headlines for several AI topics. For each, reason about the underlying movement and produce:
- summary: one plain sentence on what is happening with this topic across the ecosystem.
- why_it_matters: who this affects and why, in one sentence.
- prediction: the likely direction over the next 1-3 months, concrete.
- confidence: 0-100, honest. Low if data is thin or noisy.
- evidence: 1-3 short factual points drawn from the momentum data / headlines.
Reason across stories, not one story. No hype. Plain language. Never invent exact numbers.`;

const trendTool = [{
  type: "function",
  function: {
    name: "summarize_trends",
    description: "Return reasoned analysis for each provided trend.",
    parameters: {
      type: "object",
      properties: {
        trends: {
          type: "array",
          items: {
            type: "object",
            properties: {
              id: { type: "string" },
              summary: { type: "string" },
              why_it_matters: { type: "string" },
              prediction: { type: "string" },
              confidence: { type: "integer", minimum: 0, maximum: 100 },
              evidence: { type: "array", items: { type: "string" } },
            },
            required: ["id", "summary", "why_it_matters", "prediction", "confidence"],
          },
        },
      },
      required: ["trends"],
    },
  },
}];

export async function reasonTrends(
  inputs: TrendInput[],
  apiKey: string,
  breaker?: { canAttempt: () => boolean },
): Promise<{ insights: TrendInsight[]; ok: boolean }> {
  if (inputs.length === 0) return { insights: [], ok: true };
  const fallback = () => ({ insights: inputs.map((i) => fallbackTrend(i)), ok: false });
  if (breaker && !breaker.canAttempt()) return fallback();

  const payload = inputs.map((i) => ({
    id: i.entity.id,
    label: i.entity.label,
    rolling_7d: i.entity.rolling_7d,
    rolling_14d: i.entity.rolling_14d,
    momentum: i.entity.momentum,
    state: i.entity.trend_state,
    acceleration: i.acceleration,
    sample_headlines: i.sampleHeadlines.slice(0, 5),
  }));

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
            { role: "user", content: JSON.stringify(payload) },
          ],
          tools: trendTool,
          tool_choice: { type: "function", function: { name: "summarize_trends" } },
        }),
      }, 30000);
    } catch { resp = null; }
    if (resp && resp.ok) break;
    if (resp && resp.status !== 429 && resp.status < 500) break;
    await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) return fallback();

  try {
    const j = await resp.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return fallback();
    const parsed = JSON.parse(args) as { trends: any[] };
    const byId = new Map((parsed.trends ?? []).map((t) => [t.id, t]));
    const insights = inputs.map((i) => {
      const t = byId.get(i.entity.id);
      if (!t) return fallbackTrend(i);
      return {
        entity_id: i.entity.id,
        label: i.entity.label,
        summary: String(t.summary ?? ""),
        why_it_matters: String(t.why_it_matters ?? ""),
        prediction: String(t.prediction ?? ""),
        direction: directionFrom(i.entity.trend_state, i.acceleration),
        acceleration: i.acceleration,
        confidence: Math.max(0, Math.min(100, Number(t.confidence ?? 50))),
        evidence: Array.isArray(t.evidence) ? t.evidence.slice(0, 3) : [],
        degraded: false,
      };
    });
    return { insights, ok: true };
  } catch {
    return fallback();
  }
}

export function fallbackTrend(i: TrendInput): TrendInsight {
  const dir = directionFrom(i.entity.trend_state, i.acceleration);
  const verb = dir === "accelerating" ? "accelerating" : dir === "declining" ? "cooling" : dir === "slowing" ? "slowing" : "steady";
  return {
    entity_id: i.entity.id,
    label: i.entity.label,
    summary: `${i.entity.label} mentions are ${verb} (${i.entity.rolling_7d}/week vs ${i.entity.rolling_14d}/14d).`,
    why_it_matters: `Shifting attention around ${i.entity.label} signals where builders are moving.`,
    prediction: dir === "accelerating" ? `Expect more ${i.entity.label} launches over the next month.`
      : dir === "declining" ? `${i.entity.label} attention likely keeps fading near-term.`
      : `${i.entity.label} likely holds steady near-term.`,
    direction: dir,
    acceleration: i.acceleration,
    confidence: Math.min(70, 30 + i.entity.rolling_14d * 3),
    evidence: [`${i.entity.rolling_7d} signals in the last 7 days`, `momentum ${i.entity.momentum}`],
    degraded: true,
  };
}

export async function persistTrendIntelligence(sb: any, insights: TrendInsight[]): Promise<void> {
  if (insights.length === 0) return;
  const rows = insights.map((t) => ({
    entity_id: t.entity_id, label: t.label, summary: t.summary,
    why_it_matters: t.why_it_matters, prediction: t.prediction, direction: t.direction,
    acceleration: t.acceleration, confidence: t.confidence, evidence: t.evidence,
    degraded: t.degraded, updated_at: new Date().toISOString(),
  }));
  await dbWrite("trend_intelligence.upsert", () => sb.from("trend_intelligence").upsert(rows, { onConflict: "entity_id" }));
}
