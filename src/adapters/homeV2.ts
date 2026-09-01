// Adapter layer — maps production domain models onto the ui-v2 data contract.
// PRESENTATION ONLY: no fetching, no business logic, no mutation. Every value
// comes from data the app already computed (usePersonalizedFeed, projects.ts,
// recommend.ts). Keeps ui-v2 pages backend-agnostic per shared/types.ts.

import type { FeedItem } from "@/data/feed";
import type { Project as ProdProject } from "@/lib/projects";
import { computeUpdates, stageProgress } from "@/lib/projects";
import {
  whyThisMatters,
  buildWhyItMatters, executiveSummary, heroBadge, trustSignals, isOfficialItem,
  type WhyProfile,
} from "@/lib/recommend";
import type {
  Signal, Recommendation, Project, PlanStep, SourceKey,
  TrendingTerm, Collection, SourceSummary,
} from "@/ui-v2/shared/types";

// Production source string/label -> ui-v2 bundled brand-logo key.
const SOURCE_KEY: Partial<Record<string, SourceKey>> = {
  github: "github",
  reddit: "reddit",
  producthunt: "producthunt",
  "product hunt": "producthunt",
  arxiv: "arxiv",
  hn: "hackernews",
  hackernews: "hackernews",
  "hacker news": "hackernews",
  openai: "openai",
  anthropic: "anthropic",
  google: "google",
  "google ai": "google",
  "google deepmind": "google",
  deepmind: "google",
  meta: "meta",
  "meta ai": "meta",
  mistral: "mistral",
  cursor: "cursor",
  nvidia: "nvidia",
  microsoft: "microsoft",
  "microsoft ai": "microsoft",
  azure: "azure",
  "microsoft azure": "azure",
  perplexity: "perplexity",
  runway: "runway",
  langchain: "langchain",
  huggingface: "huggingface",
  "hugging face": "huggingface",
  apple: "apple",
};

const SOURCE_LABEL: Partial<Record<string, string>> = {
  github: "GitHub",
  reddit: "Reddit",
  producthunt: "Product Hunt",
  "product hunt": "Product Hunt",
  arxiv: "arXiv",
  hn: "Hacker News",
  hackernews: "Hacker News",
  "hacker news": "Hacker News",
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google",
  "google ai": "Google",
  "google deepmind": "Google",
  deepmind: "Google",
  meta: "Meta",
  "meta ai": "Meta",
  mistral: "Mistral",
  cursor: "Cursor",
  nvidia: "NVIDIA",
  microsoft: "Microsoft",
  "microsoft ai": "Microsoft",
  azure: "Azure",
  "microsoft azure": "Azure",
  perplexity: "Perplexity",
  runway: "Runway",
  langchain: "LangChain",
  huggingface: "Hugging Face",
  "hugging face": "Hugging Face",
  apple: "Apple",
  blog: "Blog",
};

export function sourceKeyFor(source: string): SourceKey | undefined {
  const key = normalizeSource(source);
  return SOURCE_KEY[key] ?? BRAND_RULES.find((rule) => rule.match.test(key))?.key;
}

export function sourceLabelFor(source: string): string {
  const s = normalizeSource(source);
  return SOURCE_LABEL[s] ?? (s ? s.charAt(0).toUpperCase() + s.slice(1) : "Signal");
}

function normalizeSource(source: string | undefined | null): string {
  return (source ?? "")
    .toLowerCase()
    .replace(/\bcoverage\b/g, "")
    .replace(/\bofficial\b/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function domainOf(url: string | undefined): string {
  if (!url) return "";
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

interface BrandRule {
  key: SourceKey;
  label: string;
  domains: string[];
  match: RegExp;
}

const BRAND_RULES: BrandRule[] = [
  { key: "nvidia", label: "NVIDIA", domains: ["nvidia.com"], match: /\b(nvidia|blackwell|cuda|gb[0-9]{3,})\b/i },
  { key: "azure", label: "Azure", domains: ["azure.microsoft.com"], match: /\b(azure|microsoft azure)\b/i },
  { key: "microsoft", label: "Microsoft", domains: ["microsoft.com"], match: /\b(microsoft|copilot)\b/i },
  { key: "openai", label: "OpenAI", domains: ["openai.com"], match: /\b(openai|chatgpt|gpt[- ]?[45]|sora)\b/i },
  { key: "anthropic", label: "Anthropic", domains: ["anthropic.com"], match: /\b(anthropic|claude)\b/i },
  { key: "google", label: "Google", domains: ["google.com", "blog.google", "research.google", "deepmind.com", "deepmind.google"], match: /\b(google|deepmind|gemini)\b/i },
  { key: "meta", label: "Meta", domains: ["meta.com", "ai.meta.com"], match: /\b(meta|llama)\b/i },
  { key: "mistral", label: "Mistral", domains: ["mistral.ai"], match: /\bmistral\b/i },
  { key: "cursor", label: "Cursor", domains: ["cursor.com"], match: /\bcursor\b/i },
  { key: "perplexity", label: "Perplexity", domains: ["perplexity.ai"], match: /\bperplexity\b/i },
  { key: "runway", label: "Runway", domains: ["runwayml.com"], match: /\brunway\b/i },
  { key: "langchain", label: "LangChain", domains: ["langchain.com"], match: /\blangchain\b/i },
  { key: "huggingface", label: "Hugging Face", domains: ["huggingface.co"], match: /\b(huggingface|hugging face)\b/i },
  { key: "apple", label: "Apple", domains: ["apple.com"], match: /\bapple\b/i },
  { key: "github", label: "GitHub", domains: ["github.com"], match: /\bgithub\b/i },
  { key: "arxiv", label: "arXiv", domains: ["arxiv.org"], match: /\barxiv\b/i },
  { key: "reddit", label: "Reddit", domains: ["reddit.com"], match: /\breddit\b/i },
  { key: "producthunt", label: "Product Hunt", domains: ["producthunt.com"], match: /\b(producthunt|product hunt)\b/i },
];

function brandFromDomain(url: string): BrandRule | undefined {
  const domain = domainOf(url);
  if (!domain) return undefined;
  return BRAND_RULES.find((rule) =>
    rule.domains.some((d) => domain === d || domain.endsWith(`.${d}`)),
  );
}

function brandFromText(text: string | undefined): BrandRule | undefined {
  if (!text) return undefined;
  return BRAND_RULES.find((rule) => rule.match.test(text));
}

function sourceIdentityFor(item: FeedItem): { label: string; key?: SourceKey } {
  const source = normalizeSource(item.source);
  const rawLabel = item.sourceLabel?.trim();
  const sourceKey = sourceKeyFor(item.source);
  const labelKey = sourceKeyFor(rawLabel ?? "");

  if (source !== "blog" && sourceKey) {
    return { label: sourceLabelFor(item.source), key: sourceKey };
  }

  if (rawLabel && normalizeSource(rawLabel) !== "blog" && labelKey) {
    return { label: sourceLabelFor(rawLabel), key: labelKey };
  }

  const brand =
    brandFromDomain(item.url) ??
    brandFromText(rawLabel) ??
    brandFromText(`${item.title} ${item.summary} ${item.whyItMatters}`);

  if (brand) return { label: brand.label, key: brand.key };

  return {
    label: rawLabel && normalizeSource(rawLabel) !== "blog" ? rawLabel : sourceLabelFor(item.source),
    key: sourceKey,
  };
}

export function formatTimeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// Clean a grounded insight string: strip the pipeline's "Opportunity:" label,
// any HTML/entity noise, and collapse whitespace. Never fabricates.
function cleanInsight(s?: string | null): string | undefined {
  if (!s) return undefined;
  const out = s
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/<[^>]+>/g, " ")
    .replace(/\bOpportunity:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return out.length >= 12 ? out : undefined;
}

// FeedItem → ui-v2 Signal (feed card / brief / top-signal row).
export function mapSignal(item: FeedItem, saved: boolean): Signal {
  const intel = item.intel;
  const sourceIdentity = sourceIdentityFor(item);
  // Some pipeline labels bake "(Official)"/"{Official}" into the publisher name.
  // That's a verification signal, not part of the name: promote it to the badge
  // and strip it from the displayed publisher.
  const rawLabel = sourceIdentity.label;
  const labelOfficial = /[[({]\s*official\s*[\])}]|\bofficial\b\s*$/i.test(rawLabel);
  const cleanLabel = rawLabel.replace(/\s*[[({]\s*official\s*[\])}]\s*$/i, "").replace(/\s+official\s*$/i, "").trim() || rawLabel;
  // Same rule as `insight` below: `intel?.recommendationReason` is a generic
  // 2-value template for archive-supplement cards ("Official company source" /
  // "High-quality archive signal", set in personalize/index.ts's archive
  // branch, which never populates personalizedTakeaway) — real Today's Brief
  // rail cards (HomePage.tsx) render this directly, so it must never be
  // generic filler. `personalizedTakeaway` (from the real per-persona LLM
  // pipeline) stays first when genuinely present; `whyItMatters` (real
  // editorial text) is the honest fallback, never the generic template.
  const takeaway = intel?.personalizedTakeaway ?? item.whyItMatters ?? undefined;
  // Signal AI insight = grounded "what matters" for THIS article only.
  // `item.whyItMatters` is the editorial pipeline's per-article field — the
  // only source here guaranteed to be specific to this story.
  // Deliberately EXCLUDED: `intel?.opportunity?.explanation` — that comes from
  // a rule-based catalog of ~8 fixed category strings (e.g. "Hand a repetitive
  // process to an agent and reclaim hours.") picked by keyword match, not
  // generated per article. Any story matching the same keyword regex gets the
  // exact same sentence, which is what caused the repeated-teaser bug. Also
  // excluded: `intel?.recommendationReason` — for archive-supplement cards
  // it's one of two fixed strings ("Official company source" / "High-quality
  // archive signal"), same problem. No article-specific insight → no teaser,
  // never a fabricated generic one (FeedCard already hides it when undefined).
  const insight = cleanInsight(item.whyItMatters);
  return {
    id: item.id,
    title: item.title,
    source: cleanLabel,
    sourceKey: sourceIdentity.key,
    score: Math.round(intel?.signalScore ?? item.score ?? 0),
    tag: item.tag,
    timeAgo: formatTimeAgo(item.timestamp),
    takeaway: takeaway || undefined,
    insight,
    critical: item.impact === "critical",
    saved,
    // Structured content for the Top Story card (grounded feed fields).
    whatHappened: item.summary || undefined,
    affected: item.whoFor || undefined,
    category: item.category,
    // Source attribution — straight from the original article, nothing invented.
    url: item.url,
    domain: domainOf(item.url),
    publishedAt: item.timestamp,
    verified: !!sourceIdentity.key,   // a resolved brand logo ⇒ recognized publisher
    isOfficial: isOfficialItem(item, sourceIdentity.key) || labelOfficial,
  };
}

// FeedItem (hero pick) → ui-v2 Recommendation — the "My Pick" intelligence
// briefing. Headline, summary, personalized reasons, badge, and trust signals
// are all derived from real backend intelligence (entities, impact, source,
// timestamp) + the learned user profile. Nothing hardcoded.
export function mapRecommendation(
  item: FeedItem,
  saved: boolean,
  profile?: WhyProfile,
  savedEntities?: Set<string>,
): Recommendation {
  const opp = item.intel?.opportunity;
  const brandIdentity = sourceIdentityFor(item);
  const official = isOfficialItem(item, brandIdentity.key);
  const badge = heroBadge(item, official);
  return {
    id: item.id,
    type: opp?.type ?? item.tag ?? "signal",
    // The real story headline (what happened) — not the opportunity pitch.
    title: item.title,
    reason: whyThisMatters(item),
    summary: executiveSummary(item),
    reasons: buildWhyItMatters(item, {
      brand: brandIdentity.label,
      brandKey: brandIdentity.key,
      profile,
      savedEntities,
    }),
    badge,
    trust: trustSignals(item, official, badge?.label),
    official,
    conviction: Math.round(item.intel?.signalScore ?? item.score ?? 0),
    ctaLabel: "Explore Story",
    saved,
  };
}

// Local project + related feed → ui-v2 Project ("Continue Building"). Null when
// there is no active project (caller hides the section).
export function mapProject(project: ProdProject | null, feed: FeedItem[]): Project | null {
  if (!project) return null;
  const updates = computeUpdates(project, feed);
  return {
    id: project.id,
    title: project.name,
    yesterday: `You were in the ${project.stage} stage.`,
    today: updates.count > 0
      ? `${updates.note}.`
      : "Nothing important changed — safe to continue where you left off.",
    progress: stageProgress(project.stage),
  };
}

// Production action rows → ui-v2 Timeline PlanStep[]. `done` from the caller's
// per-day completion set (localStorage-backed). Presentation shaping only.
export function mapPlanSteps(
  actions: { id: string; title: string; time: string }[],
  doneIds: string[],
): PlanStep[] {
  return actions.map((a) => ({
    id: a.id,
    time: a.time,
    title: a.title,
    done: doneIds.includes(a.id),
  }));
}

// ── Search (P3) ────────────────────────────────────────────────────────────
// Real feed-derived counts only — no fabricated momentum/percentages.

function matchCount(feed: FeedItem[], term: string): number {
  const q = term.trim().toLowerCase();
  if (!q) return 0;
  return feed.filter((i) =>
    `${i.title} ${i.summary} ${i.whyItMatters}`.toLowerCase().includes(q),
  ).length;
}

// Existing trending terms → leaderboard rows. `signals` = live feed matches,
// `rising` = whether the term currently has coverage. No invented momentum %.
export function mapTrending(terms: string[], feed: FeedItem[]): TrendingTerm[] {
  return terms.map((term, i) => {
    const n = matchCount(feed, term);
    return {
      rank: i + 1,
      term,
      signals: n.toLocaleString(),
      momentum: n > 0 ? "live" : "—",
      rising: n > 0,
    };
  });
}

// Existing featured collections → ui-v2 Collection cards. `id` carries the
// search query so onOpenCollection can run it. `stat` = real feed matches.
export function mapCollections(
  cols: { title: string; description?: string; query: string }[],
  feed: FeedItem[],
): Collection[] {
  return cols.map((c) => ({
    id: c.query,
    title: c.title,
    subtitle: c.description,
    stat: matchCount(feed, c.query).toLocaleString(),
    statLabel: "signals",
  }));
}

// ── Saved (P4) ─────────────────────────────────────────────────────────────
// The same 5 collections the old SavedCollections used, surfaced as tabs.
// Classification is first-match (dedup) in this exact order, "news" catch-all —
// identical grouping semantics to the old grouped view.
export const SAVED_COLLECTIONS: { id: string; label: string }[] = [
  { id: "all", label: "All" },
  { id: "tool", label: "AI Tools" },
  { id: "use-case", label: "Workflows" },
  { id: "prompt", label: "Prompts" },
  { id: "research", label: "Research" },
  { id: "news", label: "Business & News" },
];

export function classifySaved(item: FeedItem): string {
  if (item.tag === "tool") return "tool";
  if (item.tag === "use-case") return "use-case";
  if (item.tag === "prompt") return "prompt";
  if (item.source === "arxiv" || item.category === "models") return "research";
  return "news";
}

// ── Settings (P6) ──────────────────────────────────────────────────────────
// Human labels for the stored (backend-valid) ids. Display only.
export const SETTINGS_GOAL_LABEL: Record<string, string> = {
  build_ai_startup: "Build an AI startup",
  grow_business: "Grow my business",
  automate_work: "Automate my work",
  become_ai_developer: "Become an AI developer",
  learn_ai: "Learn AI",
  discover_business_opportunities: "Find AI opportunities",
  stay_updated: "Stay updated with AI",
  ai_research: "Go deep on research",
};

export const SETTINGS_ROLE_LABEL: Record<string, string> = {
  founder: "Founder", developer: "Developer", student: "Student",
  ai_engineer: "AI Engineer", freelancer: "Freelancer", marketer: "Marketer",
  researcher: "Researcher", investor: "Investor", product_manager: "Product Manager",
  other: "Explorer",
};

export const SETTINGS_TIME_LABEL: Record<string, string> = {
  lt_2h: "< 2 hrs / wk", "2_5h": "2–5 hrs / wk", "5_10h": "5–10 hrs / wk",
  "10_20h": "10–20 hrs / wk", "20h_plus": "20+ hrs / wk",
};

// Stored profile → ui-v2 Settings "Current goal" card. Real values only.
export function mapGoalCard(p: {
  primary_goal?: string | null; primary_role?: string | null; weekly_time_budget?: string | null;
}): { title: string; focus?: string; weeklyTime?: string } {
  return {
    title: (p.primary_goal && SETTINGS_GOAL_LABEL[p.primary_goal]) || "Set your goal",
    focus: p.primary_role ? (SETTINGS_ROLE_LABEL[p.primary_role] ?? p.primary_role) : undefined,
    weeklyTime: p.weekly_time_budget ? (SETTINGS_TIME_LABEL[p.weekly_time_budget] ?? p.weekly_time_budget) : undefined,
  };
}

// Live feed -> "browse by source" rows. Generic blog items are folded into the
// detected brand when possible, then counted per source.
export function mapSources(feed: FeedItem[]): (SourceSummary & { term: string })[] {
  const counts = new Map<SourceKey, { name: string; count: number }>();
  for (const item of feed) {
    const identity = sourceIdentityFor(item);
    if (!identity.key) continue;
    const prev = counts.get(identity.key);
    counts.set(identity.key, {
      name: prev?.name ?? identity.label,
      count: (prev?.count ?? 0) + 1,
    });
  }

  return Array.from(counts.entries())
    .map(([key, value]) => ({
      key,
      name: value.name,
      count: value.count.toLocaleString(),
      term: value.name,
    }))
    .sort((a, b) => Number(b.count.replace(/[^0-9]/g, "")) - Number(a.count.replace(/[^0-9]/g, "")));
}
