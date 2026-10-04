import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useFeed } from "@/app/FeedProvider";
import { useStoryImages } from "@/hooks/useStoryImages";
import { mapStory } from "@/adapters/editorial";
import { SavedPage, type SavedCollection, type SavedFilter } from "@/ui-editorial/pages/SavedPage";
import type { EdLoadState, EdStory } from "@/ui-editorial/types";
import { articleContextFor } from "./shared";

export default function SavedRoute() {
  const navigate = useNavigate();
  const feed = useFeed();
  const [filter, setFilter] = useState<SavedFilter>("all");
  const [collection, setCollection] = useState<string | undefined>();

  // Newest save first. Saved ids are feed ids, so a story that has aged out of
  // the live feed can't be shown — we count those and say so instead of hiding them.
  const saved = useMemo(() => {
    const byId = new Map(feed.items.map((i) => [i.id, i]));
    const found = [...feed.bookmarks].reverse().map((id) => byId.get(id)).filter((i): i is NonNullable<typeof i> => !!i);
    return { found, missing: feed.bookmarks.length - found.length };
  }, [feed.items, feed.bookmarks]);

  const getImage = useStoryImages(saved.found.map((i) => i.url));
  const stories: EdStory[] = useMemo(
    () => saved.found.map((it) => mapStory(it, {
      saved: true,
      read: feed.readIds.includes(it.id),
      savedAt: feed.savedAt[it.id],
      image: getImage(it.url),
    })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [saved.found, feed.readIds, feed.savedAt, getImage],
  );

  const collections: SavedCollection[] = useMemo(() => {
    const counts = new Map<string, number>();
    for (const s of stories) if (s.kicker) counts.set(s.kicker, (counts.get(s.kicker) ?? 0) + 1);
    return [...counts.entries()].map(([label, count]) => ({ id: label, label, count })).sort((a, b) => b.count - a.count);
  }, [stories]);

  const feedLoading = feed.status.loading && feed.items.length === 0;
  const feedFailed = !feed.status.loading && feed.items.length === 0 && !!feed.status.error;
  const state: EdLoadState =
    feed.bookmarks.length === 0 ? "empty" : feedLoading ? "loading" : feedFailed ? "error" : "ready";

  const ask = (story: EdStory) => {
    const item = feed.items.find((i) => i.id === story.id);
    if (item) navigate("/signal", { state: { article: { ...articleContextFor(item, story.image), publisher: story.source } } });
  };

  return (
    <SavedPage
      state={state}
      stories={stories}
      filter={filter}
      collections={collections}
      activeCollection={collection}
      unavailableCount={saved.missing}
      onFilter={setFilter}
      onSelectCollection={setCollection}
      onOpen={(s) => feed.markRead(s.id)}
      onRemove={(s) => feed.toggleSave(s.id)}
      onAsk={ask}
      onRetry={() => { void feed.refresh(); }}
    />
  );
}
