// Signal Home category taxonomy — AI Intelligence topics, not resource types.
// Each article can belong to MULTIPLE categories (news + models + companies
// often overlap). Membership is derived from real feed fields (tag, category,
// content_category, trend_entities, source, title/summary) — no LLM, no static
// tables, no hardcoded article→category rows.
//
// Also exposes `withProgressiveFreshness()` — expands the recency window
// (24h → 3d → 7d → 30d → all) until a category has enough content, so no
// category ever feels empty when relevant intelligence exists.

import type { FeedItem } from "@/data/feed";

export type HomeCategoryId =
  | "all" | "news" | "models" | "companies" | "research" | "tools" | "startups";

export interface HomeCategory { id: HomeCategoryId; label: string; }

// Task-specified order.
export const HOME_CATEGORIES: HomeCategory[] = [
  { id: "all",       label: "All" },
  { id: "news",      label: "News" },
  { id: "models",    label: "Models" },
  { id: "companies", label: "Companies" },
  { id: "research",  label: "Research" },
  { id: "tools",     label: "Tools" },
  { id: "startups",  label: "Startups" },
];

// ── Membership rules (multi-category; every article gets EVERY category it fits)

const MODEL_TOKENS = [
  "gpt", "chatgpt", "claude", "opus", "sonnet", "gemini", "llama", "mistral",
  "deepseek", "qwen", "grok", "codex", "sora", "phi", "mixtral", "command",
  "reka", "yi", "openai model", "context window",
];
const RESEARCH_TOKENS = [
  "paper", "papers", "arxiv", "benchmark", "sota", "eval", "evaluation",
  "research", "study", "publication", "publications", "architecture",
  "safety research", "alignment", "training", "open-weights", "open weights",
];
const TOOL_TOKENS = [
  "launches", "launched", "launch", "released", "release", "feature", "features",
  "update", "updates", "app", "ide", "cli", "sdk", "api", "no-code", "nocode",
  "workflow", "automation", "editor", "coding assistant", "copilot",
  "image generator", "video generator", "voice", "tts", "stt",
];
const STARTUP_TOKENS = [
  "raise", "raises", "raised", "raising", "funding", "seed round", "series a",
  "series b", "series c", "series d", "valuation", "yc", "y combinator",
  "accelerator", "acqui-hire", "acquires", "acquisition", "founder", "founders",
  "founded", "spinout", "unicorn", "ipo",
];

const COMPANY_ENTITIES = new Set([
  "openai", "anthropic", "google", "google_deepmind", "deepmind", "microsoft",
  "meta", "apple", "amazon", "aws", "nvidia", "perplexity", "lovable", "cursor",
  "vercel", "supabase", "cloudflare", "stripe", "xai", "mistral", "cohere",
  "huggingface", "hugging_face", "langchain", "runway", "elevenlabs", "midjourney",
  "stability", "databricks", "groq", "replit",
]);

function textBlob(it: FeedItem): string {
  return `${it.title} ${it.summary} ${it.whyItMatters}`.toLowerCase();
}

function hasToken(hay: string, tokens: string[]): boolean {
  for (const t of tokens) if (hay.includes(t)) return true;
  return false;
}

function mentionsCompany(it: FeedItem): boolean {
  const ents = (it.trend_entities ?? []).map((e) => String(e).toLowerCase().replace(/[-\s]+/g, "_"));
  if (ents.some((e) => COMPANY_ENTITIES.has(e))) return true;
  const hay = textBlob(it);
  for (const c of COMPANY_ENTITIES) {
    const spaced = c.replace(/_/g, " ");
    if (hay.includes(spaced)) return true;
  }
  return false;
}

// A single article can belong to MULTIPLE categories.
export function categoriesFor(it: FeedItem): HomeCategoryId[] {
  const out = new Set<HomeCategoryId>(["all"]);
  const hay = textBlob(it);
  const cc = (it.content_category ?? "").toLowerCase();
  const cat = (it.category ?? "").toLowerCase();
  const tag = (it.tag ?? "").toLowerCase();

  // News — every non-tool/prompt item plus explicit editorial signals.
  if (
    tag === "news" ||
    /news|business|market|announce|partnership|acquisition|launch|policy|regulation|community/.test(`${cc} ${cat}`)
  ) out.add("news");

  // Models — model families + benchmarks + context/pricing updates.
  if (
    cat === "models" ||
    hasToken(hay, MODEL_TOKENS) ||
    /\bmodel\b|benchmark|context window/.test(hay)
  ) out.add("models");

  // Companies — named entities OR official-source signals.
  if (mentionsCompany(it) || (it as any).intel?.whyPicked?.some((w: string) => /official/i.test(w))) out.add("companies");

  // Research — arxiv source, research category, or research vocab.
  if (
    it.source === "arxiv" ||
    cc === "research breakthrough" ||
    hasToken(hay, RESEARCH_TOKENS)
  ) out.add("research");

  // Tools — tools/use-case tag, tool categories, product launches.
  if (
    tag === "tool" || tag === "use-case" ||
    cc === "tool of the day" || cc === "underrated tool" || cc === "workflow of the day" ||
    /\btool\b|\bapp\b|\bide\b|automation|coding assistant|image generator|video generator/.test(hay) ||
    hasToken(hay, TOOL_TOKENS)
  ) out.add("tools");

  // Startups — funding / founder / accelerator signals.
  if (cc === "founder opportunity" || hasToken(hay, STARTUP_TOKENS)) out.add("startups");

  return [...out];
}

export function isInCategory(it: FeedItem, id: HomeCategoryId): boolean {
  if (id === "all") return true;
  return categoriesFor(it).includes(id);
}

// ── Progressive freshness — expand the recency window until we have content.

const WINDOWS_H = [24, 72, 168, 720]; // 24h → 3d → 7d → 30d → all
const MIN_FOR_CATEGORY = 3;           // minimum items to consider a window "healthy"

export interface CategoryResult { items: FeedItem[]; window: string; expanded: boolean; }

export function withProgressiveFreshness(items: FeedItem[], category: HomeCategoryId): CategoryResult {
  const scoped = items.filter((it) => isInCategory(it, category));
  if (category === "all") return { items: scoped, window: "all", expanded: false };
  const now = Date.now();
  for (const h of WINDOWS_H) {
    const cutoff = now - h * 3600_000;
    const within = scoped.filter((it) => new Date(it.timestamp).getTime() >= cutoff);
    if (within.length >= MIN_FOR_CATEGORY) {
      return { items: within, window: h <= 24 ? "24h" : h <= 72 ? "3d" : h <= 168 ? "7d" : "30d", expanded: h > 24 };
    }
  }
  // Absolute fallback: everything in the category regardless of age.
  return { items: scoped, window: "all", expanded: true };
}
