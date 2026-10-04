// Adapter: production models → editorial UI shapes. PRESENTATION ONLY — no
// fetching, no mutation, no invented content. Reuses `mapSignal` so source
// identity / official-source / time formatting stay identical to the rest of
// the app, then cleans and relabels for the editorial layout.

import type { FeedItem } from "@/data/feed";
import type { Signal } from "@/ui-v2/shared/types";
import { categoriesFor, type HomeCategoryId } from "@/lib/categories";
import { mapSignal, brandFromDomain } from "@/adapters/homeV2";
import type { EdStory } from "@/ui-editorial/types";

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ndash: "–", mdash: "—", hellip: "…", lsquo: "‘", rsquo: "’", ldquo: "“", rdquo: "”",
  middot: "·", bull: "•", trade: "™", copy: "©", reg: "®",
};

/** Decode numeric + common named HTML entities. RSS titles arrive double-encoded
 *  ("&#8216;Carpathian Eight&#8217;"); the UI must never show raw entities. */
export function decodeEntities(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => safeFromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => safeFromCodePoint(parseInt(d, 10)))
    .replace(/&([a-z]+);/gi, (m, n) => NAMED_ENTITIES[n.toLowerCase()] ?? m);
}

function safeFromCodePoint(cp: number): string {
  try { return Number.isFinite(cp) && cp > 0 && cp < 0x110000 ? String.fromCodePoint(cp) : ""; } catch { return ""; }
}

/** Plain text from possibly-HTML publisher text. */
export function cleanText(input: string | undefined | null): string {
  return decodeEntities((input ?? "").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

const GENERIC_SOURCES = /^(blog|signal|news|signal archive)$/i;

function displaySource(source: string, domain?: string): string {
  const s = (source ?? "").trim();
  if (s && !GENERIC_SOURCES.test(s)) return s;
  return domain?.replace(/^www\./, "") || s || "Source";
}

function sameText(a: string, b: string): boolean {
  const n = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
  return n(a) === n(b);
}

function deckFor(title: string, ...candidates: (string | undefined)[]): string | undefined {
  for (const c of candidates) {
    const t = cleanText(c);
    if (t.length >= 24 && !sameText(t, title) && !title.toLowerCase().includes(t.toLowerCase().slice(0, 40))) return t;
  }
  return undefined;
}

// Kicker precedence for feed items: the most specific topic the real taxonomy
// (lib/categories) assigned, falling back to "News".
const KICKER_ORDER: { id: HomeCategoryId; label: string }[] = [
  { id: "models", label: "Models" },
  { id: "research", label: "Research" },
  { id: "startups", label: "Startups" },
  { id: "tools", label: "Tools" },
  { id: "companies", label: "Companies" },
];

export function kickerForItem(item: FeedItem): string {
  const cats = categoriesFor(item);
  return KICKER_ORDER.find((k) => cats.includes(k.id))?.label ?? "News";
}

const cap = (s: string) => {
  const t = s.replace(/_/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : t;
};

const EVENT_LABEL: Record<string, string> = {
  launch: "Launch", release: "Release", funding: "Funding", acquisition: "Acquisition",
  partnership: "Partnership", policy: "Policy", research: "Research", outage: "Outage",
};
const CONTENT_LABEL: Record<string, string> = {
  news: "News", tutorial: "Guide", benchmark: "Benchmark", repo: "Repository",
  opinion: "Opinion", review: "Review", comparison: "Comparison", funding: "Funding",
  launch: "Launch", list: "List", analysis: "Analysis",
};

/** Kicker for backend search results (real eventType / contentType / section). */
export function kickerForSignal(s: Signal): string | undefined {
  const ev = (s.eventType ?? "").toLowerCase();
  if (ev && ev !== "none") return EVENT_LABEL[ev] ?? cap(ev);
  const ct = (s.contentType ?? "").toLowerCase();
  if (ct) return CONTENT_LABEL[ct] ?? cap(ct);
  const sec = (s.section ?? "").toLowerCase();
  if (sec && sec !== "mentioned") return cap(sec);
  return undefined;
}

export interface StoryContext {
  saved: boolean;
  read?: boolean;
  savedAt?: string;
  image?: string;
}

function build(sig: Signal, kicker: string | undefined, ctx: StoryContext, deckSrc: (string | undefined)[]): EdStory {
  const title = cleanText(sig.title);
  const rawSource = cleanText(sig.source);
  const source = displaySource(rawSource.replace(OFFICIAL_TAG, " ").trim(), sig.domain);
  return {
    id: sig.id,
    title,
    deck: deckFor(title, ...deckSrc),
    source,
    domain: sig.domain || undefined,
    url: sig.url || undefined,
    kicker,
    timeAgo: sig.timeAgo || undefined,
    publishedAt: sig.publishedAt || undefined,
    official: sig.isOfficial === true || HAS_OFFICIAL_TAG.test(rawSource),
    image: ctx.image,
    imageCredit: ctx.image ? source : undefined,
    saved: ctx.saved,
    read: ctx.read,
    savedAt: ctx.savedAt,
  };
}

// Brands whose OWN domain makes a story first-party news.
const FIRST_PARTY = new Set([
  "openai", "anthropic", "google", "meta", "mistral", "cursor", "perplexity",
  "runway", "langchain", "huggingface", "nvidia", "microsoft", "azure", "apple",
]);

// Pipeline labels bake the verification into the name: "Coasty {Official}",
// "The Neuron (Official blog)", "Foo Official".
const OFFICIAL_TAG = /\s*[[({]\s*official[^\])}]*[\])}]\s*|\s+official\s*$/gi;
const HAS_OFFICIAL_TAG = /[[({]\s*official[^\])}]*[\])}]|\bofficial\b\s*$/i;

function hostOf(url?: string): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}

/** The real publisher of a feed item. `mapSignal` also infers a brand from words
 *  in the headline, which mislabels third-party coverage ("…Claude…" → Anthropic);
 *  an editorial byline must not do that. Order: the backend's publisher label,
 *  then the brand that owns the article's domain, then the bare domain. */
function publisherFor(item: FeedItem): { source: string; official: boolean } {
  const raw = (item.sourceLabel ?? "").trim();
  const labelOfficial = HAS_OFFICIAL_TAG.test(raw);
  const label = raw.replace(OFFICIAL_TAG, " ").trim();
  const brand = brandFromDomain(item.url);
  const firstParty = !!brand && FIRST_PARTY.has(brand.key);
  // Official = the PUBLISHER is first-party (its own domain, or the pipeline
  // marked the source official). Not "the story is about a company": the
  // backend's own "official company source" reason describes content, not the
  // outlet, so it is deliberately not used here.
  const official = labelOfficial || firstParty;
  if (label && !GENERIC_SOURCES.test(label)) return { source: label, official };
  if (brand) return { source: brand.label, official };
  return { source: hostOf(item.url) || "Source", official };
}

/** Live feed item → editorial story. */
export function mapStory(item: FeedItem, ctx: StoryContext): EdStory {
  const sig = mapSignal(item, ctx.saved);
  const pub = publisherFor(item);
  return build({ ...sig, source: pub.source, isOfficial: pub.official }, kickerForItem(item), ctx, [sig.whatHappened, sig.insight]);
}

/** Backend search result (already a Signal) → editorial story. */
export function mapSearchStory(sig: Signal, ctx: StoryContext): EdStory {
  return build(sig, kickerForSignal(sig), ctx, [sig.aiSummary, sig.takeaway]);
}

export function greetingFor(date = new Date()): string {
  const h = date.getHours();
  return h < 5 ? "Good evening" : h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function dateLabel(date = new Date()): string {
  return date.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
}
