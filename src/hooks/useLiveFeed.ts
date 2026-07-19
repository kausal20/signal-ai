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
  source_label?: string | null;
  source_quality?: { source_name?: string } | Record<string, unknown> | null;
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

function sourceNameFromQuality(sourceQuality: DbRow["source_quality"]): string | undefined {
  if (!sourceQuality || typeof sourceQuality !== "object") return undefined;
  const value = sourceQuality["source_name" as keyof typeof sourceQuality];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
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
    sourceLabel: r.source_label ?? sourceNameFromQuality(r.source_quality),
    sourceQuality: r.source_quality ?? undefined,
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

// Module-level guard: only auto-trigger ingestion once per browser session.
let _autoIngestTriggered = false;

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

    // ── Archive health check & auto-ingestion ────────────────────────────
    const count = mapped.length;
    if (count < 100) {
      console.warn("[Signal feed] Archive has only", count, "articles — search quality will be degraded.");
    }
    if (count < 20 && !_autoIngestTriggered) {
      _autoIngestTriggered = true;
      console.info("[Signal feed] Archive nearly empty (", count, "items). Auto-triggering ingestion pipeline...");
      supabase.functions.invoke("fetch-feed", { body: {} }).then(
        (res) => {
          if (res.error) {
            console.warn("[Signal feed] Auto-ingestion failed:", res.error);
          } else {
            console.info("[Signal feed] Auto-ingestion triggered successfully. Reloading feed...");
            // Reload the feed after ingestion completes (give it a moment)
            setTimeout(() => {
              supabase
                .from("feed_items")
                .select("*")
                .order("published_at", { ascending: false })
                .limit(200)
                .then(({ data: freshData }) => {
                  if (freshData && freshData.length > 0) {
                    const freshMapped = freshData.map(rowToItem);
                    setItems(freshMapped);
                    setStatus((s) => ({
                      ...s,
                      itemCount: freshMapped.length,
                      lastFetchAt: freshMapped[0]?.fetchedAt ?? s.lastFetchAt,
                    }));
                    console.info("[Signal feed] Feed reloaded after ingestion:", freshMapped.length, "articles");
                  }
                });
            }, 8000); // Wait 8s for ingestion pipeline to finish
          }
        },
        (err) => console.warn("[Signal feed] Auto-ingestion request failed:", err),
      );
    }
  }, []);

  const refresh = useCallback(async () => {
    setStatus((s) => ({ ...s, loading: true, error: null }));
    await load();
    setStatus((s) => ({ ...s, triggeredAt: new Date().toISOString() }));
  }, [load]);

  // Initial load + cached feed refresh. Ingestion stays backend-only.
  useEffect(() => {
    load();
    // refresh cached feed every 30 minutes while open
    const id = setInterval(refresh, 30 * 60 * 1000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { items, status, refresh, reload: load };
}
