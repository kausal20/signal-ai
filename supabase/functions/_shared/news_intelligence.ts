// Signal Analysis — prompt + schema + validation for the `news-intelligence`
// edge function. No network here. Produces a STRUCTURED editorial analysis
// (executive summary, why-it-matters split, who wins/loses, market impact,
// timeline, key takeaways, related companies) grounded in the supplied article.
// Additive: legacy fields are preserved so older clients keep working.

export const CANONICAL_GROUPS = ["Developers", "Students", "Businesses", "Creators", "Researchers"] as const;
export type Group = (typeof CANONICAL_GROUPS)[number];

export const EVENT_TYPES = [
  "Product Launch", "Funding", "Research", "Acquisition", "Partnership",
  "Security", "Legal", "Interview", "Open Source", "Benchmark", "Official Blog", "News",
] as const;

export interface ArticleInput {
  id: string;
  title: string;
  summary?: string;
  why_it_matters?: string;
  source?: string;
  tag?: string;
}

export interface AffectedGroup {
  group: Group;
  impact: "High" | "Medium" | "Low" | "None";
  note: string;
}

export interface WhyMatters {
  business: string;
  technology: string;
  market: string;
}

export interface Timeline {
  past: string;
  present: string;
  next: string;
}

export interface Intelligence {
  // ── Structured editorial analysis (Signal Analysis) ──
  event_type: string;              // one of EVENT_TYPES
  executive_summary: string;       // <= 120 words, plain English
  why_matters: WhyMatters;         // business / technology / market impact
  who_wins: string[];              // up to 5
  who_loses: string[];             // up to 5
  market_impact: string;           // pricing / competition / adoption / implications
  key_takeaways: string[];         // 3-5
  timeline: Timeline;              // past / present / next
  related_companies: string[];     // up to 8 (tappable → search)
  impact_score: number;            // 0..100
  confidence: number;              // 0..100
  // ── Legacy fields (kept for back-compat with the previous sheet) ──
  summary: string;
  why_it_matters: string;
  affected_groups: AffectedGroup[];
  importance_score: number;
  related_topics: string[];
}

export const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    event_type: { type: "string", enum: [...EVENT_TYPES] },
    executive_summary: { type: "string" },
    why_matters: {
      type: "object",
      properties: { business: { type: "string" }, technology: { type: "string" }, market: { type: "string" } },
      required: ["business", "technology", "market"],
    },
    who_wins: { type: "array", items: { type: "string" } },
    who_loses: { type: "array", items: { type: "string" } },
    market_impact: { type: "string" },
    key_takeaways: { type: "array", items: { type: "string" } },
    timeline: {
      type: "object",
      properties: { past: { type: "string" }, present: { type: "string" }, next: { type: "string" } },
      required: ["past", "present", "next"],
    },
    related_companies: { type: "array", items: { type: "string" } },
    impact_score: { type: "integer" },
    confidence: { type: "integer" },
  },
  required: [
    "event_type", "executive_summary", "why_matters", "who_wins", "who_loses",
    "market_impact", "key_takeaways", "timeline", "related_companies", "impact_score", "confidence",
  ],
} as const;

export function buildPrompt(a: ArticleInput): string {
  const parts = [
    `Headline: ${a.title}`,
    a.summary ? `Summary: ${a.summary}` : "",
    a.why_it_matters ? `Editor note: ${a.why_it_matters}` : "",
    a.source ? `Source: ${a.source}` : "",
    a.tag ? `Category: ${a.tag}` : "",
  ].filter(Boolean).join("\n");

  return [
    "You are Signal's senior AI-industry editorial analyst (Bloomberg / Crunchbase quality).",
    "Analyze the AI/tech story below and produce a STRUCTURED, grounded analysis.",
    "",
    "HARD RULES:",
    "- Ground every claim in the supplied article. NEVER invent facts, numbers, dates, or quotes.",
    "- If the article does not support a field, keep it brief and factual — do not speculate. Empty array is allowed.",
    "- Be specific and concrete. NO vague filler like 'this could improve productivity', 'may create",
    "  opportunities', 'this changes AI'. Every sentence must carry a concrete, article-grounded point.",
    "- No hype, no marketing language.",
    "",
    "FIELDS:",
    `- event_type: the single best label from: ${EVENT_TYPES.join(", ")}.`,
    "- executive_summary: <= 120 words, plain English — what happened and the essential context.",
    "- why_matters: an object with THREE concrete sentences — business (commercial impact),",
    "  technology (technical significance), market (competitive/market impact).",
    "- who_wins: up to 5 short labels (companies or groups that benefit), e.g. 'Developers', 'OpenAI'.",
    "- who_loses: up to 5 short labels (companies or groups at risk), e.g. 'Legacy software', 'Smaller vendors'.",
    "- market_impact: 1-3 sentences on pricing, competition, adoption, and future implications.",
    "- key_takeaways: 3-5 concise, concrete bullet strings.",
    "- timeline: an object with past (what led here), present (what just happened), next (what to expect).",
    "- related_companies: up to 8 company/product names actually relevant to this story.",
    "- impact_score: integer 0-100 (importance + industry impact + long-term relevance).",
    "- confidence: integer 0-100 (your confidence given the input).",
    "- Return JSON ONLY. No markdown, no code fences, no prose outside the JSON.",
    "",
    "Article:",
    parts,
  ].join("\n");
}

function clampInt(n: unknown, lo: number, hi: number, fallback: number): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return fallback;
  return Math.max(lo, Math.min(hi, v));
}
function str(x: unknown, max = 600): string {
  return typeof x === "string" ? x.trim().slice(0, max) : "";
}
function strArray(x: unknown, cap: number, maxLen = 160): string[] {
  if (!Array.isArray(x)) return [];
  return x.map((s) => str(s, maxLen)).filter(Boolean).slice(0, cap);
}
function normalizeEventType(x: unknown): string {
  const v = str(x, 40);
  return (EVENT_TYPES as readonly string[]).find((e) => e.toLowerCase() === v.toLowerCase()) ?? "News";
}

/**
 * Validate + normalize raw provider JSON into a guaranteed-shaped Intelligence.
 * Throws only if the payload is unusable (no summary at all).
 */
export function validateIntelligence(raw: unknown): Intelligence {
  if (!raw || typeof raw !== "object") throw new Error("intelligence: non-object payload");
  const r = raw as Record<string, unknown>;

  const executive_summary = str(r.executive_summary, 1200) || str(r.summary, 1200);
  if (!executive_summary) throw new Error("intelligence: missing summary");

  const wm = (r.why_matters && typeof r.why_matters === "object") ? r.why_matters as Record<string, unknown> : {};
  const why_matters: WhyMatters = {
    business: str(wm.business, 400),
    technology: str(wm.technology, 400),
    market: str(wm.market, 400),
  };

  const tl = (r.timeline && typeof r.timeline === "object") ? r.timeline as Record<string, unknown> : {};
  const timeline: Timeline = {
    past: str(tl.past, 300),
    present: str(tl.present, 300),
    next: str(tl.next, 300),
  };

  // Legacy affected_groups (kept if the model still returns them; otherwise empty).
  const rawGroups = Array.isArray(r.affected_groups) ? r.affected_groups : [];
  const byName = new Map<string, Record<string, unknown>>();
  for (const g of rawGroups) {
    if (g && typeof g === "object") {
      const name = str((g as Record<string, unknown>).group, 40);
      if (name) byName.set(name.toLowerCase(), g as Record<string, unknown>);
    }
  }
  const affected_groups: AffectedGroup[] = CANONICAL_GROUPS.map((group) => {
    const g = byName.get(group.toLowerCase());
    const impactRaw = str(g?.impact, 10);
    const impact = (["High", "Medium", "Low", "None"].find((x) => x.toLowerCase() === impactRaw.toLowerCase()) ?? "None") as AffectedGroup["impact"];
    return { group, impact, note: str(g?.note, 120) };
  });

  const impact = clampInt(r.impact_score ?? r.importance_score, 0, 100, 60);

  return {
    event_type: normalizeEventType(r.event_type),
    executive_summary,
    why_matters,
    who_wins: strArray(r.who_wins, 5, 40),
    who_loses: strArray(r.who_loses, 5, 40),
    market_impact: str(r.market_impact, 800),
    key_takeaways: strArray(r.key_takeaways, 5),
    timeline,
    related_companies: strArray(r.related_companies, 8, 40),
    impact_score: impact,
    confidence: clampInt(r.confidence, 0, 100, 60),
    // Legacy mirrors.
    summary: executive_summary,
    why_it_matters: [why_matters.business, why_matters.technology, why_matters.market].filter(Boolean).join(" ") || str(r.why_it_matters, 800),
    affected_groups,
    importance_score: impact,
    related_topics: strArray(r.related_topics, 8, 40),
  };
}
