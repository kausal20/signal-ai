import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { FeedItem } from "@/data/feed";

interface DbRow {
  id: string;
  title: string;
  summary: string;
  why_it_matters: string | null;
  url: string;
  tag: string;
  source: string;
  category: string;
  score: number;
  engagement: number;
  underrated: boolean | null;
  growth: string | null;
  published_at: string;
  fetched_at: string;
  who_for?: string | null;
  vibe_friendly?: boolean | null;
  usefulness?: number | null;
  impact?: string | null;
}

export interface FetchStatus {
  lastFetchAt: string | null;
  itemCount: number;
  loading: boolean;
  error: string | null;
  sources: Record<string, { status: string; count: number; error?: string }> | null;
  triggeredAt: string | null;
}

function rowToItem(r: DbRow): FeedItem & { publishedAt: string; fetchedAt: string } {
  const impactRaw = (r.impact ?? "useful").toLowerCase();
  const impact = (impactRaw === "critical" || impactRaw === "major" ? impactRaw : "useful") as FeedItem["impact"];
  return {
    id: r.id,
    title: r.title,
    summary: r.summary,
    whyItMatters: r.why_it_matters ?? "",
    url: r.url,
    tag: r.tag as FeedItem["tag"],
    source: r.source as FeedItem["source"],
    category: r.category as FeedItem["category"],
    score: r.score,
    engagement: r.engagement,
    timestamp: r.published_at,
    underrated: !!r.underrated,
    growth: r.growth ?? undefined,
    whoFor: r.who_for ?? undefined,
    vibeFriendly: !!r.vibe_friendly,
    usefulness: r.usefulness ?? undefined,
    impact,
    publishedAt: r.published_at,
    fetchedAt: r.fetched_at,
  };
}

export function useLiveFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [status, setStatus] = useState<FetchStatus>({
    lastFetchAt: null,
    itemCount: 0,
    loading: true,
    error: null,
    sources: null,
    triggeredAt: null,
  });

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("feed_items")
      .select("*")
      .order("published_at", { ascending: false })
      .limit(200);
    if (error) {
      setStatus((s) => ({ ...s, loading: false, error: error.message }));
      return;
    }
    const mapped = (data ?? []).map(rowToItem);
    setItems(mapped);
    setStatus((s) => ({
      ...s,
      loading: false,
      itemCount: mapped.length,
      lastFetchAt: mapped[0]?.fetchedAt ?? s.lastFetchAt,
      error: null,
    }));
  }, []);

  const refresh = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    try {
      const { data, error } = await supabase.functions.invoke("fetch-feed", { body: {} });
      if (error) throw error;
      setStatus((s) => ({
        ...s,
        sources: data?.sources ?? null,
        triggeredAt: data?.ran_at ?? new Date().toISOString(),
      }));
      await load();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setStatus((s) => ({ ...s, loading: false, error: msg }));
    }
  }, [load]);

  // Initial load + auto refresh on mount
  useEffect(() => {
    load().then(() => {
      // trigger background refresh on app open
      refresh();
    });
    // background refresh every 30 minutes while open
    const id = setInterval(refresh, 30 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, status, refresh, reload: load };
}
