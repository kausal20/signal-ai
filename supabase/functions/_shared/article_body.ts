// Full-article-body extraction. Every fetcher in sources.ts/fetchers.ts only
// ever captures a short teaser (the RSS <description> tag or the page's
// og:description/meta-description) — never the real article body. That short
// teaser was getting copied into BOTH content_archive.summary and
// content_archive.full_content, so "full_content" was never actually full.
//
// This fills the gap: fetch the article page and pull the real body text via
// a small readability-style heuristic (article tag, else paragraph scan) —
// no DOM library, consistent with the rest of the pipeline's regex-based HTML
// handling. Best-effort everywhere: any failure just keeps the existing
// teaser, never blocks ingestion.

import { fetchWithTimeout, cleanText } from "./text.ts";
import type { RawItem } from "./types.ts";
import { extractOgImage } from "./images.ts";

const UA = "signal-ai-articlebody/1.0 (+https://signal.ai)";
const FETCH_TIMEOUT_MS = 6000;
const MAX_HTML_BYTES = 500_000;
const MAX_BODY_CHARS = 8000;
const MIN_BODY_CHARS = 200;       // below this, not worth it over the teaser

// Batch-enrichment tuning: bounded so one ingestion run can't blow past the
// edge function's wall-clock budget.
const SCRAPE_CONCURRENCY = 8;
const MAX_SCRAPE_PER_RUN = 40;
const TEASER_OK_LENGTH = 400;     // teaser already long enough — skip the fetch
// These sources' URLs aren't news articles (abstract pages, repo pages,
// discussion threads) — scraping them wouldn't yield real body text.
const SKIP_SOURCES = new Set([
  "github", "arxiv", "reddit", "hn_ai", "hn_frontier", "yc_discussions", "producthunt",
]);

function stripNonContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|nav|header|footer|aside|form|iframe|svg)\b[\s\S]*?<\/\1>/gi, " ");
}

function extractArticleTag(html: string): string | null {
  const m = html.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  return m ? m[1] : null;
}

// Fallback: collect <p> blocks, dropping ones too short to be real prose
// (nav links, captions, ad labels usually collapse to a few words).
function extractParagraphs(html: string): string {
  const blocks = html.match(/<p\b[^>]*>[\s\S]*?<\/p>/gi) ?? [];
  return blocks.map((b) => cleanText(b)).filter((t) => t.length >= 40).join(" ");
}

/**
 * Pure HTML -> body-text extraction (article tag, else paragraph scan).
 * No network — exported separately so it's directly unit-testable.
 */
export function extractBodyFromHtml(html: string): string {
  const stripped = stripNonContent(html);
  const articleInner = extractArticleTag(stripped);
  let body = articleInner ? cleanText(articleInner) : "";
  if (body.length < MIN_BODY_CHARS) {
    const viaParagraphs = extractParagraphs(stripped);
    if (viaParagraphs.length > body.length) body = viaParagraphs;
  }
  return body;
}

/**
 * Fetch a page once and pull both the real body text and the publisher's own
 * og:image. Either can be null (thin extraction, no usable image); the whole
 * result is null-fields on any failure.
 */
export async function fetchArticlePage(url: string): Promise<{ body: string | null; image: string | null }> {
  try {
    const res = await fetchWithTimeout(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,*/*" },
      redirect: "follow",
    }, FETCH_TIMEOUT_MS);
    if (!res.ok) return { body: null, image: null };
    const html = (await res.text().catch(() => "")).slice(0, MAX_HTML_BYTES);
    if (!html) return { body: null, image: null };

    const body = extractBodyFromHtml(html);
    return {
      body: body.length >= MIN_BODY_CHARS ? body.slice(0, MAX_BODY_CHARS) : null,
      // Resolve relative og:image against the final URL of the response.
      image: extractOgImage(html, res.url || url),
    };
  } catch {
    return { body: null, image: null };
  }
}

/**
 * Fetch a page and extract the real body text. Returns null on any failure
 * or when extraction is too thin to be worth keeping over the teaser.
 */
export async function fetchArticleBody(url: string): Promise<string | null> {
  return (await fetchArticlePage(url)).body;
}

/**
 * Concurrency-limited, best-effort enrichment over a batch of raw items —
 * mutates `item.fullText` for items whose teaser is thin and worth upgrading,
 * and `item.image` for items whose feed carried no photo (the page's og:image).
 * One page fetch serves both. Skips non-article sources and items with no
 * usable URL. Never throws.
 */
export async function enrichRawItemsWithBody(items: RawItem[]): Promise<void> {
  const needsBody = (i: RawItem) => (i.rawText ?? "").length < TEASER_OK_LENGTH;
  const candidates = items
    .filter((i) =>
      !SKIP_SOURCES.has(i.source) &&
      (needsBody(i) || !i.image) &&
      !!(i.originalUrl ?? i.url)
    )
    // Items that need both a body and an image are the best use of the budget.
    .sort((a, b) => Number(needsBody(b) && !b.image) - Number(needsBody(a) && !a.image))
    .slice(0, MAX_SCRAPE_PER_RUN);
  if (candidates.length === 0) return;

  for (let i = 0; i < candidates.length; i += SCRAPE_CONCURRENCY) {
    const batch = candidates.slice(i, i + SCRAPE_CONCURRENCY);
    await Promise.all(batch.map(async (item) => {
      try {
        const page = await fetchArticlePage(item.originalUrl ?? item.url);
        if (page.body && needsBody(item)) item.fullText = page.body;
        if (page.image && !item.image) item.image = page.image;
      } catch { /* best-effort, keep teaser */ }
    }));
  }
}
