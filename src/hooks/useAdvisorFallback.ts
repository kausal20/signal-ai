// useAdvisorFallback — guarantees the Advisor "My Pick" section always has data,
// even when feed_items (the curated 12/run) is stale or the personalize function
// failed. Reuses the existing Content Archive + Signal search RPCs (no new
// pipeline, no hardcoded picks). Priority:
//   1. personalized  → the caller's hero from usePersonalizedFeed (if any)
//   2. trending      → signal_trending()   (empty-query discovery)
//   3. high-impact   → content_archive top by editorial_score (this week)
//   4. latest official → content_archive is_official_company_news, newest
// Never returns null unless the whole archive is empty (should be impossible).

import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FeedItem } from "@/data/feed";

interface ArchiveRow {
  id: string;
  title: string;
  summary?: string;
  publisher?: string;
  source?: string;
  source_type?: string;
  original_url?: string;
  url?: string;
  event_type?: string;
  editorial_quality_score?: number;
  published_at?: string;
  trend_entities?: string[];
  is_official_company_news?: boolean;
}

type Source = "personalized" | "trending" | "high_impact" | "official" | "none";

function toFeedItem(r: ArchiveRow): FeedItem {
  return {
    id: r.id,
    title: r.title ?? "Untitled",
    summary: r.summary ?? "",
    whyItMatters: r.summary ?? "",
    what_happened: r.summary ?? "",
    who_for: "",
    opportunity: "",
    url: (r.original_url || r.url) ?? "#",
    tag: "news",
    source: r.publisher ?? r.source ?? "Signal archive",
    sourceLabel: r.publisher ?? undefined,
    category: (r.event_type as any) ?? "news",
    content_category: "Must Know",
    score: Math.max(60, Math.round(r.editorial_quality_score ?? 60)),
    usefulness: 60,
    vibe_friendly: true,
    humanized: false,
    engagement: 0,
    published_at: r.published_at ?? new Date().toISOString(),
    timestamp: r.published_at ?? new Date().toISOString(),
    impact: (r.editorial_quality_score ?? 0) >= 80 ? "critical" : "major",
    novelty_score: 60,
    business_impact_score: 60,
    builder_value_score: 60,
    adoption_potential_score: 60,
    market_impact_score: 60,
    confidence_score: 70,
    opportunity_score: 60,
    corroboration_score: 60,
    source_count: 1,
    leverage_score: 6,
    trend_score: 0,
    momentum_score: 0,
    action_label: "watch",
    trend_entities: r.trend_entities ?? [],
    ranking_reason: "Content archive fallback",
    intel: {
      signalScore: Math.max(60, Math.round(r.editorial_quality_score ?? 60)),
      opportunity: {
        type: r.event_type && r.event_type !== "none" ? r.event_type : "Signal",
        title: r.title,
        explanation: r.summary ?? "",
      },
      // Small deterministic "why picked" so the Advisor UI has copy.
      whyPicked: [
        r.is_official_company_news ? "Official company source" : null,
        (r.editorial_quality_score ?? 0) >= 75 ? "High editorial quality" : null,
        (r.trend_entities?.length ?? 0) > 0 ? `Covers ${r.trend_entities![0]}` : null,
      ].filter(Boolean) as string[],
      action: `Read: ${r.title}`,
      recommendationReason: r.summary ?? "Top signal from Signal's archive today.",
      priority: (r.editorial_quality_score ?? 0) >= 80 ? "High" : "Medium",
    } as any,
  } as unknown as FeedItem;
}

export interface AdvisorFallback {
  hero: FeedItem | undefined;
  source: Source;
  loading: boolean;
  error: string | null;
}

/**
 * Returns a hero for the Advisor page. If `personalizedHero` is present it wins;
 * otherwise this hook resolves an archive-based hero using existing RPCs.
 */
export function useAdvisorFallback(personalizedHero?: FeedItem): AdvisorFallback {
  const [hero, setHero] = useState<FeedItem | undefined>(personalizedHero);
  const [source, setSource] = useState<Source>(personalizedHero ? "personalized" : "none");
  const [loading, setLoading] = useState(!personalizedHero);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (personalizedHero) {
      setHero(personalizedHero);
      setSource("personalized");
      setLoading(false);
      return;
    }

    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);

      // Priority 2 — signal_trending (empty-query discovery over content_archive).
      try {
        const { data, error: e } = await supabase.rpc("signal_trending", { max_results: 6 });
        if (e) throw e;
        const rows = (data ?? []) as ArchiveRow[];
        const first = rows[0];
        if (first) {
          if (cancelled) return;
          setHero(toFeedItem(first));
          setSource("trending");
          setLoading(false);
          return;
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      }

      // Priority 3 — highest editorial quality this week (direct table query).
      try {
        const weekAgo = new Date(Date.now() - 7 * 86400_000).toISOString();
        const { data } = await supabase
          .from("content_archive")
          .select("id,title,summary,publisher,source,source_type,original_url,url,event_type,editorial_quality_score,published_at,trend_entities,is_official_company_news")
          .eq("archive_status", "active")
          .gte("published_at", weekAgo)
          .order("editorial_quality_score", { ascending: false, nullsFirst: false })
          .order("published_at", { ascending: false })
          .limit(1);
        const row = (data ?? [])[0] as ArchiveRow | undefined;
        if (row) {
          if (cancelled) return;
          setHero(toFeedItem(row));
          setSource("high_impact");
          setLoading(false);
          return;
        }
      } catch { /* try next */ }

      // Priority 4 — latest official company news, newest first.
      try {
        const { data } = await supabase
          .from("content_archive")
          .select("id,title,summary,publisher,source,source_type,original_url,url,event_type,editorial_quality_score,published_at,trend_entities,is_official_company_news")
          .eq("archive_status", "active")
          .eq("is_official_company_news", true)
          .order("published_at", { ascending: false })
          .limit(1);
        const row = (data ?? [])[0] as ArchiveRow | undefined;
        if (row) {
          if (cancelled) return;
          setHero(toFeedItem(row));
          setSource("official");
          setLoading(false);
          return;
        }
      } catch { /* fall through to none */ }

      if (!cancelled) { setSource("none"); setLoading(false); }
    })();

    return () => { cancelled = true; };
  }, [personalizedHero?.id]);

  return { hero, source, loading, error };
}
