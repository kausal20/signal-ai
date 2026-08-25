// supabase/functions/_shared/url.ts
// ---------------------------------------------------------------------------
// Backend mirror of the frontend `src/lib/url.ts` — IDENTICAL normalization
// rules so a URL that the client considers valid/canonical is exactly what the
// ingestion pipeline stores, and vice-versa. This is the single source of
// truth for article URLs on the server side.
//
// Keep this in lock-step with src/lib/url.ts. If one changes, change both.
//
//   normalizeUrl(raw) → canonical https(s) URL, or null when unrecoverable
//   isSafeUrl(raw)    → boolean: a canonical URL exists
//   domainOf(raw)     → bare hostname (www-stripped) or ""
// ---------------------------------------------------------------------------

// Redirect / proxy / CDN shells that are never a real article page.
const BLOCKED_HOSTS = /(^|\.)(google\.com|googleusercontent\.com|gstatic\.com)$/i;
const GOOGLE_NEWS = /(^|\.)news\.google\.com$/i;

// Tracking params safe to drop (canonicalization). Conservative allowlist.
const TRACKING_PARAM =
  /^(utm_[a-z]+|fbclid|gclid|dclid|mc_eid|mc_cid|igshid|ref|ref_src|ref_url|spm|s_kwcid|_hsenc|_hsmi)$/i;

/**
 * Normalize a raw URL string into a canonical, openable article URL.
 * Returns `null` for anything that isn't a real, safe http(s) article link.
 */
export function normalizeUrl(raw?: string | null): string | null {
  if (!raw || typeof raw !== "string") return null;

  // Trim + decode the one HTML entity feeds commonly leave in query strings.
  const s = raw.trim().replace(/&amp;/g, "&");
  if (!s || s === "#") return null;

  let u: URL;
  try {
    u = new URL(s);
  } catch {
    return null; // bare domains, relative paths, "#", malformed → rejected
  }

  // Only real web links. Rejects javascript:, data:, mailto:, etc.
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;

  // Redirect/CDN shells are not articles.
  if (GOOGLE_NEWS.test(u.hostname) || BLOCKED_HOSTS.test(u.hostname)) return null;

  // A host with no dot (e.g. "localhost", "example") is not a public article.
  if (!u.hostname.includes(".")) return null;

  // Strip known tracking params; preserve everything else.
  if (u.search) {
    const kept = new URLSearchParams();
    u.searchParams.forEach((v, k) => {
      if (!TRACKING_PARAM.test(k)) kept.append(k, v);
    });
    u.search = kept.toString();
  }

  // Drop a dangling empty "#" fragment; keep meaningful anchors (#section).
  return u.toString().replace(/#$/, "");
}

/** True iff `url` normalizes to a real, openable article link. */
export function isSafeUrl(url?: string | null): boolean {
  return normalizeUrl(url) !== null;
}

/** Bare hostname (www-stripped) of a valid URL, else "". */
export function domainOf(url?: string | null): string {
  const canonical = normalizeUrl(url);
  if (!canonical) return "";
  try {
    return new URL(canonical).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
