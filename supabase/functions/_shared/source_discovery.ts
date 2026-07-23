// Official Source Discovery — pure helpers (no network here). Given a company
// name/domain and fetched HTML, work out candidate official domains, extract
// declared RSS/Atom feeds, and know which paths to probe for blog/news/docs/
// changelog/research/press. The edge function does the fetching; this stays
// deterministic + testable.

const TLDS = ["ai", "com", "io", "co", "dev"];

function slug(name: string): string {
  return name.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}
function hyphenSlug(name: string): string {
  return name.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

/** Candidate official domains to verify, most-likely first. Small list to bound fetches. */
export function candidateDomains(name: string): string[] {
  const s = slug(name);
  const h = hyphenSlug(name);
  if (!s || s.length < 2) return [];
  const out = new Set<string>();
  for (const tld of TLDS) out.add(`${s}.${tld}`);
  if (h !== s && h.includes("-")) { out.add(`${h}.com`); out.add(`${h}.ai`); }
  return [...out].slice(0, 7);
}

/** Resolve a possibly-relative href against a base URL. */
export function absoluteUrl(base: string, href: string): string {
  try { return new URL(href, base).toString(); } catch { return ""; }
}

/** Extract declared RSS/Atom feed URLs from an HTML <head>. */
export function parseFeedLinks(html: string, baseUrl: string): string[] {
  const out = new Set<string>();
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/rel=["']?alternate/i.test(tag)) continue;
    if (!/type=["']?application\/(rss|atom)\+xml/i.test(tag)) continue;
    const href = tag.match(/href=["']([^"']+)["']/i)?.[1];
    if (href) { const abs = absoluteUrl(baseUrl, href); if (abs) out.add(abs); }
  }
  return [...out];
}

/** Does the fetched homepage actually belong to this company? (anti-squatter) */
export function nameMatchesPage(html: string, name: string): boolean {
  const s = slug(name);
  if (s.length < 3) return false;
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").toLowerCase();
  const og = (html.match(/property=["']og:site_name["'][^>]*content=["']([^"']+)["']/i)?.[1]
    ?? html.match(/name=["']application-name["'][^>]*content=["']([^"']+)["']/i)?.[1] ?? "").toLowerCase();
  const hay = `${title} ${og}`.replace(/[^a-z0-9]+/g, "");
  return hay.includes(s);
}

/** True when a fetched body looks like an RSS/Atom feed. */
export function looksLikeFeed(text: string): boolean {
  const head = text.slice(0, 600).toLowerCase();
  return head.includes("<rss") || head.includes("<feed") || (head.includes("<?xml") && head.includes("<channel"));
}

// Common feed paths to probe when no <link> feed is declared (most-likely first).
export const RSS_PROBE_PATHS = [
  "/rss.xml", "/feed", "/feed.xml", "/rss", "/index.xml", "/atom.xml",
  "/blog/rss.xml", "/blog/feed", "/blog/feed.xml", "/blog/rss", "/news/rss.xml", "/news/feed",
];

// Section paths per official channel type (probed with HEAD; first hit wins).
export const SECTION_PROBES: { key: OfficialChannel; paths: string[] }[] = [
  { key: "blog",      paths: ["/blog", "/news"] },
  { key: "newsroom",  paths: ["/newsroom", "/news", "/company/news"] },
  { key: "press",     paths: ["/press", "/media", "/press-releases"] },
  { key: "docs",      paths: ["/docs", "/documentation", "/developers"] },
  { key: "changelog", paths: ["/changelog", "/releases", "/whats-new"] },
  { key: "research",  paths: ["/research", "/publications", "/papers"] },
];

export type OfficialChannel = "blog" | "newsroom" | "press" | "docs" | "changelog" | "research";

export const CHANNEL_COLUMN: Record<OfficialChannel | "github" | "rss", string> = {
  blog: "official_blog_url",
  newsroom: "official_newsroom_url",
  press: "official_press_url",
  docs: "official_docs_url",
  changelog: "official_changelog_url",
  research: "official_research_url",
  github: "official_github_url",
  rss: "official_rss_url",
};
