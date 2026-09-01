// signal · lib/url.ts
// ---------------------------------------------------------------------------
// THE single source of truth for article-source URLs across Signal.
// Pure TypeScript (no React / UI deps) so it can be used identically in data
// hooks, adapters, and components. Every article URL — from ingestion mappers
// to the "Read Original Source" button — must pass through here.
//
//   normalizeUrl(raw)      → canonical https(s) URL or null
//   isSafeUrl(raw)         → type-guard: true iff a canonical URL exists
//   domainOf(raw)          → bare hostname (www-stripped) or ""
//   openOriginal(raw)      → open canonical URL in a new tab, or log + no-op
//   validateArticleUrl(raw)→ { valid, canonical } for callers that want both
//
// Design rules:
//   - One place validates. Nothing else re-implements URL checks.
//   - Invalid ⇒ null. Callers hide the button (never a dead button).
//   - A silent failure is a bug: openOriginal logs when it can't open.
// ---------------------------------------------------------------------------

// Redirect / proxy / CDN shells that are never a real article page. Matches the
// ingestion pipeline's own "broken URL" heuristic so client + server agree.
const BLOCKED_HOSTS = /(^|\.)(google\.com|googleusercontent\.com|gstatic\.com)$/i;
const GOOGLE_NEWS = /(^|\.)news\.google\.com$/i;

// Tracking params safe to drop (canonicalization). Conservative allowlist of
// prefixes/exact keys — anything not matched is preserved so we never mangle a
// URL whose query is load-bearing (e.g. ?id=, ?p=, ?story=).
const TRACKING_PARAM = /^(utm_[a-z]+|fbclid|gclid|dclid|mc_eid|mc_cid|igshid|ref|ref_src|ref_url|spm|s_kwcid|_hsenc|_hsmi)$/i;

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

/** Type-guard: true iff `url` normalizes to a real, openable article link. */
export function isSafeUrl(url?: string | null): url is string {
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

export interface UrlValidation {
  valid: boolean;
  /** Canonical URL when valid, else null. */
  canonical: string | null;
}

/** Structured validation for callers that want the canonical form + validity. */
export function validateArticleUrl(url?: string | null): UrlValidation {
  const canonical = normalizeUrl(url);
  return { valid: canonical !== null, canonical };
}

/**
 * Open the original article in a new tab — validated + canonicalized, secure
 * (no opener, no referrer). Never throws; logs (dev) when it cannot open so a
 * failed open is visible instead of silent.
 */
export function openOriginal(url?: string | null): boolean {
  const canonical = normalizeUrl(url);
  if (!canonical) {
    if (import.meta.env?.DEV) {
       
      console.warn("[Signal] openOriginal: no valid source URL — not opening", { url });
    }
    return false;
  }
  window.open(canonical, "_blank", "noopener,noreferrer");
  return true;
}
