// Editorial Home selection. Pure function over the live feed — the same
// ranking helpers the previous Home used (adapters/homeSections), arranged for
// the editorial layout: ONE top story, a short numbered "Today's Signal"
// briefing, a chronological latest list, and an optional catch-up group.
// Nothing here fetches or invents data.

import type { FeedItem } from "@/data/feed";
import { withProgressiveFreshness, type HomeCategoryId } from "@/lib/categories";
import {
  selectTopStories, selectTodaysBrief, selectLatestStories, dedupeKey, keysOf,
} from "@/adapters/homeSections";

export interface Briefing {
  hero: FeedItem | null;
  today: FeedItem[];
  latest: FeedItem[];
  catchUp: FeedItem[];
}

const MIN_SCORE = 50;
const TODAY_COUNT = 6;

export function buildBriefing(opts: {
  items: FeedItem[];
  bookmarks: string[];
  topic: HomeCategoryId;
  /** Advisor's own best-opportunity pick id (a real backend personalization signal). */
  preferredHeroId?: string;
  now?: number;
}): Briefing {
  const { items, bookmarks, topic, preferredHeroId } = opts;
  const now = opts.now ?? Date.now();

  const base = items.filter((it) => (it.score ?? 0) >= MIN_SCORE);
  const ranked = topic === "all" ? base : withProgressiveFreshness(base, topic).items;
  if (ranked.length === 0) return { hero: null, today: [], latest: [], catchUp: [] };

  const pool = selectTopStories(ranked, 5);
  const preferred = preferredHeroId && topic === "all" ? ranked.find((i) => i.id === preferredHeroId) : undefined;
  const hero = preferred ?? pool.hero ?? ranked[0];
  const heroKey = dedupeKey(hero);

  const supporting = pool.supporting.filter((i) => dedupeKey(i) !== heroKey).slice(0, 4);
  const topKeys = keysOf([hero, ...supporting]);

  // Numbered briefing: the strongest supporting stories first, then the
  // stories Signal can actually explain (real why-it-matters), de-duplicated.
  const explained = selectTodaysBrief(ranked, topKeys, TODAY_COUNT);
  const seen = new Set<string>([heroKey]);
  const today: FeedItem[] = [];
  for (const it of [...supporting, ...explained]) {
    const k = dedupeKey(it);
    if (seen.has(k)) continue;
    seen.add(k);
    today.push(it);
    if (today.length >= TODAY_COUNT) break;
  }

  // Catch-up: important, 1–3 days old, not saved, not already shown.
  const shown = keysOf([hero, ...today]);
  const catchUp = (topic === "all" ? items : ranked)
    .filter((i) => {
      const k = dedupeKey(i);
      if (shown.has(k) || bookmarks.includes(i.id)) return false;
      if (i.impact !== "critical" && i.impact !== "major") return false;
      const age = (now - new Date(i.timestamp).getTime()) / 3_600_000;
      return age >= 24 && age <= 72;
    })
    .slice(0, 3);

  const exclude = new Set<string>([...shown, ...keysOf(catchUp)]);
  const latest = selectLatestStories(ranked, exclude);

  return { hero, today, latest, catchUp };
}
