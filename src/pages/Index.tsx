import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
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
import { useSignalSearch } from "@/hooks/useSignalSearch";
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
import { touchProject, getProject } from "@/lib/projects";
import { HOME_CATEGORIES, withProgressiveFreshness, type HomeCategoryId } from "@/lib/categories";
import { HomePage } from "@/ui-v2/pages/HomePage";
import { HomePageSkeleton } from "@/ui-v2/components/SignalSkeleton";
import { SearchPage } from "@/ui-v2/pages/SearchPage";
import { SavedPage } from "@/ui-v2/pages/SavedPage";
import { trendingSearches, featuredCollections } from "@/components/SearchDiscovery";
import {
  mapSignal, mapRecommendation, mapProject, mapTrending, mapCollections, mapSources,
  SAVED_COLLECTIONS, classifySaved,
} from "@/adapters/homeV2";

// P1 migration flag — new ui-v2 Home. Old Home stays in this file until verified.
const USE_V2_HOME = true;
// P3 migration flag — new ui-v2 Search. Old SearchDiscovery stays until verified.
const USE_V2_SEARCH = true;
// P4 migration flag — new ui-v2 Saved. Old SavedCollections stays until verified.
const USE_V2_SAVED = true;

// Browse-by-intent → seed query (existing search behavior, no new logic).
const INTENT_QUERY: Record<string, string> = {
  build: "AI tools",
  learn: "guide",
  opportunity: "business idea",
  catchup: "AI news",
};

type FeedSection = "home" | "search" | "saved";

const Index = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isComplete, loading: onboardingLoading } = useOnboarding();

  const { items: FEED, status, refresh, advisor, profile } = usePersonalizedFeed();
  const [bookmarks, setBookmarks] = useLocalStorage<string[]>("signal:bookmarks", []);
  const [query, setQuery] = useState("");

  // Read initial section from URL query param (e.g. /?section=saved)
  const initialSection = (() => {
    const s = searchParams.get("section");
    if (s === "saved" || s === "search") return s;
    return "home" as FeedSection;
  })();
  const [activeSection, setActiveSection] = useState<FeedSection>(initialSection);

  // Clear the section param from URL after reading it (keep URL clean)
  useEffect(() => {
    if (searchParams.has("section")) {
      searchParams.delete("section");
      setSearchParams(searchParams, { replace: true });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const [activeTab, setActiveTab] = useState("all");
  const [savedTab, setSavedTab] = useState("all");

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

  // Signal Analysis sheet dispatches window events: a related-company chip runs a
  // search here; "Ask Signal" routes to the Advisor (where Ask Signal lives).
  useEffect(() => {
    const onSearch = (e: Event) => {
      const term = (e as CustomEvent<string>).detail;
      if (typeof term !== "string" || !term.trim()) return;
      setActiveSection("search");
      setQuery(term.trim());
      window.scrollTo({ top: 0, behavior: "smooth" });
    };
    const onAsk = () => navigate("/advisor");
    window.addEventListener("signal:search", onSearch as EventListener);
    window.addEventListener("signal:ask", onAsk as EventListener);
    return () => {
      window.removeEventListener("signal:search", onSearch as EventListener);
      window.removeEventListener("signal:ask", onAsk as EventListener);
    };
  }, [navigate]);
  const isSearching = query.trim().length > 0;

  // Archive-wide backend search (top-level hook). Falls back to the client
  // filter below when the `search` function isn't deployed yet.
  const backendSearch = useSignalSearch(query, isSearchSection);

  // Multi-category filter (topic-based, not resource-based). An article can
  // belong to many categories at once — News + Models + Companies routinely
  // overlap — so `isInCategory` uses inclusive membership. Recency uses a
  // progressive window (24h → 3d → 7d → 30d) so no category ever feels empty
  // when real intelligence exists further back.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = FEED.filter((it) => {
      if ((it.score ?? 0) < 50) return false;
      if (isSavedSection && !bookmarks.includes(it.id)) return false;
      if (q && !`${it.title} ${it.summary} ${it.whyItMatters}`.toLowerCase().includes(q)) return false;
      return true;
    });
    if (activeSection !== "home" || activeTab === "all") return base;
    return withProgressiveFreshness(base, activeTab as HomeCategoryId).items;
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

  // Stable card callbacks — memoized so FeedCard / TopStoryCard (React.memo)
  // don't re-render when Index re-renders for unrelated reasons. Toggling one
  // bookmark now re-renders one card instead of the whole feed.
  const toggleBookmark = useCallback((id: string) =>
    setBookmarks((prev) => {
      const has = prev.includes(id);
      if (has) {
        track("dismissed", { feed_item_id: id });   // un-bookmark = negative signal
        return prev.filter((p) => p !== id);
      }
      track("bookmarked", { feed_item_id: id });
      trackOutcome("saved", id);                     // outcome: user found it worth keeping
      return [...prev, id];
    }), []);

  const openSignalCb = useCallback((id: string) => track("opened", { feed_item_id: id }), []);

  const handleAskSignal = useCallback((id: string) => {
    const a = FEED.find((i) => i.id === id);
    if (!a) return;
    track("opened", { feed_item_id: id });
    navigate("/", {
      state: {
        openAsk: true,
        article: {
          article_id: a.id,
          headline: a.title,
          summary: (a as any).what_happened ?? a.summary,
          publisher: a.sourceLabel ?? a.source,
          publisher_domain: a.url ? (() => { try { return new URL(a.url).hostname.replace(/^www\./, ""); } catch { return undefined; } })() : undefined,
          published_at: a.timestamp,
          source_type: a.intel?.whyPicked?.some((w) => /official/i.test(w)) ? "OFFICIAL_SOURCE" : undefined,
          impact_score: Math.round(a.intel?.signalScore ?? a.score ?? 0),
          event_type: a.category,
          primary_entity: (a.trend_entities ?? [])[0],
          article_url: a.url,
        },
      },
    });
  }, [FEED, navigate]);

  if (onboardingLoading) return null;

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
    if (activeTab !== "all") return `Signal has no recent ${activeTab} intelligence yet. New stories appear as they're published.`;
    return "Try adjusting your filters.";
  })();

  // ── P1: ui-v2 Home ──────────────────────────────────────────────────────
  // Presentation swap only. Same hooks, same handlers, same personalized data
  // (briefing) fed through adapters. Old Home below stays as the fallback for
  // loading/empty and while USE_V2_HOME can be flipped off.
  // Cold start (no cached feed yet): show a Home skeleton that MIRRORS the v2
  // layout so the real page swaps in with zero shift — instead of falling
  // through to the old v1 loading screen (which caused the re-layout jump).
  if (USE_V2_HOME && activeSection === "home" && status.loading && FEED.length === 0) {
    return <HomePageSkeleton />;
  }

  if (
    USE_V2_HOME &&
    activeSection === "home" &&
    !(status.loading && FEED.length === 0) &&
    FEED.length > 0
  ) {
    const isAll = activeTab === "all";
    const heroItem = (isAll ? briefing.hero : null) ?? (filtered.length > 0 ? filtered[0] : null);
    const briefItems = isAll ? briefing.chips : [];
    const topItems = isAll ? briefing.top3 : [];
    const feedItems = isAll
      ? briefing.feed
      : filtered.filter((i) => i.id !== heroItem?.id);

    const criticalCount = FEED.filter((i) => i.impact === "critical").length;
    const readMins = Math.max(1, Math.round(filtered.length * 0.7));
    const name = (typeof localStorage !== "undefined" && localStorage.getItem("signal:userName")) || "there";

    const navSection = (s: string) => {
      if (s === "home") goHome();
      else if (s === "search") goSearch();
      else if (s === "saved") goSaved();
      else if (s === "advisor") navigate("/advisor");
      else if (s === "settings") navigate("/settings");
    };

    return (
      <PullToRefresh onRefresh={refresh}>
      <HomePage
        profile={{
          name,
          initials: name.slice(0, 1).toUpperCase(),
          confidence: typeof profile?.confidence === "number" ? profile.confidence : undefined,
        }}
        briefSummary={`${filtered.length} ${filtered.length === 1 ? "thing" : "things"} worth your time · ${readMins} min read`}
        livePulseLabel={
          criticalCount > 0
            ? `${criticalCount} critical ${criticalCount === 1 ? "signal" : "signals"} today`
            : "All quiet — nothing critical right now"
        }
        hero={heroItem ? mapRecommendation(heroItem, bookmarks.includes(heroItem.id)) : undefined}
        emptyLabel={activeTab === "all" ? "You're all caught up" : `No ${activeTab} signals yet`}
        brief={briefItems.map((i) => mapSignal(i, bookmarks.includes(i.id)))}
        topSignals={topItems.map((i) => mapSignal(i, bookmarks.includes(i.id)))}
        feed={feedItems.map((i) => mapSignal(i, bookmarks.includes(i.id)))}
        categories={HOME_CATEGORIES}
        activeCategory={activeTab}
        bookmarkCount={bookmarks.length}
        project={mapProject(getProject(), FEED)}
        onNavigate={navSection}
        onOpenProfile={() => navigate("/settings")}
        onSelectCategory={(id) => setActiveTab(id)}
        onOpenSignal={openSignalCb}
        onToggleSave={toggleBookmark}
        onAskSignal={handleAskSignal}
        onStartHero={(id) => { track("opened", { feed_item_id: id }); navigate("/advisor"); }}
        onToggleHeroSave={(id) => toggleBookmark(id)}
        onContinueProject={(id) => { touchProject(); track("opened", { feed_item_id: id }); }}
      />
      </PullToRefresh>
    );
  }

  // ── P3: ui-v2 Search ─────────────────────────────────────────────────────
  // Presentation swap only. Same `query` state, same `filtered` results, same
  // `setQuery`/`toggleBookmark` handlers, same debounced search telemetry (fired
  // by the effect above). Trending/collections/sources fed via adapters from
  // existing data. Old SearchDiscovery below stays as the fallback.
  if (USE_V2_SEARCH && isSearchSection) {
    const q = query.trim();
    const searchSources = mapSources(FEED);
    const searchResults = q
      ? backendSearch.results.map((s) => ({ ...s, saved: bookmarks.includes(s.id) }))
      : [];
    const navSection = (s: string) => {
      if (s === "home") goHome();
      else if (s === "saved") goSaved();
      else if (s === "advisor") navigate("/advisor");
      else if (s === "settings") navigate("/settings");
      // "search" → already here, no-op
    };

    return (
      <SearchPage
        query={query}
        onQueryChange={setQuery}
        placeholder="Search AI news, tools, prompts..."
        matchCount={q ? searchResults.length : undefined}
        sourcesTracked={String(new Set(FEED.map((i) => i.source)).size)}
        trending={mapTrending(trendingSearches, FEED)}
        collections={mapCollections(featuredCollections, FEED)}
        sources={searchSources}
        results={searchResults}
        loading={backendSearch.loading}
        error={backendSearch.error}
        fallback={backendSearch.fallback}
        relatedTopics={backendSearch.related}
        relatedProducts={backendSearch.relatedProducts}
        relatedFallback={backendSearch.relatedFallback}
        suggestions={backendSearch.suggestions}
        bookmarkCount={bookmarks.length}
        onNavigate={navSection}
        onSubmitTerm={(term) => setQuery(term)}
        onSelectIntent={(id) => setQuery(INTENT_QUERY[id] ?? id)}
        onOpenCollection={(id) => setQuery(id)}
        onOpenSource={(key) => {
          const src = searchSources.find((x) => x.key === key);
          setQuery(src?.term ?? key);
        }}
        onOpenSignal={(id) => track("opened", { feed_item_id: id })}
        onToggleSave={toggleBookmark}
      />
    );
  }

  // ── P4: ui-v2 Saved ──────────────────────────────────────────────────────
  // Presentation swap only. Same bookmark storage (`filtered` = saved items),
  // same toggleBookmark handler + telemetry. The 5 collections are preserved as
  // tabs with identical first-match classification. Old SavedCollections stays.
  if (USE_V2_SAVED && isSavedSection) {
    const savedItems = filtered; // already restricted to bookmarked items
    const grouped = savedItems.map((i) => ({ item: i, group: classifySaved(i) }));
    const savedTabs = SAVED_COLLECTIONS
      .map((c) => ({
        id: c.id,
        label: c.label,
        count: c.id === "all" ? savedItems.length : grouped.filter((g) => g.group === c.id).length,
      }))
      .filter((t) => t.id === "all" || t.count > 0);
    const active = savedTabs.some((t) => t.id === savedTab) ? savedTab : "all";
    const visible = active === "all" ? savedItems : grouped.filter((g) => g.group === active).map((g) => g.item);

    const navSection = (s: string) => {
      if (s === "home") goHome();
      else if (s === "search") goSearch();
      else if (s === "advisor") navigate("/advisor");
      else if (s === "settings") navigate("/settings");
      // "saved" → already here, no-op
    };

    return (
      <SavedPage
        items={visible.map((i) => mapSignal(i, true))}
        tabs={savedTabs}
        activeTab={active}
        bookmarkCount={bookmarks.length}
        onNavigate={navSection}
        onSelectTab={setSavedTab}
        onOpenSignal={(id) => track("opened", { feed_item_id: id })}
        onToggleSave={toggleBookmark}
        onBrowse={goHome}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
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
