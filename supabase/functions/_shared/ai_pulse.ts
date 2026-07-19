// AI Pulse — pure prompt + schema + validator layer for the `ai-pulse` edge
// function. No network here. Mirrors the front-end PulseData shape. Additive.

export interface PulseData {
  overview: {
    launches: number; funding_rounds: number; acquisitions: number;
    research_papers: number; open_source: number; model_launches: number; api_releases: number;
  };
  leader: { company: string; launches: number; partnerships: number; acquisitions: number };
  companies: { name: string; latest_model: string; latest_release: string; activity_score: number; trend: "up" | "down" | "flat" }[];
  trending: { name: string; note: string; change: number }[];
  releases: { company: string; title: string; when: string; kind: string }[];
  funding: { company: string; amount: string; round: string; investor?: string }[];
  partnerships: { a: string; b: string; note: string }[];
  heatmap: { label: string; level: "green" | "yellow" | "red"; note?: string }[];
  analysis: {
    industry_trend: string; key_insight: string; biggest_winner: string;
    biggest_loser: string; developer_impact: string; business_impact: string;
  };
}

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    overview: {
      type: "object",
      properties: {
        launches: { type: "integer" }, funding_rounds: { type: "integer" }, acquisitions: { type: "integer" },
        research_papers: { type: "integer" }, open_source: { type: "integer" },
        model_launches: { type: "integer" }, api_releases: { type: "integer" },
      },
      required: ["launches", "funding_rounds", "acquisitions", "research_papers", "open_source", "model_launches", "api_releases"],
    },
    leader: {
      type: "object",
      properties: { company: { type: "string" }, launches: { type: "integer" }, partnerships: { type: "integer" }, acquisitions: { type: "integer" } },
      required: ["company", "launches", "partnerships", "acquisitions"],
    },
    companies: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" }, latest_model: { type: "string" }, latest_release: { type: "string" },
          activity_score: { type: "integer" }, trend: { type: "string", enum: ["up", "down", "flat"] },
        },
        required: ["name", "latest_model", "latest_release", "activity_score", "trend"],
      },
    },
    trending: { type: "array", items: { type: "object", properties: { name: { type: "string" }, note: { type: "string" }, change: { type: "number" } }, required: ["name", "note", "change"] } },
    releases: { type: "array", items: { type: "object", properties: { company: { type: "string" }, title: { type: "string" }, when: { type: "string" }, kind: { type: "string" } }, required: ["company", "title", "when", "kind"] } },
    funding: { type: "array", items: { type: "object", properties: { company: { type: "string" }, amount: { type: "string" }, round: { type: "string" }, investor: { type: "string" } }, required: ["company", "amount", "round"] } },
    partnerships: { type: "array", items: { type: "object", properties: { a: { type: "string" }, b: { type: "string" }, note: { type: "string" } }, required: ["a", "b", "note"] } },
    heatmap: { type: "array", items: { type: "object", properties: { label: { type: "string" }, level: { type: "string", enum: ["green", "yellow", "red"] }, note: { type: "string" } }, required: ["label", "level"] } },
    analysis: {
      type: "object",
      properties: {
        industry_trend: { type: "string" }, key_insight: { type: "string" }, biggest_winner: { type: "string" },
        biggest_loser: { type: "string" }, developer_impact: { type: "string" }, business_impact: { type: "string" },
      },
      required: ["industry_trend", "key_insight", "biggest_winner", "biggest_loser", "developer_impact", "business_impact"],
    },
  },
  required: ["overview", "leader", "companies", "trending", "releases", "funding", "partnerships", "heatmap", "analysis"],
} as const;

export function buildPrompt(): string {
  return [
    "You are Signal's AI Pulse analyst. Produce a concise, factual snapshot of the",
    "AI industry over the last ~7 days for a technical audience.",
    "",
    "Cover: overview counts, the week's leading company, a company leaderboard",
    "(OpenAI, Anthropic, Google, Meta, xAI, Perplexity, Mistral, DeepSeek), trending",
    "companies with a % change, latest releases (newest first), funding activity,",
    "notable partnerships, an ecosystem heatmap (green/yellow/red per area), and a",
    "short analysis (trend, key insight, biggest winner/loser, developer + business impact).",
    "",
    "Rules: be neutral and specific; no hype. `activity_score` 0–100. `change` is a",
    "percent (may be negative). Return JSON ONLY — no markdown, no prose outside JSON.",
  ].join("\n");
}

// ── Validation / normalization ─────────────────────────────────────────────
function int(x: unknown, fallback = 0): number { const v = Math.round(Number(x)); return Number.isFinite(v) ? v : fallback; }
function num(x: unknown, fallback = 0): number { const v = Number(x); return Number.isFinite(v) ? v : fallback; }
function str(x: unknown, max = 400): string { return typeof x === "string" ? x.trim().slice(0, max) : ""; }
function clampScore(x: unknown): number { return Math.max(0, Math.min(100, int(x, 50))); }
function arr(x: unknown): unknown[] { return Array.isArray(x) ? x : []; }

export function validatePulse(raw: unknown): PulseData {
  if (!raw || typeof raw !== "object") throw new Error("pulse: non-object payload");
  const r = raw as Record<string, any>;
  const ov = r.overview ?? {};
  const an = r.analysis ?? {};
  const ld = r.leader ?? {};

  const trend = (t: unknown): "up" | "down" | "flat" =>
    t === "up" || t === "down" || t === "flat" ? t : "flat";
  const level = (l: unknown): "green" | "yellow" | "red" =>
    l === "green" || l === "yellow" || l === "red" ? l : "yellow";

  const companies = arr(r.companies).map((c: any) => ({
    name: str(c?.name, 40), latest_model: str(c?.latest_model, 60),
    latest_release: str(c?.latest_release, 40), activity_score: clampScore(c?.activity_score), trend: trend(c?.trend),
  })).filter((c) => c.name).slice(0, 12);

  if (!companies.length) throw new Error("pulse: no companies");

  return {
    overview: {
      launches: int(ov.launches), funding_rounds: int(ov.funding_rounds), acquisitions: int(ov.acquisitions),
      research_papers: int(ov.research_papers), open_source: int(ov.open_source),
      model_launches: int(ov.model_launches), api_releases: int(ov.api_releases),
    },
    leader: { company: str(ld.company, 40) || companies[0].name, launches: int(ld.launches), partnerships: int(ld.partnerships), acquisitions: int(ld.acquisitions) },
    companies,
    trending: arr(r.trending).map((t: any) => ({ name: str(t?.name, 40), note: str(t?.note, 120), change: num(t?.change) })).filter((t) => t.name).slice(0, 8),
    releases: arr(r.releases).map((x: any) => ({ company: str(x?.company, 40), title: str(x?.title, 140), when: str(x?.when, 30), kind: str(x?.kind, 24) })).filter((x) => x.title).slice(0, 12),
    funding: arr(r.funding).map((f: any) => ({ company: str(f?.company, 40), amount: str(f?.amount, 20), round: str(f?.round, 40), investor: str(f?.investor, 60) || undefined })).filter((f) => f.company).slice(0, 10),
    partnerships: arr(r.partnerships).map((p: any) => ({ a: str(p?.a, 40), b: str(p?.b, 40), note: str(p?.note, 120) })).filter((p) => p.a && p.b).slice(0, 10),
    heatmap: arr(r.heatmap).map((h: any) => ({ label: str(h?.label, 40), level: level(h?.level), note: str(h?.note, 60) || undefined })).filter((h) => h.label).slice(0, 12),
    analysis: {
      industry_trend: str(an.industry_trend, 400), key_insight: str(an.key_insight, 400),
      biggest_winner: str(an.biggest_winner, 200), biggest_loser: str(an.biggest_loser, 200),
      developer_impact: str(an.developer_impact, 400), business_impact: str(an.business_impact, 400),
    },
  };
}
