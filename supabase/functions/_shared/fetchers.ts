// UOCAE · universal content fetchers.
// One interface (`Fetcher: (connector) => Promise<RawItem[]>`), many transports
// (sitemap, static blog, GitHub releases). Each fetcher is generic — no company-
// specific logic. Extraction uses schema.org / OpenGraph / JSON-LD so the same
// code works for any brand-new site the discovery engine turns up.

import { makeRaw } from "./sources.ts";
import { fetchWithTimeout } from "./text.ts";
import type { RawItem, SourceConnector } from "./types.ts";

const UA = "signal-ai-uocae/1.0 (+https://signal.ai)";

interface HttpResult { ok: boolean; status: number; body: string; etag?: string; lastModified?: string; finalUrl: string }

async function httpGet(url: string, ifNone?: { etag?: string | null; lastModified?: string | null }): Promise<HttpResult> {
  try {
    const headers: Record<string, string> = { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,*/*" };
    if (ifNone?.etag) headers["If-None-Match"] = ifNone.etag;
    if (ifNone?.lastModified) headers["If-Modified-Since"] = ifNone.lastModified;
    const res = await fetchWithTimeout(url, { headers, redirect: "follow" }, 12_000);
    if (res.status === 304) return { ok: true, status: 304, body: "", finalUrl: res.url || url };
    const body = res.ok ? (await res.text().catch(() => "")).slice(0, 200_000) : "";
    return { ok: res.ok, status: res.status, body, etag: res.headers.get("etag") ?? undefined, lastModified: res.headers.get("last-modified") ?? undefined, finalUrl: res.url || url };
  } catch { return { ok: false, status: 0, body: "", finalUrl: url }; }
}

// ── Sitemap fetcher — the workhorse when no RSS exists ─────────────────────
// Parses a sitemap-index or per-locale sitemap, filters URLs matching
// `url_pattern` (e.g. `/blog/*`), then fetches the NEW pages incrementally
// using each entry's <lastmod>. First run: fetches the most-recent 15 URLs.
export async function fetchSitemap(c: SourceConnector): Promise<RawItem[]> {
  const seed = c.feed_url ?? c.rss_url;
  if (!seed) return [];
  const conditional = { etag: c.etag, lastModified: c.last_modified };
  const idxRes = await httpGet(seed, conditional);
  if (idxRes.status === 304 || !idxRes.body) return [];

  // Follow sitemap-index → per-locale sitemap (prefer the first / en one).
  let xml = idxRes.body;
  const nestedLocs = matchAll(xml, /<sitemap>\s*<loc>\s*([^<]+?)\s*<\/loc>/gi);
  if (nestedLocs.length > 0) {
    const preferred = nestedLocs.find((u) => /\/en(\.xml|\/|$)/i.test(u) || /sitemap.xml$/i.test(u)) ?? nestedLocs[0];
    const sub = await httpGet(preferred);
    if (!sub.ok) return [];
    xml = sub.body;
  }

  const patternRx = c.url_pattern ? patternToRegex(c.url_pattern) : null;
  const cutoff = Date.now() - 21 * 86_400_000; // 3-week window on first crawl

  // Extract <url><loc>...</loc><lastmod>...</lastmod></url> in order.
  const urls: { loc: string; lastmod?: string }[] = [];
  const rx = /<url>\s*<loc>\s*([^<]+?)\s*<\/loc>(?:\s*<lastmod>\s*([^<]+?)\s*<\/lastmod>)?/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(xml))) {
    const loc = m[1].trim(); const lastmod = m[2]?.trim();
    if (patternRx && !patternRx.test(loc)) continue;
    if (lastmod) { const t = Date.parse(lastmod); if (!Number.isNaN(t) && t < cutoff) continue; }
    urls.push({ loc, lastmod });
    if (urls.length >= 15) break;   // per-run cap
  }

  const out: RawItem[] = [];
  for (const u of urls) {
    const page = await httpGet(u.loc);
    if (!page.ok || !page.body) continue;
    const meta = extractPageMeta(page.body, u.loc);
    if (!meta.title) continue;
    const raw = makeRaw({
      id: `${c.source}_${hash(u.loc)}`,
      rawTitle: meta.title,
      rawText: meta.summary ?? "",
      url: u.loc,
      source: c.source,
      sourceLabel: c.source_label,
      sourceKind: c.source_kind,
      sourceWeight: c.source_weight,
      published_at: meta.publishedAt ?? u.lastmod ?? new Date().toISOString(),
      publisher: meta.publisher ?? c.source_label.replace(/\s*\(Official.*\)$/i, ""),
      publisherDomain: c.publisher_domain ?? domainOf(u.loc),
      originalUrl: u.loc,
    });
    if (raw) out.push(raw);
  }
  return out;
}

// ── Static-blog fetcher — no sitemap, no RSS: crawl the /blog index for links,
//    then fetch each linked article page. Same extractor as sitemap. Kept small
//    (top 15) so it never becomes an abusive crawl.
export async function fetchStaticBlog(c: SourceConnector): Promise<RawItem[]> {
  const seed = c.feed_url ?? c.rss_url;
  if (!seed) return [];
  const idx = await httpGet(seed, { etag: c.etag, lastModified: c.last_modified });
  if (idx.status === 304 || !idx.body) return [];
  const base = new URL(seed);
  const pattern = c.url_pattern ? patternToRegex(c.url_pattern) : new RegExp(`^${escapeRx(base.pathname.replace(/\/$/, ""))}/[^"'#?]+$`);
  const seen = new Set<string>();
  const links: string[] = [];
  const rx = /<a\b[^>]+href=["']([^"'#]+)["']/gi;
  let m: RegExpExecArray | null;
  while ((m = rx.exec(idx.body))) {
    let href = m[1];
    try { href = new URL(href, seed).toString(); } catch { continue; }
    if (!href.startsWith(base.origin)) continue;
    const path = new URL(href).pathname;
    if (!pattern.test(path)) continue;
    if (path === base.pathname || path === base.pathname + "/") continue;
    if (seen.has(href)) continue;
    seen.add(href); links.push(href);
    if (links.length >= 15) break;
  }
  const out: RawItem[] = [];
  for (const href of links) {
    const page = await httpGet(href);
    if (!page.ok) continue;
    const meta = extractPageMeta(page.body, href);
    if (!meta.title) continue;
    const raw = makeRaw({
      id: `${c.source}_${hash(href)}`,
      rawTitle: meta.title,
      rawText: meta.summary ?? "",
      url: href,
      source: c.source,
      sourceLabel: c.source_label,
      sourceKind: c.source_kind,
      sourceWeight: c.source_weight,
      published_at: meta.publishedAt ?? new Date().toISOString(),
      publisher: meta.publisher ?? c.source_label.replace(/\s*\(Official.*\)$/i, ""),
      publisherDomain: c.publisher_domain ?? domainOf(href),
      originalUrl: href,
    });
    if (raw) out.push(raw);
  }
  return out;
}

// ── GitHub releases (atom via api.github.com) — an official-content fetcher
//    for repos that publish releases as content updates.
export async function fetchGithubReleases(c: SourceConnector): Promise<RawItem[]> {
  const seed = c.feed_url ?? c.rss_url ?? "";
  const m = seed.match(/github\.com\/([^/]+)(?:\/([^/.]+))?/);
  if (!m) return [];
  const org = m[1]; const repo = m[2];
  const url = repo
    ? `https://api.github.com/repos/${org}/${repo}/releases?per_page=15`
    : `https://api.github.com/orgs/${org}/events?per_page=30`;
  const res = await httpGet(url);
  if (!res.ok || !res.body) return [];
  let json: any; try { json = JSON.parse(res.body); } catch { return []; }
  const out: RawItem[] = [];
  for (const r of Array.isArray(json) ? json : []) {
    const title = r.name || r.tag_name || r.type;
    if (!title) continue;
    const url2 = r.html_url || r.url || "";
    if (!url2) continue;
    const raw = makeRaw({
      id: `${c.source}_${hash(url2)}`,
      rawTitle: repo ? `${repo}: ${title}` : String(title),
      rawText: (r.body ?? r.description ?? "").toString().slice(0, 800),
      url: url2,
      source: c.source,
      sourceLabel: c.source_label,
      sourceKind: c.source_kind,
      sourceWeight: c.source_weight,
      published_at: r.published_at ?? r.created_at ?? new Date().toISOString(),
      publisher: c.source_label.replace(/\s*\(Official.*\)$/i, ""),
      publisherDomain: c.publisher_domain ?? "github.com",
      originalUrl: url2,
    });
    if (raw) out.push(raw);
  }
  return out;
}

// ── Content Extraction — schema.org / OpenGraph / JSON-LD ──────────────────
interface PageMeta { title: string; summary?: string; publishedAt?: string; publisher?: string }

export function extractPageMeta(html: string, url: string): PageMeta {
  const og = (prop: string) => html.match(new RegExp(`property=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1]
    ?? html.match(new RegExp(`name=["']${prop}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1];
  const meta = (name: string) => html.match(new RegExp(`name=["']${name}["'][^>]*content=["']([^"']+)["']`, "i"))?.[1];
  let title = og("og:title") ?? html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "";
  title = decodeEntities(title).replace(/\s+\|\s+[^|]{2,40}$/, "").trim();
  const summary = decodeEntities(og("og:description") ?? meta("description") ?? meta("twitter:description") ?? "").trim();
  const publishedAt = og("article:published_time") ?? meta("date") ?? meta("dc.date") ?? undefined;
  const publisher = og("og:site_name") ?? undefined;
  // JSON-LD fallback (headline / datePublished / publisher.name).
  if ((!title || !publishedAt) && /application\/ld\+json/i.test(html)) {
    const ld = html.match(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i)?.[1];
    if (ld) {
      try {
        const parsed = JSON.parse(ld);
        const flat = Array.isArray(parsed) ? parsed : [parsed];
        for (const o of flat) {
          if (!title && o?.headline) title = decodeEntities(String(o.headline)).trim();
          if (!publishedAt && o?.datePublished) return { title, summary, publishedAt: String(o.datePublished), publisher: publisher ?? (o?.publisher?.name ? String(o.publisher.name) : undefined) };
        }
      } catch { /* ignore */ }
    }
  }
  return { title, summary, publishedAt, publisher };
}

// ── Small helpers (no deps) ────────────────────────────────────────────────
function matchAll(s: string, rx: RegExp): string[] { const out: string[] = []; let m: RegExpExecArray | null; while ((m = rx.exec(s))) out.push(m[1]); return out; }
function hash(s: string): string { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); }
function domainOf(u: string): string { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } }
function escapeRx(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function patternToRegex(p: string): RegExp { return new RegExp("^" + p.split("*").map(escapeRx).join(".*") + "$"); }
function decodeEntities(s: string): string {
  return s.replace(/&nbsp;| /gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
