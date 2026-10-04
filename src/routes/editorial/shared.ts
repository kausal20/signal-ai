// Small helpers shared by the editorial route containers.

import type { FeedItem } from "@/data/feed";
import type { ArticleContext } from "@/lib/askSignal";
import { formatTimeAgo } from "@/adapters/homeV2";

/** Story context handed to Signal AI — same shape the previous Ask Signal used. */
export function articleContextFor(a: FeedItem, image?: string): ArticleContext {
  let domain: string | undefined;
  try { domain = a.url ? new URL(a.url).hostname.replace(/^www\./, "") : undefined; } catch { domain = undefined; }
  return {
    article_id: a.id,
    headline: a.title,
    summary: (a as any).what_happened ?? a.summary,
    publisher: a.sourceLabel ?? a.source,
    publisher_domain: domain,
    published_at: a.timestamp,
    source_type: a.intel?.whyPicked?.some((w) => /official/i.test(w)) ? "OFFICIAL_SOURCE" : undefined,
    impact_score: Math.round(a.intel?.signalScore ?? a.score ?? 0),
    event_type: a.category,
    primary_entity: (((a as any).trend_entities ?? []) as string[])[0],
    article_url: a.url,
    image_url: image,
  };
}

/** Starter questions built from the story itself (no invented facts). */
export function questionsFor(c: ArticleContext): string[] {
  const rival = (c.related_entities ?? []).find((e) => e && e !== c.primary_entity);
  return [
    "Why does this matter?",
    "Explain it in simple words",
    rival ? `How does it compare with ${rival}?` : "How does it compare with the alternatives?",
    "What changed technically?",
    "Who benefits from this?",
    "Summarize it in 30 seconds",
  ];
}

export const STARTER_PROMPTS = [
  "Summarize today’s most important AI news",
  "Compare Claude and Gemini for real work",
  "What are the best AI tools for coding right now?",
  "How do MCP servers work?",
  "Find promising AI business ideas for a solo founder",
];

export function firstName(): string | undefined {
  try {
    const n = (localStorage.getItem("signal:userName") ?? "").trim();
    return n ? n.split(/\s+/)[0] : undefined;
  } catch { return undefined; }
}

export function updatedLabel(iso: string | null | undefined): string | undefined {
  if (!iso) return undefined;
  const t = formatTimeAgo(iso);
  return t ? `Updated ${t}` : undefined;
}
