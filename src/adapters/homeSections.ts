// adapters/homeSections.ts
// ---------------------------------------------------------------------------
// Home page section selection — Top Stories / Today's Brief / Latest Stories.
//
// ROOT CAUSE this replaces: all three sections used to be positional slices of
// ONE importance-ranked list (`ranked[0]`, `ranked[1..3]`, `ranked[0..5]`,
// "whatever's left"), so they overlapped heavily and "Latest Stories" was
// never actually sorted by recency — it inherited the personalize backend's
// importance order. That's why the three sections felt like copies of each
// other, and why "Latest" could show an older-but-important story above a
// genuinely newer one.
//
// Fix: three distinct selection functions, each reusing ONLY real fields
// already present on FeedItem (score, impact, engagement, timestamp,
// intel.signalScore) — no fabricated data, no new AI/embedding calls, no new
// backend round-trip. This is a client-side re-ranking of data the backend
// already computed and sent once.
//
//   selectTopStories    — "what matters most" — composite importance score,
//                          mild freshness decay, source-diversity cap.
//   selectTodaysBrief   — "what do I need to understand" — importance-ranked,
//                          but ONLY among stories that actually have real
//                          why-it-matters content (never fabricated).
//   selectLatestStories — "what's new right now" — pure reverse-chronological
//                          by real publish timestamp. Nothing else.
// ---------------------------------------------------------------------------
import type { FeedItem } from "@/data/feed";

// Cross-section dedup identity. Real event dedup found live: the SAME AWS
// Lambda launch existed as TWO separate content_archive/feed_items rows
// (different ids — likely re-ingested on a later run, or picked up from two
// connectors) and appeared as both the Top Story hero and a Latest Stories
// card with identical AI Summary text. `item.id` alone can't catch that.
// `url` is already canonicalized at the useLiveFeed boundary (see
// hooks/useLiveFeed.ts normalizeUrl), so two rows for the same real article
// share the same url string — a cheap, conservative identity key requiring
// no new backend call, clustering table, or embedding comparison. Falls back
// to id only when a row genuinely has no url (never merges unrelated stories).
export function dedupeKey(item: FeedItem): string {
  return item.url && item.url.trim() ? item.url.trim() : `id:${item.id}`;
}

/** Build the set of dedupe keys already "used" by a group of picked items. */
export function keysOf(items: FeedItem[]): Set<string> {
  return new Set(items.map(dedupeKey));
}

function sourceKey(item: FeedItem): string {
  return (item.sourceLabel || item.source || "").toLowerCase().trim();
}

function safeTime(iso?: string): number {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
}

/**
 * Composite importance score for Top Stories ranking. Every input is a real,
 * already-computed field — nothing here is invented:
 *   - score / intel.signalScore: the backend's own 0-100 composite signal
 *   - impact: editorial critical/major/useful classification
 *   - engagement: raw upvotes/stars (log-scaled so viral outliers don't dominate)
 *   - freshness: a MILD decay over a week, not a hard recency requirement —
 *     a 3-hour-old important story should still beat a 2-minute-old trivial one.
 */
function importanceScore(item: FeedItem): number {
  const base = item.intel?.signalScore ?? item.score ?? 0;
  const impactWeight = item.impact === "critical" ? 30 : item.impact === "major" ? 15 : 0;
  const engagementBoost = Math.min(10, Math.log10(1 + Math.max(0, item.engagement ?? 0)) * 4);
  const ageHours = (Date.now() - safeTime(item.timestamp)) / 3_600_000;
  const freshnessDecay = Number.isFinite(ageHours)
    ? Math.max(0, 1 - ageHours / (24 * 7)) * 10   // fades out over ~1 week, never a hard cutoff
    : 0;
  return base + impactWeight + engagementBoost + freshnessDecay;
}

export interface TopStoriesResult {
  hero: FeedItem | null;
  supporting: FeedItem[];
}

/**
 * Top Stories: highest importance, WITH a source-diversity cap so one prolific
 * publisher can't fill the whole section (Phase 11). Falls back to filling
 * remaining slots without the cap only if too few distinct sources exist —
 * never returns fewer items than available just to enforce diversity.
 */
export function selectTopStories(feed: FeedItem[], total = 5): TopStoriesResult {
  // Dedupe the SOURCE list first (same real event, two DB rows) — otherwise a
  // duplicate could win two of the section's own slots before diversity even
  // comes into play.
  const seenKeys = new Set<string>();
  const deduped: FeedItem[] = [];
  for (const item of feed) {
    const key = dedupeKey(item);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    deduped.push(item);
  }

  const ranked = deduped.sort((a, b) => importanceScore(b) - importanceScore(a));
  const picked: FeedItem[] = [];
  const perSource = new Map<string, number>();
  const MAX_PER_SOURCE = 2;

  for (const item of ranked) {
    if (picked.length >= total) break;
    const key = sourceKey(item);
    const count = perSource.get(key) ?? 0;
    if (count >= MAX_PER_SOURCE) continue;
    picked.push(item);
    perSource.set(key, count + 1);
  }
  // Diversity cap left slots unfilled (few distinct sources today) — top up
  // with the next-best remaining items rather than showing an incomplete section.
  if (picked.length < total) {
    const pickedIds = new Set(picked.map((i) => i.id));
    for (const item of ranked) {
      if (picked.length >= total) break;
      if (pickedIds.has(item.id)) continue;
      picked.push(item);
    }
  }

  const [hero = null, ...supporting] = picked;
  return { hero, supporting };
}

/** Real, non-trivial why-it-matters content — never a fabricated placeholder. */
function hasRealUnderstanding(item: FeedItem): boolean {
  return (item.whyItMatters ?? "").trim().length >= 20;
}

/**
 * Today's Brief: importance-ranked, but restricted to stories Signal can
 * actually explain (real whyItMatters present — Phase 4/9: never invent it).
 * Prefers stories NOT already in Top Stories first; only reaches into the Top
 * Stories pool if there aren't enough distinct explainable stories elsewhere,
 * and even then de-duplicates by (category, source) so the rail doesn't read
 * as five versions of the same story.
 */
export function selectTodaysBrief(feed: FeedItem[], topKeys: Set<string>, count = 5): FeedItem[] {
  const eligible = [...feed]
    .filter(hasRealUnderstanding)
    .sort((a, b) => importanceScore(b) - importanceScore(a));

  const primary = eligible.filter((i) => !topKeys.has(dedupeKey(i)));
  const secondary = eligible.filter((i) => topKeys.has(dedupeKey(i)));

  const picked: FeedItem[] = [];
  const seenKeys = new Set<string>();     // same-event dedup (url-based)
  const seenTopic = new Set<string>();    // topic/source diversity
  for (const item of [...primary, ...secondary]) {
    if (picked.length >= count) break;
    const key = dedupeKey(item);
    if (seenKeys.has(key)) continue;
    const topicKey = `${item.category}|${sourceKey(item)}`;
    if (seenTopic.has(topicKey)) continue;
    picked.push(item);
    seenKeys.add(key);
    seenTopic.add(topicKey);
  }
  return picked;
}

/**
 * Latest Stories: pure reverse-chronological by REAL publish timestamp.
 * Freshness is the only ranking factor — no importance re-weighting, so an
 * older "important" story never outranks a genuinely newer one here. Items
 * with an unparseable timestamp sort last rather than corrupting the order.
 */
export function selectLatestStories(feed: FeedItem[], excludeKeys: Set<string>): FeedItem[] {
  const seenKeys = new Set<string>(excludeKeys);   // also dedupes duplicate rows within Latest itself
  const out: FeedItem[] = [];
  for (const item of feed) {
    const key = dedupeKey(item);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    out.push(item);
  }
  return out.sort((a, b) => {
    const ta = safeTime(a.timestamp);
    const tb = safeTime(b.timestamp);
    if (Number.isNaN(ta) && Number.isNaN(tb)) return 0;
    if (Number.isNaN(ta)) return 1;
    if (Number.isNaN(tb)) return -1;
    return tb - ta;
  });
}
