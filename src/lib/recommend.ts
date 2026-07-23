// Presentation helpers for Home V2. Turn the existing intelligence + onboarding
// answers into ONE human "why" sentence and an action-oriented CTA label.
// No backend, no new data — pure formatting over data already on the client.

import type { FeedItem } from "@/data/feed";

const GOAL_PHRASE: Record<string, string> = {
  build_ai_startup: "you're building an AI startup",
  grow_business: "your goal is growing your business",
  automate_work: "you want to automate your work",
  become_ai_developer: "you're becoming an AI developer",
  learn_ai: "you're learning AI",
  discover_business_opportunities: "you're hunting AI business opportunities",
  stay_updated: "you want to stay ahead in AI",
  ai_research: "you're focused on AI research",
};

const ROLE_PHRASE: Record<string, string> = {
  founder: "you're a founder",
  developer: "you're a developer",
  ai_engineer: "you're an AI engineer",
  student: "you're learning AI",
  freelancer: "you're a freelancer",
  marketer: "you're a marketer",
  researcher: "you're a researcher",
  investor: "you're tracking AI bets",
  product_manager: "you're shipping product",
};

function read(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function topInterest(): string {
  try {
    const raw = localStorage.getItem("signal:interests");
    if (!raw) return "";
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) && arr.length ? arr[0] : "";
  } catch { return ""; }
}

// One sentence, never more. Trailing period included.
function reasonCore(item: FeedItem): string {
  const intel = item.intel;
  const rec = intel?.recommendationReason?.trim();
  if (rec) return rec.replace(/\.$/, "");
  const why = intel?.whyPicked?.[0]?.trim();
  if (why) return why.replace(/\.$/, "");

  const goal = read("signal:primary_goal");
  if (GOAL_PHRASE[goal]) return GOAL_PHRASE[goal];

  const role = read("signal:primary_role");
  if (ROLE_PHRASE[role]) return ROLE_PHRASE[role];

  const interest = topInterest();
  if (interest) return `you've been reading ${interest} content`;
  return "it matches what you follow on Signal";
}

// "WHY THIS MATTERS TO YOU" line for the hero.
export function whyThisMatters(item: FeedItem): string {
  const core = reasonCore(item);
  return `Because ${core}.`;
}

// "Recommended because …" line for ranked recommendations.
export function recommendedBecause(item: FeedItem): string {
  const core = reasonCore(item);
  return `Recommended because ${core}.`;
}

// Action-oriented CTA driven by opportunity type / tag.
export function ctaForOpportunity(item: FeedItem): string {
  const t = (item.intel?.opportunity?.type ?? "").toLowerCase();
  const tag = item.tag;
  if (/learn|research|study|skill|course|understand/.test(t)) return "Start Learning";
  if (tag === "tool" || tag === "use-case" || /build|ship|launch|automat|implement/.test(t)) return "Start Building";
  return "Explore";
}

// A short, specific recommendation headline (≤7 words) for the signature card.
export function shortRecommendation(item: FeedItem): string {
  const raw = item.intel?.opportunity?.title ?? item.intel?.personalizedTakeaway ?? item.title;
  const clean = raw.replace(/[:–—].*$/, "").trim();
  const words = clean.split(/\s+/);
  return words.length > 7 ? words.slice(0, 7).join(" ") : clean;
}

function confidenceLevel(item: FeedItem): "high" | "medium" | "low" {
  const intel = item.intel;
  const num = typeof intel?.roi?.confidence === "number" ? intel.roi.confidence : NaN;
  if (!Number.isNaN(num)) return num >= 75 ? "high" : num >= 55 ? "medium" : "low";
  const s = (intel?.confidence ?? intel?.opportunity?.confidence ?? "").toString().toLowerCase();
  if (/high|strong|very/.test(s)) return "high";
  if (/low|weak|maybe/.test(s)) return "low";
  return /medium|moderate/.test(s) ? "medium" : "high";
}

// Signal speaking, not a confidence percentage.
export function confidenceVoice(item: FeedItem): string {
  switch (confidenceLevel(item)) {
    case "high": return "I'm confident this is worth your time.";
    case "medium": return "I think this is worth a look.";
    default: return "Worth a quick scan if you have a minute.";
  }
}

// Signal speaking the impact, not "High impact".
export function impactVoice(item: FeedItem): string {
  const raw = (item.intel?.opportunity?.potential_impact ?? item.intel?.roi?.money_saved ?? "high").toString().toLowerCase();
  if (/high|major|critical|large/.test(raw)) return "Could become one of your highest-value skills.";
  if (/medium|moderate/.test(raw)) return "A solid addition to what you're building.";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

// ─────────────────────────────────────────────────────────────────────────────
// "My Pick For You Today" intelligence-briefing helpers.
// Everything below derives from data the client already holds — the personalize
// backend profile (interests/concepts/role learned from real behaviour), the
// story's own entities/impact/timestamp, and the user's saved set. Nothing is
// fabricated: every reason is gated on a signal that is actually present, and
// the generic backend boilerplate ("fits your profile", "cleared the quality
// bar") is filtered out.
// ─────────────────────────────────────────────────────────────────────────────

export interface WhyProfile {
  top_interests?: string[];
  top_concepts?: string[];
  interests?: string[];
  inferred_role?: string | null;
  primary_role?: string | null;
  primary_goal?: string | null;
  persona?: string | null;
}

// Company sources = genuine first-party publishers; aggregators are not.
const COMPANY_ENTITIES = new Set([
  "openai", "anthropic", "google", "deepmind", "meta", "microsoft", "azure",
  "mistral", "cursor", "perplexity", "runway", "langchain", "huggingface",
  "nvidia", "apple", "xai", "cohere", "stability", "elevenlabs", "midjourney",
]);

const PRETTY: Record<string, string> = {
  openai: "OpenAI", anthropic: "Anthropic", google: "Google", deepmind: "DeepMind",
  meta: "Meta", microsoft: "Microsoft", azure: "Azure", mistral: "Mistral",
  cursor: "Cursor", perplexity: "Perplexity", runway: "Runway", langchain: "LangChain",
  huggingface: "Hugging Face", nvidia: "NVIDIA", apple: "Apple", xai: "xAI",
  ai_agents: "AI agents", agents: "AI agents", llm: "LLMs", rag: "RAG",
  voice_ai: "voice AI", video_ai: "video AI", robotics: "robotics",
  reasoning: "reasoning models", open_weights: "open weights",
};

function pretty(entity: string): string {
  const k = entity.toLowerCase().trim();
  if (PRETTY[k]) return PRETTY[k];
  return k.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function readInterests(): string[] {
  try {
    const raw = localStorage.getItem("signal:interests") ?? localStorage.getItem("signal:topics");
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

// Normalized token bag of everything the user has signalled interest in.
function userTokens(profile?: WhyProfile): Set<string> {
  const bag = new Set<string>();
  const add = (s?: string | null) => { if (s) bag.add(s.toLowerCase().replace(/[_-]+/g, " ").trim()); };
  (profile?.top_interests ?? []).forEach(add);
  (profile?.top_concepts ?? []).forEach(add);
  (profile?.interests ?? []).forEach(add);
  readInterests().forEach(add);
  return bag;
}

const ROLE_MATTERS: Record<string, string> = {
  founder: "you're building a company",
  developer: "you ship code",
  ai_engineer: "you build AI systems",
  student: "you're learning AI",
  freelancer: "you sell AI work",
  marketer: "you run growth",
  researcher: "you track the frontier",
  investor: "you're placing AI bets",
  product_manager: "you're shipping product",
  // persona / inferred-role tokens (personalize returns these too).
  agency: "you run an automation agency",
  builder: "you ship AI products",
  operator: "you run AI operations",
};

// Resolve a canonical role token from the various profile fields (primary_role
// slug → persona → first word of the inferred-role label).
function roleToken(profile?: WhyProfile): string | undefined {
  const cands = [
    profile?.primary_role,
    profile?.persona,
    (profile?.inferred_role ?? "").split(/[\s—/-]/)[0],
  ].map((x) => String(x ?? "").toLowerCase().trim());
  return cands.find((c) => ROLE_MATTERS[c]);
}

function heroEntities(item: FeedItem): string[] {
  return (item.trend_entities ?? [])
    .map((e) => String(e).toLowerCase().trim())
    .filter(Boolean);
}

function tokenHit(bag: Set<string>, token: string): boolean {
  const t = token.toLowerCase().replace(/[_-]+/g, " ").trim();
  if (!t) return false;
  if (bag.has(t)) return true;
  for (const b of bag) {
    if (b.length >= 3 && (b.includes(t) || t.includes(b))) return true;
  }
  return false;
}

// True first-party / official source detection (no fabrication).
export function isOfficialItem(item: FeedItem, brandKey?: string): boolean {
  if (item.intel?.whyPicked?.some((w) => /official/i.test(w))) return true;
  if (brandKey && COMPANY_ENTITIES.has(brandKey.toLowerCase())) return true;
  return heroEntities(item).some((e) => COMPANY_ENTITIES.has(e));
}

/**
 * "Why this matters to you" — 2–4 reasons, each backed by a REAL signal, in
 * priority order (followed company → interest → concept engagement → saved
 * similar → backend reasons → role/goal). Falls back to trending / high-impact
 * ONLY when personal history is thin, and never returns fabricated copy.
 */
export function buildWhyItMatters(
  item: FeedItem,
  opts: { brand?: string; brandKey?: string; profile?: WhyProfile; savedEntities?: Set<string> } = {},
): string[] {
  const { brandKey, profile, savedEntities } = opts;
  // Strip data artifacts like "Coasty {Official}" / "(official)" from labels.
  const brand = opts.brand?.replace(/\s*[[({]\s*official\s*[\])}]/gi, "").trim() || undefined;
  const bag = userTokens(profile);
  const ents = heroEntities(item);
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (s?: string | null) => {
    if (!s) return;
    const key = s.toLowerCase();
    if (seen.has(key) || out.length >= 4) return;
    seen.add(key);
    out.push(s);
  };

  // 1) Followed company — the story's first-party brand matches a tracked topic.
  if (brand && brandKey && (bag.size === 0 ? false : tokenHit(bag, brandKey))) {
    push(`You follow ${brand}`);
  } else if (brand && brandKey && COMPANY_ENTITIES.has(brandKey.toLowerCase()) && ents.some((e) => tokenHit(bag, e))) {
    push(`You follow ${brand}`);
  }

  // 2) Interest match — a story entity the user has engaged with.
  for (const e of ents) {
    if (COMPANY_ENTITIES.has(e) && out.some((r) => r.startsWith("You follow"))) continue;
    if (tokenHit(bag, e)) { push(`Matches your interest in ${pretty(e)}`); break; }
  }

  // 3) Saved-similar — the user has bookmarked stories on the same entity.
  if (savedEntities && savedEntities.size > 0 && ents.some((e) => savedEntities.has(e))) {
    push("You've saved similar stories");
  }

  // 4) Real backend reasons — but ONLY genuinely personal ones. Story-level
  //    evidence ("The study highlights a significant gap…") is generic and reads
  //    like a recommendation, not a briefing, so admit a reason only if it is
  //    short and framed about the user (contains "you"/"your") and isn't the
  //    known boilerplate. Personal strategist reasons ("connects to X — topics
  //    you keep engaging with") pass; long story summaries do not.
  for (const w of item.intel?.whyPicked ?? []) {
    if (!w) continue;
    if (w.length > 72 || !/\byou(r)?\b/i.test(w)) continue;
    if (/fits your profile|quality bar|matches your .* focus|on your radar/i.test(w)) continue;
    push(w.replace(/^because\s+/i, "").replace(/\.$/, "").replace(/^\w/, (c) => c.toUpperCase()));
  }

  // 5) Role / goal relevance — only if history is still thin.
  if (out.length < 2) {
    const rk = roleToken(profile);
    if (rk) push(`Relevant because ${ROLE_MATTERS[rk]}`);
  }

  // 6) Fallbacks — real flags only (never empty, never fabricated). Used when
  //    the user's personal history is too thin to produce ≥2 personal reasons.
  if (out.length < 2) {
    const dir = item.intel?.trend?.direction ?? "";
    if (/acceler|emerg|rising/i.test(dir) || item.growth) {
      push(bag.size > 0 ? "Trending in your topics" : "Trending across AI right now");
    }
  }
  if (out.length < 2 && (item.impact === "critical" || item.impact === "major" || (item.score ?? 0) >= 80)) {
    push("High-impact AI news");
  }
  if (out.length < 2 && ents.length > 0) {
    push(`Covers ${pretty(ents.find((e) => !COMPANY_ENTITIES.has(e)) ?? ents[0])}`);
  }
  // Only surface the source when it's a genuine first-party company (honest,
  // specific). Unknown aggregator publishers add nothing, so skip them.
  if (out.length < 2 && brand && brandKey && COMPANY_ENTITIES.has(brandKey.toLowerCase())) {
    push(`Reported by ${brand} directly`);
  }
  if (out.length < 2) {
    const mins = (Date.now() - new Date(item.timestamp).getTime()) / 60000;
    if (!Number.isNaN(mins) && mins <= 360) push("Fresh — published today");
  }

  return out.slice(0, 4);
}

// Concise "what happened" — grounded feed copy, never the opportunity pitch.
export function executiveSummary(item: FeedItem): string {
  const raw = ((item as unknown as { what_happened?: string }).what_happened
    ?? item.summary
    ?? item.whyItMatters
    ?? "").trim();
  if (raw.length <= 200) return raw;
  const cut = raw.slice(0, 200);
  const dot = cut.lastIndexOf(". ");
  return (dot > 120 ? cut.slice(0, dot + 1) : cut.replace(/\s+\S*$/, "")) + (dot > 120 ? "" : "…");
}

export interface HeroBadge { label: string; tone: "green" | "amber" | "news" | "neutral"; }

// Single most-salient badge (Breaking > Official > Trending > Research).
export function heroBadge(item: FeedItem, official: boolean): HeroBadge | undefined {
  const minsOld = (() => {
    const t = new Date(item.timestamp).getTime();
    return Number.isNaN(t) ? Infinity : (Date.now() - t) / 60000;
  })();
  if (minsOld <= 90 && item.impact === "critical") return { label: "Breaking", tone: "amber" };
  if (official) return { label: "Official Source", tone: "green" };
  if (/acceler|emerg|rising/i.test(item.intel?.trend?.direction ?? "")) return { label: "Trending", tone: "green" };
  if (item.source === "arxiv" || item.category === "models") return { label: "Research", tone: "news" };
  return undefined;
}

const EVENT_LABEL: Record<string, string> = {
  launch: "Product Launch", funding: "Funding", acquisition: "Acquisition",
  release: "Product Launch", partnership: "Partnership", research: "Research",
};

// Applicable trust chips only. `badgeLabel` avoids duplicating the header badge.
export function trustSignals(item: FeedItem, official: boolean, badgeLabel?: string): string[] {
  const out: string[] = [];
  const add = (s?: string) => { if (s && !out.includes(s) && s !== badgeLabel) out.push(s); };
  if (item.impact === "critical" || item.impact === "major") add("High Impact");
  if (official) add("Official Source");
  const evt = String((item as unknown as { category?: string }).category ?? "").toLowerCase();
  if (EVENT_LABEL[evt]) add(EVENT_LABEL[evt]);
  const ago = timeAgoShort(item.timestamp);
  if (ago) add(ago);
  return out.slice(0, 4);
}

function timeAgoShort(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
