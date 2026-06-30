// Stage 11-13: Ranking, daily-feed assembly, notification decision.

import { entityKey, jaccard, titleTokens } from "./text.ts";
import { storyTrendScore, trendInsightFor } from "./trends.ts";
import type { SignalItem, ContentCategory, TrendEntity } from "./types.ts";

// Stage 11: Composite ranking — leverage is the spine; trend momentum lifts
// stories about entities the rest of the AI ecosystem is also publishing about.
export function rankItems(items: SignalItem[], trendIndex: Map<string, TrendEntity>): SignalItem[] {
  for (const i of items) {
    const t = storyTrendScore(i.trend_entities, trendIndex);
    i.trend_score = t.trend_score;
    i.momentum_score = t.momentum_score;
    // Surface trend/company memory in the existing expected_impact field.
    const insight = trendInsightFor(i.trend_entities, trendIndex);
    if (insight) {
      i.expected_impact = `${insight} ${i.expected_impact}`.slice(0, 400);
      // A story riding a fast-rising trend earns a small ranking lift.
      if (/fastest-rising/.test(insight)) i.trend_score = Math.min(100, i.trend_score + 8);
    }
  }
  const composite = (i: SignalItem) =>
    (i.leverage_score ?? 0) * 8 +
    i.score * 0.20 +
    (i.opportunity_score ?? 0) * 0.08 +
    (i.corroboration_score ?? 0) * 0.06 +
    (i.trend_score ?? 0) * 0.10 +
    (i.momentum_score ?? 0) * 0.06;
  return [...items].sort((a, b) =>
    (composite(b) - composite(a)) ||
    (b.confidence_score - a.confidence_score) ||
    (new Date(b.published_at).getTime() - new Date(a.published_at).getTime()),
  );
}

// Stage 12: Daily feed assembly — Phase 11 lineup, cap 12, entity diversity.
export function assembleDailyFeed(sorted: SignalItem[]): SignalItem[] {
  const selected: SignalItem[] = [];
  const used = new Set<string>();
  const topicTokens: Set<string>[] = [];
  const entityCounts = new Map<string, number>();

  const caps: Record<ContentCategory, number> = {
    "Must Know": 3,
    "Tool of the Day": 2,
    "Workflow of the Day": 2,
    "Founder Opportunity": 2,
    "Underrated Tool": 2,
    "Market Shift": 1,
    "Research Breakthrough": 1,
  };
  const counts: Record<ContentCategory, number> = {
    "Must Know": 0, "Tool of the Day": 0, "Workflow of the Day": 0,
    "Founder Opportunity": 0, "Underrated Tool": 0, "Market Shift": 0,
    "Research Breakthrough": 0,
  };

  function add(item: SignalItem, opts: { allowEntityRepeat?: boolean } = {}): boolean {
    if (selected.length >= 12 || used.has(item.id)) return false;
    if (counts[item.content_category] >= caps[item.content_category]) return false;
    const tokens = titleTokens(`${item.title} ${item.summary}`);
    if (topicTokens.some((t) => jaccard(t, tokens) >= 0.45)) return false;
    const ent = entityKey(`${item.title} ${item.summary}`) || "_other";
    if (!opts.allowEntityRepeat && (entityCounts.get(ent) ?? 0) >= 2) return false;
    selected.push(item);
    used.add(item.id);
    topicTokens.push(tokens);
    counts[item.content_category]++;
    entityCounts.set(ent, (entityCounts.get(ent) ?? 0) + 1);
    return true;
  }

  for (const item of sorted.filter((i) => i.content_category === "Must Know")) add(item);
  const laneOrder: ContentCategory[] = [
    "Tool of the Day", "Founder Opportunity", "Workflow of the Day",
    "Underrated Tool", "Market Shift", "Research Breakthrough",
  ];
  for (const lane of laneOrder) {
    for (const item of sorted.filter((i) => i.content_category === lane)) {
      if (counts[lane] >= caps[lane]) break;
      add(item);
    }
  }
  for (const item of sorted) add(item, { allowEntityRepeat: true });
  return selected.slice(0, 12);
}

// Stage 13: Notification decision — defined here so any caller can preview
// what would be pushed without invoking the send-notifications function.
export function notificationCandidates(daily: SignalItem[]): SignalItem[] {
  const INTERRUPT = new Set<ContentCategory>([
    "Must Know", "Workflow of the Day", "Founder Opportunity",
    "Market Shift", "Research Breakthrough",
  ]);
  return daily
    .filter((i) => i.score >= 85 && i.confidence_score >= 68)
    .filter((i) => i.leverage_score >= 8 || i.impact === "critical" || i.impact === "major")
    .filter((i) => INTERRUPT.has(i.content_category));
}
