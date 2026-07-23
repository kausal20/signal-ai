// Source Intelligence classifier — separates OFFICIAL company sources from
// MEDIA coverage, deterministically (no network, no AI). Official detection is
// dynamic: a connector marked `official`, a known company domain, OR — for any
// future company — a publisher domain whose root matches the article's primary
// entity. This is how "Perplexity Blog" outranks "TechCrunch" without hardcoding
// every company.

import { domainOf } from "./content_type.ts";

export type SourceType =
  | "OFFICIAL_BLOG" | "OFFICIAL_PRESS_RELEASE" | "OFFICIAL_GITHUB"
  | "OFFICIAL_CHANGELOG" | "OFFICIAL_DOCUMENTATION" | "OFFICIAL_RESEARCH"
  | "VERIFIED_MEDIA" | "INDUSTRY_MEDIA" | "COMMUNITY";

export interface SourceClassification {
  sourceType: SourceType;
  trustScore: number;       // official 100 · verified 95 · industry 90 · community 60
  isOfficial: boolean;
}

// Trusted global press (Bloomberg-tier). trust 95.
const VERIFIED_MEDIA = new Set([
  "techcrunch.com", "theverge.com", "bloomberg.com", "reuters.com", "cnbc.com",
  "wsj.com", "wired.com", "ft.com", "nytimes.com", "forbes.com", "theinformation.com",
  "apnews.com", "axios.com", "washingtonpost.com", "economist.com",
]);

// Community / UGC platforms. trust 60.
const COMMUNITY_DOMAINS = new Set([
  "github.com", "reddit.com", "ycombinator.com", "news.ycombinator.com",
  "medium.com", "substack.com", "dev.to", "hashnode.com", "stackoverflow.com",
]);

// Known AI-company owned domains (seed set; the entity-match rule below covers
// everything else, including future companies).
const KNOWN_OFFICIAL_DOMAINS = new Set([
  "openai.com", "anthropic.com", "blog.google", "deepmind.com", "deepmind.google",
  "ai.meta.com", "meta.com", "microsoft.com", "blogs.microsoft.com", "mistral.ai",
  "x.ai", "xai.com", "perplexity.ai", "cursor.com", "anysphere.co", "huggingface.co",
  "github.blog", "runwayml.com", "elevenlabs.io", "pika.art", "firecrawl.dev",
  "lovable.dev", "replit.com", "langchain.com", "blog.langchain.dev", "llamaindex.ai",
  "cohere.com", "together.ai", "replicate.com", "modal.com", "ollama.com", "wandb.ai",
  "stability.ai", "midjourney.com", "suno.com", "groq.com", "deepseek.com",
  "synthesia.io", "heygen.com", "pinecone.io", "vercel.com", "character.ai",
]);

const COMMON_TLDS = new Set([
  "com", "ai", "io", "co", "org", "net", "dev", "app", "blog", "news", "gg", "xyz",
  "tech", "cloud", "inc", "me", "us", "uk", "google",
]);

function norm(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Significant domain labels (drop TLDs + generic subdomains), normalized. */
function domainRoots(domain: string): string[] {
  return domain.split(".")
    .filter((label) => label && !COMMON_TLDS.has(label) && !["www", "blog", "news", "ai", "docs", "developer", "developers"].includes(label))
    .map(norm)
    .filter(Boolean);
}

function officialSubtype(domain: string, url: string): SourceType {
  const u = (url || "").toLowerCase();
  const d = domain.toLowerCase();
  if (d === "github.com" || d === "github.blog" || /github\.com\/.+\/releases/.test(u) || /\/releases(\/|$)/.test(u)) return "OFFICIAL_GITHUB";
  if (d === "arxiv.org" || /\/(research|paper|papers|publications)(\/|$)/.test(u)) return "OFFICIAL_RESEARCH";
  if (d.startsWith("docs.") || /\/(docs|documentation|reference)(\/|$)/.test(u)) return "OFFICIAL_DOCUMENTATION";
  if (/\/changelog(\/|$)|\/releases\/notes/.test(u)) return "OFFICIAL_CHANGELOG";
  if (/\/(press|newsroom|news-release|media)(\/|$)/.test(u)) return "OFFICIAL_PRESS_RELEASE";
  return "OFFICIAL_BLOG";
}

/**
 * Classify a source. `entityNorms` = normalized names/aliases of the article's
 * primary entity; when a domain root matches one, the article is that company's
 * OWN source (official) — the dynamic rule for any future company.
 */
export function classifySourceType(input: {
  publisher?: string | null;
  publisherDomain?: string | null;
  url?: string | null;
  connectorSource?: string | null;   // content_archive.source (connector id)
  connectorKind?: string | null;     // source_connectors.source_kind
  entityNorms?: string[];            // primary entity normalized name + aliases
}): SourceClassification {
  const rawDomain = (input.publisherDomain || domainOf(input.url ?? "")).toLowerCase();
  const domain = rawDomain === "news.google.com" ? "" : rawDomain;
  const src = (input.connectorSource ?? "").toLowerCase();
  const kind = (input.connectorKind ?? "").toLowerCase();
  const pubNorm = norm(input.publisher ?? "");

  // ── Official detection — DOMAIN-BASED ONLY ──────────────────────────────────
  // Connector kind is NOT sufficient: an "official" connector's Google-News
  // fallback pulls third-party media (BBC, Reuters…). Official is provable only
  // from the publisher's own domain: a known company domain, or (dynamically,
  // for any future company) a domain whose root matches the primary entity.
  const entityMatch = domain && (input.entityNorms ?? []).some((en) => {
    const e = norm(en);
    return e.length >= 3 && domainRoots(domain).some((r) => r === e || r.startsWith(e) || e.startsWith(r));
  });
  const knownOfficial = domain && (KNOWN_OFFICIAL_DOMAINS.has(domain)
    || [...KNOWN_OFFICIAL_DOMAINS].some((d) => domain === d || domain.endsWith(`.${d}`)));
  const isOfficial = Boolean(knownOfficial) || Boolean(entityMatch);
  void kind; // retained in signature for callers; intentionally not a trust signal

  if (isOfficial) {
    return { sourceType: officialSubtype(domain, input.url ?? ""), trustScore: 100, isOfficial: true };
  }

  // ── Community ───────────────────────────────────────────────────────────────
  if (["github", "reddit", "hn", "yc_discussions"].includes(src)
      || (domain && (COMMUNITY_DOMAINS.has(domain) || [...COMMUNITY_DOMAINS].some((d) => domain.endsWith(d))))) {
    return { sourceType: "COMMUNITY", trustScore: 60, isOfficial: false };
  }

  // ── Media ───────────────────────────────────────────────────────────────────
  const verified = (domain && (VERIFIED_MEDIA.has(domain) || [...VERIFIED_MEDIA].some((d) => domain.endsWith(d))))
    || [...VERIFIED_MEDIA].some((d) => pubNorm && norm(d.split(".")[0]) === pubNorm);
  if (verified) return { sourceType: "VERIFIED_MEDIA", trustScore: 95, isOfficial: false };

  // Everything else (known + unknown publishers) is industry media.
  return { sourceType: "INDUSTRY_MEDIA", trustScore: 90, isOfficial: false };
}

export function isOfficialType(t?: string | null): boolean {
  return typeof t === "string" && t.startsWith("OFFICIAL");
}

/** True when a domain's root actually matches one of an entity's names — i.e.
 *  the domain is that entity's OWN site (not merely a company it was mentioned
 *  alongside on someone else's official blog). Gates official-channel learning. */
export function entityOwnsDomain(domain: string, entityNorms: string[]): boolean {
  const d = (domain || "").toLowerCase();
  if (!d || d === "news.google.com") return false;
  const roots = domainRoots(d);
  return entityNorms.some((en) => {
    const e = norm(en);
    return e.length >= 3 && roots.some((r) => r === e || r.startsWith(e) || e.startsWith(r));
  });
}
