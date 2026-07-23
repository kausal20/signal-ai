// Editorial Intelligence Layer — decides what counts as genuine Official Company
// News. Being the primary entity is NOT sufficient: a crypto price-prediction, a
// stock-forecast SEO piece, a review, a tutorial, or an opinion column can all
// name the company as the primary subject yet must never enter the company
// timeline. This module classifies the EVENT and scores editorial quality, all
// deterministically (no network, no AI) so every ingested article is judged
// consistently and cheaply.

import type { ContentType } from "./content_type.ts";

export type EventType =
  | "launch" | "funding" | "acquisition" | "partnership" | "announcement"
  | "executive_interview" | "major_research" | "legal_regulatory"
  | "product_update" | "none";

export interface EditorialResult {
  eventType: EventType;
  qualityScore: number;            // 0..100
  isOfficialCompanyNews: boolean;
}

// Content types that can never be Official Company News, regardless of event.
const NON_OFFICIAL_TYPES: ReadonlySet<ContentType> = new Set<ContentType>([
  "tutorial", "opinion", "review", "comparison", "benchmark", "repo", "documentation", "listicle",
]);

// ── Junk / SEO shapes that disqualify an article from the timeline ────────────
const CRYPTO_PREDICTION =
  /\b(price prediction|predicts?|will hit|price target|to the moon|rally to|surge to|moon\b|hodl)\b|\b(xrp|bitcoin|btc|ethereum|eth|dogecoin|doge|solana|sol|cardano|ada|shiba|memecoin|altcoin|crypto(currency)?|token)\b.*\b(price|\$\d|20\d\d|prediction|forecast|target|surge|rally)\b|\bprice\b.*\bby (end of )?20\d\d\b/i;
const STOCK_SEO =
  /\b(stock|shares|nasdaq|nyse|\([A-Z]{2,5}\))\b.*\b(forecast|prediction|price target|buy|sell|outlook|worth (buying|it)|undervalued|overvalued|moat|rally|surge|soar)\b|\bshould you (buy|sell|invest)\b|\bp\/e ratio\b|\bdividend (yield|stock)\b|\b(buy|sell) (rating|now)\b/i;
const AFFILIATE =
  /\bbest deals?\b|\bcoupon\b|\bpromo code\b|\bdiscount code\b|\b\d{1,3}% off\b|\bblack friday\b|\bcyber monday\b|\bdeal of the day\b|\bsave (money|\$)\b/i;
const SEO_CLICKBAIT =
  /\bhow much (does|is|do)\b|\bis .{2,30} worth it\b|\b\d+ (best|top|cheapest|free) \b|\b(best|top) \d+\b|\balternatives? to\b|\bcheapest\b|\byou won'?t believe\b|\bshocking\b|\bthis is why\b|\bhere'?s (why|how|what)\b/i;
// Third-party roundups naming many companies — never a single company's official timeline.
const MULTI_COMPANY_ROUNDUP =
  /\b(fits?|sits?)\s+among\b|\bwhere\b.+\b(fits|among)\b|\bamong\b[^.!?]{0,140}(,|\band\b|\b&\b)[^.!?]{0,80}(,|\band\b|\b&\b)/i;

function isJunk(title: string, summary: string, contentType: ContentType): boolean {
  const t = title.toLowerCase();
  const blob = `${t} ${summary.toLowerCase()}`;
  if (NON_OFFICIAL_TYPES.has(contentType)) return true;
  if (MULTI_COMPANY_ROUNDUP.test(title)) return true;
  if (CRYPTO_PREDICTION.test(blob)) return true;
  if (STOCK_SEO.test(title)) return true;
  if (AFFILIATE.test(blob)) return true;
  if (SEO_CLICKBAIT.test(t)) return true;
  return false;
}

// ── Genuine company event detection (order = priority) ────────────────────────
export function detectEventType(title: string, summary: string, contentType: ContentType): EventType {
  const t = title.toLowerCase();
  const blob = `${t} ${(summary ?? "").toLowerCase()}`;

  if (/\braise[sd]?\b|\bseries [a-e]\b|\bseed round\b|\bfunding round\b|\bsecures? \$|\bvaluation\b|\b\$\d[\d.]*\s?(m|b|million|billion)\b.*\b(round|raise|fund|valuation|investment)\b|\bcloses? (a )?\$/.test(blob)) return "funding";
  if (/\bacqui(re|res|red|sition)\b|\bto acquire\b|\bbuys\b|\bbought\b|\bmerges? with\b|\bmerger\b/.test(t)) return "acquisition";
  if (/\blawsuit\b|\bsues?\b|\bsued\b|\bin court\b|\bjudge\b|\bregulator|\bantitrust\b|\bftc\b|\bsec (probe|charges|sues)\b|\bruling\b|\brules? that\b|\bfined?\b|\binvestigat|\bban(s|ned)?\b|\bcomplaint\b|\bsettlement\b|\bip suit\b|\bsubpoena\b|\bprobe\b|\bcopyright\b/.test(blob)) return "legal_regulatory";
  if (/\bpartner(s|ship|ed|ing)?\b|\bteams up\b|\bjoins forces\b|\bcollaborat(e|es|ion|ing)\b|\bstrikes? (a )?deal\b/.test(t)) return "partnership";
  if (contentType === "interview" || /\b(ceo|cto|coo|founder|co-?founder|president|chief)\b.{0,30}\b(interview|talks|sits down|q&a|in conversation|on how|says)\b/.test(t)) return "executive_interview";
  if (contentType === "research" || /\b(introduces|releases|unveils|launches)\b.{0,30}\b(model|gpt|llm|architecture|dataset)\b|\bbreakthrough\b|\bstate[- ]of[- ]the[- ]art\b|\bresearch paper\b|\bnew model\b/.test(blob)) return "major_research";
  if (contentType === "launch" || /\blaunch(es|ed)?\b|\bintroduc(es|ed|ing)\b|\bunveils?\b|\breleases?\b|\bdebuts?\b|\brolls out\b|\bnow available\b|\bgeneral availability\b|\bgoes live\b|\bships?\b|\bopens up\b/.test(t)) return "launch";
  if (contentType === "product_update" || /\bupdate[sd]?\b|\bnew feature|\bexpands?\b|\bupgrade[sd]?\b|\badds? (support|a )?\b|\bnow supports\b|\brevamps?\b/.test(t)) return "product_update";
  if (/\bannounces?\b|\bunveils?\b|\bhires?\b|\bappoints?\b|\bnames? .{2,30} (ceo|cto|chief)\b|\bopens? (an? )?(office|hq)\b|\bexpands to\b|\blays off\b|\blayoffs?\b|\bshuts? down\b|\bwinds? down\b/.test(t)) return "announcement";
  return "none";
}

export function editorialQualityScore(title: string, summary: string, contentType: ContentType, eventType: EventType, junk: boolean): number {
  let s = 50;
  if (eventType !== "none") s += 25;
  if (junk) s -= 45;
  if (NON_OFFICIAL_TYPES.has(contentType)) s -= 15;
  // Clickbait signals in the title.
  const caps = (title.match(/\b[A-Z]{4,}\b/g) ?? []).length;
  if (caps >= 2) s -= 8;
  if (/[!?]{2,}|🚀|🔥|💰/.test(title)) s -= 8;
  if (title.length < 20) s -= 6;
  return Math.max(0, Math.min(100, Math.round(s)));
}

/**
 * The single editorial verdict for an article. Official Company News requires a
 * genuine event AND an on-topic, non-junk shape — never a tutorial/review/
 * opinion/comparison/repo, never crypto/stock/affiliate/SEO, even when the
 * company is the primary subject.
 */
export function classifyEditorial(input: {
  title: string; summary?: string; contentType: ContentType;
}): EditorialResult {
  const title = input.title ?? "";
  const summary = input.summary ?? "";
  const junk = isJunk(title, summary, input.contentType);
  const eventType = detectEventType(title, summary, input.contentType);
  const qualityScore = editorialQualityScore(title, summary, input.contentType, eventType, junk);
  const isOfficialCompanyNews = !junk
    && !NON_OFFICIAL_TYPES.has(input.contentType)
    && eventType !== "none";
  return { eventType, qualityScore, isOfficialCompanyNews };
}

/** Official Company News in the archive requires a genuine event on the company's OWN publisher. */
export function isOfficialCompanyNewsForArchive(
  editorial: EditorialResult,
  isOfficialSource: boolean,
): boolean {
  return isOfficialSource && editorial.isOfficialCompanyNews;
}
