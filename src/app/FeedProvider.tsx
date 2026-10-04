// Shared data layer for the editorial routes. Home, Search, Saved and Profile
// are now separate routes, but they must keep behaving like one app: ONE feed
// fetch + personalization call for the session, ONE bookmark store, and the
// same behavioural telemetry the previous Index component emitted. Mounted once
// by the editorial layout, so switching tabs never refetches.

import { createContext, useCallback, useContext, useMemo, type ReactNode } from "react";
import { usePersonalizedFeed } from "@/hooks/usePersonalizedFeed";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { track, trackOutcome } from "@/lib/signals";

type Feed = ReturnType<typeof usePersonalizedFeed>;

export interface FeedContextValue {
  items: Feed["items"];
  status: Feed["status"];
  refresh: Feed["refresh"];
  advisor: Feed["advisor"];
  profile: Feed["profile"];
  bookmarks: string[];
  /** id → ISO time the story was saved (only for saves made since this was tracked). */
  savedAt: Record<string, string>;
  readIds: string[];
  isSaved: (id: string) => boolean;
  toggleSave: (id: string) => void;
  markRead: (id: string) => void;
  /** Forget which stories were opened (Profile → Privacy & memory). Saves stay. */
  clearReadHistory: () => void;
}

const FeedContext = createContext<FeedContextValue | null>(null);

export function FeedProvider({ children }: { children: ReactNode }) {
  const feed = usePersonalizedFeed();
  // Same storage key + shape as the legacy Index/Advisor/Settings, so saved
  // stories carry over untouched.
  const [bookmarks, setBookmarks] = useLocalStorage<string[]>("signal:bookmarks", []);
  const [savedAt, setSavedAt] = useLocalStorage<Record<string, string>>("signal:saved-at", {});
  const [readIds, setReadIds] = useLocalStorage<string[]>("signal:read", []);

  const toggleSave = useCallback((id: string) => {
    // Side effects stay outside the state updaters (updaters must be pure).
    if (bookmarks.includes(id)) {
      track("dismissed", { feed_item_id: id });            // un-save = negative signal
      setBookmarks((prev) => prev.filter((p) => p !== id));
      setSavedAt((prev) => { const next = { ...prev }; delete next[id]; return next; });
    } else {
      track("bookmarked", { feed_item_id: id });
      trackOutcome("saved", id);                            // outcome: worth keeping
      setBookmarks((prev) => (prev.includes(id) ? prev : [...prev, id]));
      setSavedAt((prev) => ({ ...prev, [id]: new Date().toISOString() }));
    }
  }, [bookmarks, setBookmarks, setSavedAt]);

  const markRead = useCallback((id: string) => {
    track("opened", { feed_item_id: id });
    setReadIds((prev) => (prev.includes(id) ? prev : [...prev.slice(-499), id]));
  }, [setReadIds]);

  const clearReadHistory = useCallback(() => setReadIds([]), [setReadIds]);

  const isSaved = useCallback((id: string) => bookmarks.includes(id), [bookmarks]);

  const value = useMemo<FeedContextValue>(() => ({
    items: feed.items, status: feed.status, refresh: feed.refresh,
    advisor: feed.advisor, profile: feed.profile,
    bookmarks, savedAt, readIds, isSaved, toggleSave, markRead, clearReadHistory,
  }), [feed.items, feed.status, feed.refresh, feed.advisor, feed.profile, bookmarks, savedAt, readIds, isSaved, toggleSave, markRead, clearReadHistory]);

  return <FeedContext.Provider value={value}>{children}</FeedContext.Provider>;
}

export function useFeed(): FeedContextValue {
  const ctx = useContext(FeedContext);
  if (!ctx) throw new Error("useFeed must be used inside <FeedProvider>");
  return ctx;
}
