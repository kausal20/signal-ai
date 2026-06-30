import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Header } from "@/components/Header";
import { BottomNav } from "@/components/BottomNav";
import { FeedCard } from "@/components/FeedCard";
import { SearchDiscovery } from "@/components/SearchDiscovery";
import { CategoryTabs } from "@/components/CategoryTabs";
import { PullToRefresh } from "@/components/PullToRefresh";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useOnboarding } from "@/hooks/useOnboarding";
import { PushPermissionBanner } from "@/components/PushPermissionBanner";
import { usePersonalizedFeed } from "@/hooks/usePersonalizedFeed";
import { Inbox, CheckCircle2 } from "lucide-react";
import { ContinueBuilding } from "@/components/ContinueBuilding";
import { HeroOpportunity } from "@/components/HeroOpportunity";
import { SignalRecommendation } from "@/components/SignalRecommendation";
import { AiBriefChips } from "@/components/AiBriefChips";
import { TopSignals } from "@/components/TopSignals";
import { MissedToday } from "@/components/MissedToday";
import { FeedSkeleton } from "@/components/Skeleton";
import { SavedCollections } from "@/components/SavedCollections";
import { initSignals, track, trackOutcome } from "@/lib/signals";
import { touchProject } from "@/lib/projects";

type FeedSection = "home" | "search" | "saved";

const Index = () => {
  const navigate = useNavigate();
  const { isComplete, loading: onboardingLoading } = useOnboarding();

  const { items: FEED, status, refresh, advisor } = usePersonalizedFeed();
  const [bookmarks, setBookmarks] = useLocalStorage<string[]>("signal:bookmarks", []);
  const [query, setQuery] = useState("");
  const [activeSection, setActiveSection] = useState<FeedSection>("home");
  const [activeTab, setActiveTab] = useState("all");

  // Start the behavioural-signal session (idempotent) on mount.
  useEffect(() => initSignals(), []);

  // Fire a (debounced) search signal so interests evolve from real queries.
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => track("search", { query: q }), 700);
    return () => { if (searchTimer.current) clearTimeout(searchTimer.current); };
  }, [query]);

  useEffect(() => {
    if (!onboardingLoading && !isComplete) {
      navigate("/onboarding");
    }
  }, [isComplete, onboardingLoading, navigate]);

  const isSearchSection = activeSection === "search";
  const isSavedSection = activeSection === "saved";
  const isSearching = query.trim().length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return FEED.filter((it) => {
      if ((it.score ?? 0) < 50) return false;
      if (isSavedSection && !bookmarks.includes(it.id)) return false;
      if (q && !`${it.title} ${it.summary} ${it.whyItMatters}`.toLowerCase().includes(q)) return false;
      if (activeSection === "home" && activeTab !== "all" && it.tag !== activeTab) return false;
      return true;
    });
  }, [query, isSavedSection, bookmarks, FEED, activeTab, activeSection]);

  // Derive the briefing hierarchy (hero / chips / top-3 / feed / missed) for the
  // Home "all" tab. Deduped: a story shown above never repeats in the feed.
  const briefing = useMemo(() => {
    const ranked = filtered; // already score-filtered + personalized order
    if (activeSection !== "home" || activeTab !== "all" || ranked.length === 0) {
      return { hero: null as typeof ranked[number] | null, chips: [] as typeof ranked, top3: [] as typeof ranked, feed: ranked, missed: [] as typeof ranked };
    }
    const heroById = advisor?.best_opportunity_today?.id
      ? ranked.find((i) => i.id === advisor.best_opportunity_today!.id)
      : null;
    const hero = heroById ?? ranked.find((i) => i.intel?.opportunity) ?? ranked[0];
    const rest = ranked.filter((i) => i.id !== hero.id);
    const top3 = rest.slice(0, 3);
    const shown = new Set<string>([hero.id, ...top3.map((i) => i.id)]);

    // Missed: important, 1–3 days old, never saved, not already shown.
    const now = Date.now();
    const missed = FEED.filter((i) => {
      if (shown.has(i.id) || bookmarks.includes(i.id)) return false;
      if (i.impact !== "critical" && i.impact !== "major") return false;
      const age = (now - new Date(i.timestamp).getTime()) / 3_600_000;
      return age >= 24 && age <= 72;
    }).slice(0, 3);
    const missedIds = new Set(missed.map((i) => i.id));

    const feed = rest.filter((i) => !shown.has(i.id) && !missedIds.has(i.id));
    const chips = ranked.slice(0, 5);
    return { hero, chips, top3, feed, missed };
  }, [filtered, activeSection, activeTab, advisor, FEED, bookmarks]);

  if (onboardingLoading) return null;

  const toggleBookmark = (id: string) =>
    setBookmarks((prev) => {
      const has = prev.includes(id);
      if (has) {
        track("dismissed", { feed_item_id: id });   // un-bookmark = negative signal
        return prev.filter((p) => p !== id);
      }
      track("bookmarked", { feed_item_id: id });
      trackOutcome("saved", id);                     // outcome: user found it worth keeping
      return [...prev, id];
    });

  // Chip / "missed" tap → smooth-scroll to the story card + record the open.
  const scrollToStory = (id: string) => {
    track("opened", { feed_item_id: id });
    requestAnimationFrame(() => {
      document.getElementById(`story-${id}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  };

  const goHome = () => {
    setActiveSection("home");
    setQuery("");
    setActiveTab("all");
  };

  const goSearch = () => {
    setActiveSection("search");
    setActiveTab("all");
  };

  const goSaved = () => {
    setActiveSection("saved");
    setQuery("");
    setActiveTab("all");
  };

  const emptyMessage = (() => {
    if (isSavedSection) return "You haven't saved any items yet. Bookmark stories you want to revisit.";
    if (isSearchSection) return isSearching ? "No matching intelligence found." : "Search AI news, tools, and workflows.";
    if (activeTab !== "all") return `No ${activeTab} items right now. Try a different category.`;
    return "Try adjusting your filters.";
  })();

  return (
    <div className="min-h-screen bg-background text-foreground pb-24">
      {!isSearchSection && <PushPermissionBanner />}
      {!isSearchSection && <Header lastUpdated={status.lastFetchAt} loading={status.loading} />}

      <PullToRefresh onRefresh={refresh}>
        <main className={isSearchSection ? "" : "max-w-2xl mx-auto px-4 sm:px-6 py-5 sm:py-8"}>
          {isSearchSection ? (
            <SearchDiscovery
              query={query}
              results={filtered}
              bookmarks={bookmarks}
              onBack={goHome}
              onQueryChange={setQuery}
              onToggleBookmark={toggleBookmark}
            />
          ) : isSavedSection ? (
            <>
              <p className="section-label mb-5">Saved</p>
              <SavedCollections items={filtered} bookmarks={bookmarks} onToggleBookmark={toggleBookmark} />
              <Footer />
            </>
          ) : status.loading && FEED.length === 0 ? (
            <>
              <div className="skeleton h-44 w-full rounded-[1.5rem] mb-8" />
              <FeedSkeleton count={5} />
            </>
          ) : filtered.length === 0 ? (
            <div className="py-20 text-center animate-fade-up">
              <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-white/[0.03] border border-white/[0.06] flex items-center justify-center">
                <Inbox className="w-6 h-6 text-muted-foreground" />
              </div>
              <h3 className="text-base font-semibold mb-2">No intelligence found</h3>
              <p className="text-sm text-muted-foreground max-w-xs mx-auto">{emptyMessage}</p>
            </div>
          ) : (
            <>
              {/* SIGNATURE — one-line "if you do one thing today" below greeting. */}
              {activeTab === "all" && briefing.hero && (
                <SignalRecommendation item={briefing.hero} onAct={scrollToStory} />
              )}

              {/* SECTION 1 — Today's Recommendation (largest, why-it-matters). */}
              {activeTab === "all" && briefing.hero && (
                <div id={`story-${briefing.hero.id}`}>
                  <HeroOpportunity
                    item={briefing.hero}
                    saved={bookmarks.includes(briefing.hero.id)}
                    onSave={() => toggleBookmark(briefing.hero!.id)}
                    onView={() => track("opened", { feed_item_id: briefing.hero!.id })}
                  />
                </div>
              )}

              {/* SECTION 2 — Continue Building (medium, what-to-do-next). Shows a
                  gentle prompt when there's no active project. */}
              {activeTab === "all" && (
                <ContinueBuilding
                  feed={FEED}
                  onContinue={(id) => { touchProject(); scrollToStory(id); }}
                />
              )}

              {/* SECTION 3 — Today's AI Highlights (quick-scan chips) */}
              {activeTab === "all" && <AiBriefChips items={briefing.chips} onSelect={scrollToStory} />}

              {/* SECTION 4 — Don't Miss Today (smaller ranked cards, what-happened) */}
              {activeTab === "all" && <TopSignals items={briefing.top3} bookmarks={bookmarks} onToggleBookmark={toggleBookmark} />}

              {/* Filter control */}
              <CategoryTabs activeTab={activeTab} onTabChange={setActiveTab} />

              {/* SECTION 5 — Today's Feed (remaining, deduped) */}
              {briefing.feed.length > 0 && (
                <>
                  <p className="section-label mb-4 mt-1">
                    {activeTab === "all" ? "Today's Feed" : `${activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}s`}
                  </p>
                  <div className="space-y-4">
                    {briefing.feed.map((item, i) => (
                      <div key={item.id} id={`story-${item.id}`}>
                        <FeedCard item={item} index={i} bookmarked={bookmarks.includes(item.id)} onToggleBookmark={toggleBookmark} />
                      </div>
                    ))}
                  </div>
                </>
              )}

              {/* SECTION 6 — Missed Today (only if applicable) */}
              {activeTab === "all" && <MissedToday items={briefing.missed} onSelect={scrollToStory} />}

              {/* SECTION 7 — You're all caught up */}
              <div className="py-10 text-center animate-fade-up">
                <div className="w-11 h-11 mx-auto mb-3 rounded-full bg-green/10 border border-green/20 flex items-center justify-center">
                  <CheckCircle2 className="w-5 h-5 text-green" />
                </div>
                <p className="text-sm font-semibold text-foreground">You're done for today</p>
                <p className="text-xs text-muted-foreground mt-1">I'll keep watching and ping you when something matters.</p>
              </div>

              <Footer />
            </>
          )}
        </main>
      </PullToRefresh>

      <BottomNav
        activeSection={activeSection}
        bookmarkCount={bookmarks.length}
        onHomeClick={goHome}
        onSearchClick={goSearch}
        onSavedClick={goSaved}
      />
    </div>
  );
};

function Footer() {
  return (
    <footer className="mt-8 pt-6 border-t border-white/[0.04] text-[11px] font-medium text-muted-foreground flex flex-col sm:flex-row gap-2 justify-between">
      <span>Signal Intelligence</span>
      <span>Curated from GitHub / Reddit / Product Hunt</span>
    </footer>
  );
}

export default Index;
