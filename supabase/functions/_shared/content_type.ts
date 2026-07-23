// Content-type classification + publisher parsing — deterministic, no network,
// no AI. Every archived article is classified so entity search can separate
// dedicated company news (Section 1) from generic mentions / tutorials / repos /
// comparisons (Section 2), and so Publisher is captured as the REAL website.

export type ContentType =
  | "news" | "funding" | "launch" | "product_update" | "research"
  | "acquisition" | "partnership" | "interview" | "opinion"
  | "tutorial" | "benchmark" | "comparison" | "repo"
  | "documentation" | "listicle" | "review";

// Types that count as dedicated company news for Section 1 (Tier 1).
export const NEWS_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  "news", "funding", "launch", "product_update", "acquisition", "partnership", "research", "interview",
]);

// Types that are ALWAYS demoted to the bottom of entity search (Tier 5),
// regardless of whether the entity is in the title.
export const LOW_VALUE_CONTENT_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  "repo", "tutorial", "comparison", "benchmark", "listicle", "documentation",
]);

export function domainOf(url?: string | null): string {
  if (!url) return "";
  try { return new URL(url).hostname.replace(/^www\./, "").toLowerCase(); }
  catch { return ""; }
}

/** Google-News titles are "Headline - Publisher". Split off the publisher. */
export function splitPublisherSuffix(rawTitle: string): { title: string; publisher: string } {
  const idx = rawTitle.lastIndexOf(" - ");
  if (idx > 8 && idx >= rawTitle.length - 60) {
    const publisher = rawTitle.slice(idx + 3).trim();
    // A publisher is short and not a sentence fragment.
    if (publisher && publisher.length <= 48 && !/[.?!,:;]$/.test(publisher) && /[a-z]/i.test(publisher)) {
      return { title: rawTitle.slice(0, idx).trim(), publisher };
    }
  }
  return { title: rawTitle.trim(), publisher: "" };
}

/**
 * Classify an article's content type from title/url/source/summary.
 * Order matters: structural + list/tutorial/comparison signals are checked
 * before "news" verbs so a "How to use X" or "X vs Y" post is never mislabeled
 * as company news just because the company is in the title.
 */
export function classifyContentType(input: {
  title?: string; url?: string; source?: string; summary?: string;
}): ContentType {
  const title = (input.title ?? "").trim();
  const t = title.toLowerCase();
  const host = domainOf(input.url);
  const src = (input.source ?? "").toLowerCase();
  const blob = `${t} ${(input.summary ?? "").toLowerCase()}`;

  // ── Structural / host-based (strongest signal) ──────────────────────────────
  if (src === "github" || host === "github.com" || /^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(title)) return "repo";
  if (src === "arxiv" || host === "arxiv.org") return "research";
  if (host.startsWith("docs.") || /\breadme\b|\bapi reference\b|\bdocumentation\b/.test(blob)) return "documentation";

  // ── Non-news editorial shapes (must beat "news" verbs) ──────────────────────
  if (/\bvs\.?\b|\bversus\b|\bcompar(e|ed|es|ison)\b|\bhead[- ]to[- ]head\b/.test(t)) return "comparison";
  // Multi-company roundups ("Where X Fits Among A, B, C…") — media analysis, not company news.
  if (/\b(fits?|sits?)\s+among\b|\bwhere\b.+\b(fits|among)\b/.test(t)) return "comparison";
  if (/\bamong\b[^.!?]{0,140}(,|\band\b|\b&\b)[^.!?]{0,80}(,|\band\b|\b&\b)/.test(t)) return "comparison";
  if (/\btop\s+\d+\b|\bbest\s+\d+\b|\b\d+\s+(best|top|ai tools|tools|alternatives|frameworks|apps)\b|\bround[- ]?up\b|\blisticle\b/.test(t)) return "listicle";
  if (/\bhow to\b|\btutorial\b|\bguide\b|\bstep[- ]by[- ]step\b|\bgetting started\b|\bwalkthrough\b|\bbuild (a|an|your)\b|\bcheat sheet\b/.test(t)) return "tutorial";
  if (/\bbenchmark|\beval(uation)?\b|\bmmlu\b|\bswe[- ]?bench\b|\bhumaneval\b|\bleaderboard\b|\bllm arena\b/.test(blob)) return "benchmark";
  if (/\breview\b|\bhands[- ]on\b|\bi tried\b|\bi used\b|\bwe tested\b|\btested\b/.test(t)) return "review";
  if (/\binterview\b|\bq&a\b|\bsits down\b|\bin conversation\b|\btalks to\b|\bceo (on|talks)\b/.test(t)) return "interview";
  if (/\bopinion\b|\bthe case for\b|\bis (dead|the future|overrated|overhyped)\b|\bhot take\b|\beditorial\b|\bwhy i\b/.test(t)) return "opinion";

  // ── Business events ─────────────────────────────────────────────────────────
  if (/\braise[sd]?\b|\bseries [a-e]\b|\bseed round\b|\bfunding round\b|\bvaluation\b|\braises \$|\bsecures \$|\b\$\d[\d.]*\s?(m|b|million|billion)\b/.test(blob)) return "funding";
  if (/\bacqui(re|res|red|sition)\b|\bbuys\b|\bbought\b|\bmerger\b|\bto acquire\b/.test(t)) return "acquisition";
  if (/\bpartner(s|ship|ed|ing)?\b|\bteams up\b|\bcollaborat(e|es|ion)\b|\bjoins forces\b/.test(t)) return "partnership";
  if (/\blaunch(es|ed)?\b|\bintroduc(es|ed|ing)\b|\bunveil(s|ed)?\b|\breleas(e|es|ed)\b|\bdebuts?\b|\bannounce[sd]?\b|\brolls out\b|\bnow available\b|\bunlocks?\b/.test(t)) return "launch";
  if (/\bupdate[sd]?\b|\bversion \d|\bv\d+(\.\d+)?\b|\bnew feature|\bimproves?\b|\bexpands?\b|\badds?\b|\bupgrade[sd]?\b/.test(t)) return "product_update";
  if (/\bpaper\b|\bstudy\b|\bresearch(ers)?\b|\bfindings\b|\bmodel card\b|\bpreprint\b/.test(blob)) return "research";

  return "news";
}
