import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { normalizeUrl } from "@/lib/url";
import { cleanWhyItMatters } from "@/lib/whyItMatters";
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
    whyItMatters: cleanWhyItMatters(r.why_it_matters),
    // Normalized at the boundary → invalid/redirect URLs become "" (no button).
    url: normalizeUrl(r.url) ?? "",
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

// ── Stale-while-revalidate feed cache ───────────────────────────────────────
// Memory + localStorage so reopening Home paints INSTANTLY from the last feed,
// then revalidates in the background. Kills the "blank Home → sections pop in"
// experience on every navigation/reopen. Cache holds mapped FeedItems.
const FEED_CACHE_KEY = "signal:feed:v1";
let _memFeed: (FeedItem & { publishedAt?: string; fetchedAt?: string })[] | null = null;

function readFeedCache(): typeof _memFeed {
  if (_memFeed) return _memFeed;
  try {
    const raw = localStorage.getItem(FEED_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.items) && parsed.items.length > 0) {
      _memFeed = parsed.items;
      return _memFeed;
    }
  } catch { /* ignore */ }
  return null;
}

function writeFeedCache(items: (FeedItem & { publishedAt?: string; fetchedAt?: string })[], fetchedAt: string | null) {
  _memFeed = items;
  try {
    // Cap what we persist (top 80) to stay well under storage limits.
    localStorage.setItem(FEED_CACHE_KEY, JSON.stringify({ items: items.slice(0, 80), fetchedAt, cachedAt: Date.now() }));
  } catch { /* quota / private mode — memory cache still works */ }
}

export function useLiveFeed() {
  const cached = readFeedCache();
  const [items, setItems] = useState<FeedItem[]>(cached ?? []);
  const [status, setStatus] = useState<FetchStatus>({
    lastFetchAt: null,
    itemCount: cached?.length ?? 0,
    // Cache present ⇒ we already have content to paint; not "loading" (blank).
    loading: !cached,
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
    writeFeedCache(mapped, mapped[0]?.fetchedAt ?? null);
    // Archive health check only — ingestion is cron-driven server-side
    // (20260722130000_ingestion_cron.sql). The frontend reads feed_items and
    // never triggers ingestion itself, including under a thin/empty archive.
    const count = mapped.length;
    if (count < 100) {
      console.warn("[Signal feed] Archive has only", count, "articles — search quality will be degraded.");
    }
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
