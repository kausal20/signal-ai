import { useEffect, useMemo, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useFeed } from "@/app/FeedProvider";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useSignalSearch } from "@/hooks/useSignalSearch";
import { useStoryImages } from "@/hooks/useStoryImages";
import { track } from "@/lib/signals";
import { mapTrending, formatTimeAgo } from "@/adapters/homeV2";
import { mapSearchStory } from "@/adapters/editorial";
import { trendingSearches } from "@/components/SearchDiscovery";
import { SearchPage, type SearchState } from "@/ui-editorial/pages/SearchPage";
import type { EdStory } from "@/ui-editorial/types";

// Same storage key + shape as the previous Search page, so history carries over.
const RECENT_KEY = "signal:recentSearches";
type Recent = { term: string; t: number };
const MAX_RECENT = 8;

const SUGGESTIONS = ["Latest AI news", "AI agents", "Claude Code", "Open source models", "Startups", "MCP"];

export default function SearchRoute() {
  const navigate = useNavigate();
  const feed = useFeed();
  const [params, setParams] = useSearchParams();
  const query = params.get("q") ?? "";
  const setQuery = (value: string) => {
    setParams((previous) => {
      const next = new URLSearchParams(previous);
      if (value) next.set("q", value); else next.delete("q");
      return next;
    }, { replace: true });
  };
  const [recent, setRecent] = useLocalStorage<Recent[]>(RECENT_KEY, []);
  const recorded = useRef("");

  const q = query.trim();
  const backend = useSignalSearch(query, true);

  // Debounced behavioural signal, as before — interests evolve from real queries.
  useEffect(() => {
    if (q.length < 2) return;
    const t = setTimeout(() => track("search", { query: q }), 700);
    return () => clearTimeout(t);
  }, [q]);

  const remember = (term: string) => {
    const t = term.trim();
    if (t.length < 2) return;
    recorded.current = t.toLowerCase();
    setRecent((prev) => [{ term: t, t: Date.now() }, ...prev.filter((r) => r.term.toLowerCase() !== t.toLowerCase())].slice(0, MAX_RECENT));
  };

  // A query that returned results is worth remembering even if never "submitted".
  useEffect(() => {
    if (backend.ready && !backend.loading && !backend.fallback && backend.results.length > 0 && q.toLowerCase() !== recorded.current) remember(q);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backend.ready, backend.loading, backend.results.length, q]);

  // The archive can hold the same story twice (re-published, case differences):
  // show each headline once.
  const unique = useMemo(() => {
    const seen = new Set<string>();
    return backend.results.filter((r) => {
      const k = r.title.toLowerCase().replace(/[^a-z0-9]+/g, "");
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [backend.results]);

  const getImage = useStoryImages(unique.map((r) => r.url));
  const results: EdStory[] = useMemo(
    () => unique.map((s) => mapSearchStory(s, { saved: feed.isSaved(s.id), read: feed.readIds.includes(s.id), image: getImage(s.url) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [unique, feed.isSaved, feed.readIds, getImage],
  );

  const trending = useMemo(() => {
    const all = mapTrending(trendingSearches, feed.items);
    const live = all.filter((t) => t.rising).sort((a, b) => Number(b.signals.replace(/,/g, "")) - Number(a.signals.replace(/,/g, "")));
    return (live.length > 0 ? live : all).slice(0, 8).map((t) => ({
      term: t.term,
      meta: t.rising ? `${t.signals} ${Number(t.signals.replace(/,/g, "")) === 1 ? "story" : "stories"} in today’s feed` : undefined,
    }));
  }, [feed.items]);

  const state: SearchState =
    q.length < 2 ? "idle"
    : backend.error ? "error"
    : backend.loading || !backend.ready ? "loading"
    : backend.fallback || backend.results.length === 0 ? "empty"
    : "ready";

  return (
    <SearchPage
      query={query}
      state={state}
      suggestions={SUGGESTIONS}
      trending={trending}
      recent={recent.map((r) => ({ term: r.term, whenLabel: formatTimeAgo(new Date(r.t).toISOString()) }))}
      results={results}
      related={backend.related.slice(0, 5)}
      onQueryChange={setQuery}
      onSubmit={(v) => { setQuery(v); remember(v); }}
      onPickTerm={(t) => { setQuery(t); remember(t); window.scrollTo({ top: 0 }); }}
      onRemoveRecent={(t) => setRecent((prev) => prev.filter((r) => r.term !== t))}
      onClearRecent={() => setRecent([])}
      onOpenStory={(s) => feed.markRead(s.id)}
      onAskSignal={(text) => navigate("/signal", { state: { seed: `Tell me what's going on with ${text}.` } })}
      onRetry={backend.refresh}
    />
  );
}
