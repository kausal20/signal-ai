import { useCallback, useMemo, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { HOME_CATEGORIES, type HomeCategoryId } from "@/lib/categories";
import type { ArticleContext } from "@/lib/askSignal";
import { useFeed } from "@/app/FeedProvider";
import { useStoryImages } from "@/hooks/useStoryImages";
import { buildBriefing } from "@/adapters/briefing";
import { dateLabel, greetingFor, mapStory } from "@/adapters/editorial";
import { HomePage } from "@/ui-editorial/pages/HomePage";
import type { EdStory } from "@/ui-editorial/types";
import { articleContextFor, firstName, updatedLabel } from "./shared";

const LATEST_CAP = 40;

/** `/` — also the landing target of the legacy `?section=` and `openAsk` links,
 *  which are forwarded to their new routes so old entry points keep working. */
export default function HomeRoute() {
  const { search, state } = useLocation();
  const legacy = state as { openAsk?: boolean; article?: ArticleContext } | null;
  if (legacy?.openAsk) return <Navigate to="/signal" state={{ article: legacy.article }} replace />;
  const section = new URLSearchParams(search).get("section");
  if (section === "search") return <Navigate to="/search" replace />;
  if (section === "saved") return <Navigate to="/saved" replace />;
  return <HomeView />;
}

function HomeView() {
  const navigate = useNavigate();
  const feed = useFeed();
  const [topic, setTopic] = useState<HomeCategoryId>("all");
  const [refreshing, setRefreshing] = useState(false);

  const advisorId = (feed.advisor as any)?.best_opportunity_today?.id as string | undefined;
  const briefing = useMemo(
    () => buildBriefing({ items: feed.items, bookmarks: feed.bookmarks, topic, preferredHeroId: advisorId }),
    [feed.items, feed.bookmarks, topic, advisorId],
  );
  const latest = useMemo(() => briefing.latest.slice(0, LATEST_CAP), [briefing.latest]);

  const getImage = useStoryImages([
    briefing.hero?.url,
    ...briefing.today.map((i) => i.url),
    ...latest.map((i) => i.url),
    ...briefing.catchUp.map((i) => i.url),
  ]);

  const toStory = useCallback((it: (typeof feed.items)[number]): EdStory =>
    mapStory(it, { saved: feed.isSaved(it.id), read: feed.readIds.includes(it.id), image: getImage(it.url) }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [feed.isSaved, feed.readIds, getImage]);

  const loading = feed.status.loading && feed.items.length === 0;
  const failed = !feed.status.loading && feed.items.length === 0 && !!feed.status.error;
  const state = loading ? "loading" : failed ? "error" : !briefing.hero ? "empty" : "ready";

  const refresh = async () => {
    setRefreshing(true);
    try { await feed.refresh(); } finally { setRefreshing(false); }
  };

  const askAbout = (story: EdStory) => {
    const item = feed.items.find((i) => i.id === story.id);
    if (!item) return;
    feed.markRead(item.id);
    navigate("/signal", { state: { article: { ...articleContextFor(item, story.image), publisher: story.source } } });
  };

  return (
    <HomePage
      state={state}
      greeting={greetingFor()}
      name={firstName()}
      dateLabel={dateLabel()}
      updatedLabel={updatedLabel(feed.status.lastFetchAt)}
      refreshing={refreshing}
      topics={HOME_CATEGORIES}
      activeTopic={topic}
      topStory={briefing.hero ? toStory(briefing.hero) : undefined}
      today={briefing.today.map(toStory)}
      latest={latest.map(toStory)}
      catchUp={briefing.catchUp.map(toStory)}
      onSelectTopic={(id) => setTopic(id as HomeCategoryId)}
      onOpenAI={(question) => { if (question.trim()) navigate("/signal", { state: { seed: question.trim() } }); }}
      onAskAbout={askAbout}
      onOpenStory={(s) => feed.markRead(s.id)}
      onToggleSave={(s) => feed.toggleSave(s.id)}
      onRefresh={refresh}
      onRetry={refresh}
    />
  );
}
