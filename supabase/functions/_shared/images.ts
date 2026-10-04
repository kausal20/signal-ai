// Real publisher imagery for articles. Signal never generates images for news:
// the only images it will ever show are the ones the publisher itself attached
// to the article (feed media tags, or the page's og:image / twitter:image).
//
// Everything here is pure string handling (no network) so it is directly
// unit-testable and shared by the RSS parser and the article-page scraper.
// The URL is stored as-is (hotlinked, attributed to the publisher in the UI);
// the image bytes are never copied.

const MAX_URL_LEN = 1000;

// Hosts / paths that are never an article photo: Google-News generic
// thumbnails, trackers, avatars, sprites, site logos and favicons.
const BLOCKED_HOST = /(^|\.)(gstatic\.com|googleusercontent\.com|news\.google\.com|gravatar\.com|doubleclick\.net|googlesyndication\.com|feedburner\.com|pixel\.wp\.com|facebook\.com|scorecardresearch\.com)$/i;
const BLOCKED_PATH = /(\/|[-_.])(pixel|tracking|tracker|spacer|blank|sprite|favicon|apple-touch-icon|avatar|emoji|badge|placeholder|default[-_]?image|logo)([-_.\/?]|$)/i;
const BAD_EXT = /\.(svg|gif|ico|bmp)(\?|#|$)/i;

/** Decode the entities that appear inside feed attribute/CDATA values. */
function decode(s: string): string {
  return s
    .replace(/&amp;/gi, "&")
    .replace(/&#38;/g, "&")
    .replace(/&#x26;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .trim();
}

/**
 * Returns an absolute https image URL, or null when the candidate is missing,
 * relative-and-unresolvable, non-https (mixed content), a tracker / logo /
 * placeholder, or an unsupported format.
 */
export function normalizeImageUrl(candidate: string | null | undefined, base?: string): string | null {
  if (!candidate) return null;
  let raw = decode(candidate.replace(/^<!\[CDATA\[|\]\]>$/g, "").trim());
  if (!raw || raw.length > MAX_URL_LEN || raw.startsWith("data:")) return null;
  if (raw.startsWith("//")) raw = "https:" + raw;
  let u: URL;
  try { u = base ? new URL(raw, base) : new URL(raw); } catch { return null; }
  if (u.protocol === "http:") u.protocol = "https:";   // most publishers serve both; mixed content would be blocked anyway
  if (u.protocol !== "https:") return null;
  if (BLOCKED_HOST.test(u.hostname)) return null;
  if (BAD_EXT.test(u.pathname) || BLOCKED_PATH.test(u.pathname)) return null;
  return u.toString();
}

const attr = (tag: string, name: string): string | null =>
  tag.match(new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"))?.slice(2, 4).find((v) => v != null) ?? null;

/** Declared pixel width of a media tag, when the feed says. */
function widthOf(tag: string): number {
  const w = Number(attr(tag, "width") ?? 0);
  return Number.isFinite(w) ? w : 0;
}

/**
 * Best image for one RSS <item> / Atom <entry> block. Order of trust:
 * media:content (image) → media:thumbnail → <enclosure type=image/*> →
 * first <img> in the content/description. Widths < 200px are treated as icons.
 */
export function extractFeedImage(block: string, base?: string): string | null {
  const candidates: { url: string; w: number }[] = [];

  for (const m of block.matchAll(/<media:content\b[^>]*>/gi)) {
    const tag = m[0];
    const type = (attr(tag, "type") ?? "").toLowerCase();
    const medium = (attr(tag, "medium") ?? "").toLowerCase();
    if ((type && !type.startsWith("image/")) || (medium && medium !== "image")) continue;
    const url = attr(tag, "url");
    if (url) candidates.push({ url, w: widthOf(tag) });
  }
  for (const m of block.matchAll(/<media:thumbnail\b[^>]*>/gi)) {
    const url = attr(m[0], "url");
    if (url) candidates.push({ url, w: widthOf(m[0]) });
  }
  for (const m of block.matchAll(/<enclosure\b[^>]*>/gi)) {
    const type = (attr(m[0], "type") ?? "").toLowerCase();
    const url = attr(m[0], "url");
    if (url && type.startsWith("image/")) candidates.push({ url, w: 0 });
  }
  for (const m of block.matchAll(/<link\b[^>]*rel\s*=\s*["']enclosure["'][^>]*>/gi)) {
    const type = (attr(m[0], "type") ?? "").toLowerCase();
    const url = attr(m[0], "href");
    if (url && type.startsWith("image/")) candidates.push({ url, w: 0 });
  }
  // Inline <img> inside the (possibly entity-encoded / CDATA) body.
  const body = block.replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  for (const m of body.matchAll(/<img\b[^>]*>/gi)) {
    const url = attr(m[0], "src") ?? attr(m[0], "data-src");
    if (url) candidates.push({ url, w: widthOf(m[0]) });
  }

  for (const c of candidates) {
    if (c.w > 0 && c.w < 200) continue;
    const ok = normalizeImageUrl(c.url, base);
    if (ok) return ok;
  }
  return null;
}

/** og:image / twitter:image from an article page's HTML (head only is enough). */
export function extractOgImage(html: string, base?: string): string | null {
  const head = html.slice(0, 200_000);
  const metas = head.match(/<meta\b[^>]*>/gi) ?? [];
  const want = ["og:image:secure_url", "og:image:url", "og:image", "twitter:image", "twitter:image:src"];
  const found = new Map<string, string>();
  for (const tag of metas) {
    const key = (attr(tag, "property") ?? attr(tag, "name") ?? "").toLowerCase();
    const content = attr(tag, "content");
    if (key && content && want.includes(key) && !found.has(key)) found.set(key, content);
  }
  for (const key of want) {
    const ok = normalizeImageUrl(found.get(key), base);
    if (ok) return ok;
  }
  return null;
}
