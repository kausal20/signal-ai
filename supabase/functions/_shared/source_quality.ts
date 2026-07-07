// Phase 4 · Module 2 — Source Quality Engine (deterministic, registry-driven).
//
// Answers "how trustworthy is this publisher?" — not "how popular?". Pure, no
// LLM, O(1) registry lookup + deterministic content modifiers. ADDITIVE: it
// produces an explainable SourceQuality object; it does NOT change ranking math
// or Module 1. Registry is data (extend by adding an entry — no switch stmt).

import {
  MARKETING_RX, BANNED_HEADLINE_WORDS, RESEARCH_RX, BUILDER_RX,
  LOW_VALUE_LAUNCH_RX, NOISE_RX,
} from "./regex.ts";

export type Tier = "S+" | "S" | "A" | "B" | "C" | "D";
export type OriginalReporting =
  | "Original" | "Republished" | "Aggregated" | "Opinion" | "Tutorial" | "Marketing" | "Documentation";
export type Verification = "Verified" | "Corroborated" | "Single-source" | "Unverified";
export type UpdateFrequency = "High" | "Medium" | "Low" | "Unknown";

export interface SourceQuality {
  source_name: string;
  domain: string;
  tier: Tier;
  quality_score: number;      // 0..100 final
  confidence: number;         // 0..100 (corroboration-adjusted)
  official: boolean;
  historical_accuracy: number;
  technical_depth: number;    // 0..100
  editorial_quality: number;
  transparency: number;
  community_trust: number;
  bias_risk: number;          // 0..100 (higher = worse)
  original_reporting: OriginalReporting;
  verification: Verification;
  spam_risk: number;          // 0..100
  update_frequency: UpdateFrequency;
  reasoning: string[];
}

interface RegistryEntry {
  name: string;
  tier: Tier;
  official: boolean;
  historical_accuracy: number;
  technical_depth: number;
  editorial_quality: number;
  transparency: number;
  community_trust: number;
  update_frequency: UpdateFrequency;
}

// Data registry — extend by adding a domain key. Matched by domain suffix so
// subdomains (research.google.com, openai.com/blog) resolve to the parent.
const REGISTRY: Record<string, RegistryEntry> = {
  // ── Tier S+ · official AI labs / company / gov / university / peer-review ──
  "openai.com":     { name: "OpenAI", tier: "S+", official: true, historical_accuracy: 92, technical_depth: 82, editorial_quality: 88, transparency: 75, community_trust: 90, update_frequency: "Medium" },
  "anthropic.com":  { name: "Anthropic", tier: "S+", official: true, historical_accuracy: 92, technical_depth: 85, editorial_quality: 88, transparency: 80, community_trust: 90, update_frequency: "Medium" },
  "deepmind.com":   { name: "Google DeepMind", tier: "S+", official: true, historical_accuracy: 93, technical_depth: 90, editorial_quality: 88, transparency: 78, community_trust: 90, update_frequency: "Medium" },
  "deepmind.google":{ name: "Google DeepMind", tier: "S+", official: true, historical_accuracy: 93, technical_depth: 90, editorial_quality: 88, transparency: 78, community_trust: 90, update_frequency: "Medium" },
  "blog.google":    { name: "Google", tier: "S+", official: true, historical_accuracy: 88, technical_depth: 72, editorial_quality: 86, transparency: 70, community_trust: 85, update_frequency: "Medium" },
  "research.google":{ name: "Google Research", tier: "S+", official: true, historical_accuracy: 92, technical_depth: 90, editorial_quality: 86, transparency: 78, community_trust: 86, update_frequency: "Low" },
  "ai.meta.com":    { name: "Meta AI", tier: "S+", official: true, historical_accuracy: 88, technical_depth: 84, editorial_quality: 84, transparency: 76, community_trust: 84, update_frequency: "Medium" },
  "microsoft.com":  { name: "Microsoft", tier: "S+", official: true, historical_accuracy: 88, technical_depth: 78, editorial_quality: 85, transparency: 72, community_trust: 84, update_frequency: "Medium" },
  "nvidia.com":     { name: "NVIDIA", tier: "S+", official: true, historical_accuracy: 88, technical_depth: 82, editorial_quality: 84, transparency: 70, community_trust: 85, update_frequency: "Medium" },
  "mistral.ai":     { name: "Mistral", tier: "S+", official: true, historical_accuracy: 86, technical_depth: 84, editorial_quality: 82, transparency: 78, community_trust: 84, update_frequency: "Medium" },
  "x.ai":           { name: "xAI", tier: "S+", official: true, historical_accuracy: 82, technical_depth: 80, editorial_quality: 80, transparency: 68, community_trust: 80, update_frequency: "Medium" },
  "stanford.edu":   { name: "Stanford", tier: "S+", official: true, historical_accuracy: 93, technical_depth: 92, editorial_quality: 88, transparency: 85, community_trust: 88, update_frequency: "Low" },
  "mit.edu":        { name: "MIT", tier: "S+", official: true, historical_accuracy: 93, technical_depth: 92, editorial_quality: 88, transparency: 85, community_trust: 88, update_frequency: "Low" },
  "berkeley.edu":   { name: "UC Berkeley", tier: "S+", official: true, historical_accuracy: 92, technical_depth: 91, editorial_quality: 86, transparency: 84, community_trust: 86, update_frequency: "Low" },

  // ── Tier S · major labs / arxiv / established AI companies ──
  "arxiv.org":        { name: "arXiv", tier: "S", official: false, historical_accuracy: 82, technical_depth: 95, editorial_quality: 74, transparency: 90, community_trust: 82, update_frequency: "High" },
  "huggingface.co":   { name: "Hugging Face", tier: "S", official: false, historical_accuracy: 84, technical_depth: 86, editorial_quality: 78, transparency: 82, community_trust: 88, update_frequency: "High" },
  "openreview.net":   { name: "OpenReview", tier: "S", official: false, historical_accuracy: 86, technical_depth: 92, editorial_quality: 78, transparency: 88, community_trust: 80, update_frequency: "Medium" },
  "paperswithcode.com": { name: "Papers with Code", tier: "S", official: false, historical_accuracy: 82, technical_depth: 90, editorial_quality: 76, transparency: 84, community_trust: 82, update_frequency: "High" },
  "cohere.com":       { name: "Cohere", tier: "S", official: true, historical_accuracy: 84, technical_depth: 82, editorial_quality: 82, transparency: 76, community_trust: 80, update_frequency: "Medium" },

  // ── Tier A · quality tech press / analytics ──
  "techcrunch.com":       { name: "TechCrunch", tier: "A", official: false, historical_accuracy: 74, technical_depth: 48, editorial_quality: 78, transparency: 66, community_trust: 74, update_frequency: "High" },
  "theverge.com":         { name: "The Verge", tier: "A", official: false, historical_accuracy: 74, technical_depth: 46, editorial_quality: 80, transparency: 66, community_trust: 76, update_frequency: "High" },
  "wired.com":            { name: "Wired", tier: "A", official: false, historical_accuracy: 76, technical_depth: 52, editorial_quality: 82, transparency: 68, community_trust: 76, update_frequency: "High" },
  "technologyreview.com": { name: "MIT Technology Review", tier: "A", official: false, historical_accuracy: 82, technical_depth: 66, editorial_quality: 86, transparency: 74, community_trust: 80, update_frequency: "Medium" },
  "arstechnica.com":      { name: "Ars Technica", tier: "A", official: false, historical_accuracy: 80, technical_depth: 64, editorial_quality: 84, transparency: 72, community_trust: 80, update_frequency: "High" },
  "venturebeat.com":      { name: "VentureBeat", tier: "A", official: false, historical_accuracy: 70, technical_depth: 46, editorial_quality: 72, transparency: 62, community_trust: 68, update_frequency: "High" },

  // ── Tier B · open publishing / dev blogs ──
  "medium.com":    { name: "Medium", tier: "B", official: false, historical_accuracy: 56, technical_depth: 58, editorial_quality: 58, transparency: 55, community_trust: 60, update_frequency: "High" },
  "substack.com":  { name: "Substack", tier: "B", official: false, historical_accuracy: 58, technical_depth: 56, editorial_quality: 60, transparency: 58, community_trust: 62, update_frequency: "High" },
  "dev.to":        { name: "DEV", tier: "B", official: false, historical_accuracy: 58, technical_depth: 62, editorial_quality: 58, transparency: 60, community_trust: 64, update_frequency: "High" },

  // ── Tier C · community / launch boards ──
  "news.ycombinator.com": { name: "Hacker News", tier: "C", official: false, historical_accuracy: 60, technical_depth: 62, editorial_quality: 50, transparency: 70, community_trust: 78, update_frequency: "High" },
  "ycombinator.com":      { name: "Hacker News", tier: "C", official: false, historical_accuracy: 60, technical_depth: 62, editorial_quality: 50, transparency: 70, community_trust: 78, update_frequency: "High" },
  "reddit.com":           { name: "Reddit", tier: "C", official: false, historical_accuracy: 48, technical_depth: 46, editorial_quality: 40, transparency: 60, community_trust: 66, update_frequency: "High" },
  "producthunt.com":      { name: "Product Hunt", tier: "C", official: false, historical_accuracy: 54, technical_depth: 44, editorial_quality: 52, transparency: 62, community_trust: 68, update_frequency: "High" },
  "github.com":           { name: "GitHub", tier: "C", official: false, historical_accuracy: 66, technical_depth: 74, editorial_quality: 48, transparency: 78, community_trust: 76, update_frequency: "High" },
};

// Tier → base quality + tier confidence-floor.
const TIER_BASE: Record<Tier, number> = { "S+": 92, "S": 82, "A": 68, "B": 52, "C": 46, "D": 34 };
const TIER_RANK: Record<Tier, number> = { "S+": 6, "S": 5, "A": 4, "B": 3, "C": 2, "D": 1 };
const RANK_TIER: Record<number, Tier> = { 6: "S+", 5: "S", 4: "A", 3: "B", 2: "C", 1: "D" };

const UNKNOWN: RegistryEntry = {
  name: "Unknown source", tier: "D", official: false,
  historical_accuracy: 40, technical_depth: 40, editorial_quality: 38,
  transparency: 40, community_trust: 42, update_frequency: "Unknown",
};

function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));
}

/** Extract a registrable-ish domain from a URL. Empty string on failure. */
export function domainOf(url: string): string {
  try {
    const h = new URL(url).hostname.replace(/^www\./, "").toLowerCase();
    return h;
  } catch { return ""; }
}

// News aggregators re-host the real publisher. Their domain must NOT set trust —
// resolve the underlying publisher from the label instead (still flagged
// "Aggregated" by classifyOriginalReporting, which applies a quality penalty).
const AGGREGATOR_RX = /(^|\.)(news\.google|google|bing|news\.yahoo|flipboard|smartnews)\.[a-z.]+$/;

/** O(1)-ish registry resolve: exact, then suffix match (subdomains). */
function resolveEntry(domain: string, sourceLabel: string): RegistryEntry {
  if (domain && AGGREGATOR_RX.test(domain)) domain = "";  // defer to publisher label
  if (!domain) {
    // Fall back to the label (e.g. "Anthropic coverage" → anthropic).
    const lbl = (sourceLabel ?? "").toLowerCase();
    for (const key of Object.keys(REGISTRY)) {
      const stem = REGISTRY[key].name.toLowerCase().split(" ")[0];
      if (stem.length > 3 && lbl.includes(stem)) return REGISTRY[key];
    }
    return UNKNOWN;
  }
  if (REGISTRY[domain]) return REGISTRY[domain];
  for (const key of Object.keys(REGISTRY)) {
    if (domain === key || domain.endsWith("." + key)) return REGISTRY[key];
  }
  // Government / university heuristics (deterministic, not a switch of names).
  if (/\.gov(\.|$)/.test(domain)) return { name: domain, tier: "S+", official: true, historical_accuracy: 88, technical_depth: 66, editorial_quality: 82, transparency: 88, community_trust: 82, update_frequency: "Low" };
  if (/\.edu(\.|$)/.test(domain) || /\.ac\.[a-z]{2}$/.test(domain)) return { name: domain, tier: "S", official: false, historical_accuracy: 84, technical_depth: 86, editorial_quality: 80, transparency: 82, community_trust: 80, update_frequency: "Low" };
  return { ...UNKNOWN, name: domain };
}

// ── Content-signal classifiers (deterministic) ───────────────────────────────

function classifyOriginalReporting(blob: string, sourceLabel: string, domain: string, entry: RegistryEntry): OriginalReporting {
  const b = blob.toLowerCase();
  if (/\/docs?\/|\bapi (docs|reference|documentation)\b|documentation/.test(b) || /docs\./.test(domain)) return "Documentation";
  if (/coverage$/i.test(sourceLabel) || /google.*news|news\.google/.test(domain)) return "Aggregated";
  if (MARKETING_RX.test(b) && /\b(launch|introducing|announcing|available now|now available)\b/.test(b)) return "Marketing";
  if (/\b(tutorial|how to|how-to|step by step|beginner'?s guide|getting started)\b/.test(b)) return "Tutorial";
  if (/\b(opinion|i think|why .* is|the case for|hot take|unpopular opinion)\b/.test(b)) return "Opinion";
  if (entry.tier === "S+" || entry.tier === "S" || domain.endsWith("arxiv.org")) return "Original";
  if (entry.tier === "D") return "Republished";
  return "Original";
}

function biasRisk(blob: string, entry: RegistryEntry, original: OriginalReporting): { score: number; notes: string[] } {
  const notes: string[] = [];
  let s = 0;
  if (MARKETING_RX.test(blob)) { s += 28; notes.push("Marketing language detected → bias +28"); }
  if (/\bsponsored\b|partner content|paid post|in partnership with/i.test(blob)) { s += 40; notes.push("Sponsored/partner content → bias +40"); }
  if (original === "Marketing") { s += 18; notes.push("Product-promotion framing → bias +18"); }
  if (original === "Opinion") { s += 20; notes.push("Opinion piece → bias +20"); }
  if (entry.official && /\b(our|we|introducing our)\b/i.test(blob) && /\b(launch|available|announcing)\b/i.test(blob)) { s += 12; notes.push("First-party promoting own product → bias +12"); }
  return { score: clamp(s), notes };
}

function spamRisk(blob: string): { score: number; notes: string[] } {
  const notes: string[] = [];
  let s = 0;
  if (BANNED_HEADLINE_WORDS.test(blob)) { s += 22; notes.push("Hype/banned headline words → spam +22"); }
  if (/you won'?t believe|shocking|mind-?blowing|\b\d+\s+(things|ways|tips|tricks|reasons)\b/i.test(blob)) { s += 28; notes.push("Clickbait pattern → spam +28"); }
  if (LOW_VALUE_LAUNCH_RX.test(blob)) { s += 24; notes.push("Low-value niche launch → spam +24"); }
  if (NOISE_RX.test(blob)) { s += 16; notes.push("Newsletter/roundup/sponsored noise → spam +16"); }
  // Keyword stuffing: any token repeated a lot relative to length.
  const words = blob.toLowerCase().match(/[a-z][a-z0-9]{3,}/g) ?? [];
  if (words.length > 6) {
    const counts = new Map<string, number>();
    for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);
    const max = Math.max(...counts.values());
    if (max / words.length > 0.18) { s += 18; notes.push("Keyword stuffing → spam +18"); }
  }
  return { score: clamp(s), notes };
}

function technicalDepth(blob: string, entry: RegistryEntry): number {
  let d = entry.technical_depth;
  if (RESEARCH_RX.test(blob)) d += 8;
  if (BUILDER_RX.test(blob)) d += 5;
  if (MARKETING_RX.test(blob)) d -= 12;
  if (/\b(tutorial|beginner)\b/.test(blob.toLowerCase())) d -= 6;
  return clamp(d);
}

export interface SourceInput {
  url?: string;
  source?: string;
  source_label?: string;
  title?: string;
  summary?: string;
  /** distinct sources in the cluster (for corroboration). */
  source_count?: number;
  /** existing corroboration score if available. */
  corroboration_score?: number;
}

/**
 * Evaluate a publisher for one story. O(1) registry lookup + deterministic
 * content modifiers. Fully explainable via `reasoning`.
 */
export function evaluateSource(input: SourceInput): SourceQuality {
  const domain = domainOf(input.url ?? "");
  const entry = resolveEntry(domain, input.source_label ?? input.source ?? "");
  const blob = `${input.title ?? ""} ${input.summary ?? ""}`.trim();
  const reasoning: string[] = [];

  reasoning.push(`${entry.name} — Tier ${entry.tier}${entry.official ? " (official)" : ""}`);

  const original = classifyOriginalReporting(blob, input.source_label ?? "", domain, entry);
  const bias = biasRisk(blob, entry, original);
  const spam = spamRisk(blob);
  const tech = technicalDepth(blob, entry);
  reasoning.push(...bias.notes, ...spam.notes);
  reasoning.push(`Reporting type: ${original}`);

  // Original-reporting quality delta.
  const origDelta =
    original === "Original" ? 5 :
    original === "Documentation" ? 3 :
    original === "Tutorial" ? -2 :
    original === "Opinion" ? -5 :
    original === "Aggregated" ? -6 :
    original === "Republished" ? -5 :
    original === "Marketing" ? -10 : 0;

  // Corroboration → confidence + verification.
  const sc = Math.max(input.source_count ?? 1, 1);
  let verification: Verification;
  let confidence: number;
  if (sc >= 3 && (entry.tier === "S+" || entry.tier === "S")) { verification = "Verified"; confidence = 92; reasoning.push("Verified: 3+ sources incl. a trusted publisher → confidence 92"); }
  else if (sc >= 2) { verification = "Corroborated"; confidence = 78; reasoning.push(`Corroborated by ${sc} sources → confidence 78`); }
  else if (entry.tier === "S+" || entry.tier === "S" || entry.tier === "A") { verification = "Single-source"; confidence = 66; reasoning.push("Single trusted source → confidence 66"); }
  else { verification = "Unverified"; confidence = 42; reasoning.push("Single unknown source → confidence reduced to 42"); }
  if (typeof input.corroboration_score === "number") confidence = clamp((confidence + input.corroboration_score) / 2);

  // Final quality — base tier, adjusted by content signals.
  let quality = TIER_BASE[entry.tier]
    + (tech - 50) * 0.10
    + origDelta
    - bias.score * 0.15
    - spam.score * 0.22;
  quality = clamp(quality);

  // Tier can be demoted (never promoted) when spam/bias are severe.
  let tier = entry.tier;
  if (spam.score >= 55 || bias.score >= 70) {
    tier = RANK_TIER[Math.max(1, TIER_RANK[entry.tier] - 1)];
    reasoning.push(`High spam/bias → tier demoted to ${tier}`);
  }

  return {
    source_name: entry.name,
    domain: domain || "(unknown)",
    tier,
    quality_score: quality,
    confidence,
    official: entry.official,
    historical_accuracy: entry.historical_accuracy,
    technical_depth: tech,
    editorial_quality: entry.editorial_quality,
    transparency: entry.transparency,
    community_trust: entry.community_trust,
    bias_risk: bias.score,
    original_reporting: original,
    verification,
    spam_risk: spam.score,
    update_frequency: entry.update_frequency,
    reasoning,
  };
}
