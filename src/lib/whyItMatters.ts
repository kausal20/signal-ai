// signal · lib/whyItMatters.ts
// ---------------------------------------------------------------------------
// THE single source of truth for cleaning `why_it_matters` at the ingestion
// boundary. Every reader — useLiveFeed, usePersonalizedFeed — must pass raw
// DB/edge-fn text through here before it becomes FeedItem.whyItMatters.
//
// Why this exists: a DB audit (2026-08-26) found every single feed_items row
// carries a fabricated ". Opportunity: <template>" clause appended to
// why_it_matters, drawn from a closed pool of ~10 sentences reused verbatim
// across dozens of unrelated articles (e.g. "Swap STT+LLM+TTS pipelines for
// one realtime call..." on four RPA articles that have nothing to do with
// voice pipelines). ~27% of rows also have a fully-templated FIRST sentence
// (topic-boilerplate like "Frontier capability moves reset the
// price-performance baseline every builder ships against", or a company-name
// swapped into "{X} coverage signal points to where AI builders should focus
// their next release cycle"). None of this is article-specific intelligence,
// so per the "hide, never fabricate" rule it's stripped/hidden here rather
// than shown as if it were real analysis.
// ---------------------------------------------------------------------------

const GENERIC_FIRST_SENTENCE = [
  /^Each shipped agent pattern compounds\b/i,
  /^Frontier capability moves reset the price-performance baseline\b/i,
  /coverage signal points to where AI builders should focus their next release cycle\.?$/i,
];

function stripOpportunityClause(s: string): string {
  const cleaned = s.replace(/\.\s*Opportunity:\s*[\s\S]*$/i, ".").trim();
  return cleaned === "." ? "" : cleaned;
}

export function cleanWhyItMatters(raw: string | null | undefined): string {
  const stripped = stripOpportunityClause((raw ?? "").trim());
  if (!stripped) return "";
  if (GENERIC_FIRST_SENTENCE.some((re) => re.test(stripped))) return "";
  return stripped;
}
