import { ArrowLeft } from "lucide-react";
import { AnimatePresence } from "framer-motion";
import type { EdLoadState, EdStory } from "../types";
import { TopicSelector } from "../components/TopicSelector";
import { SavedStoryRow } from "../components/SavedStoryRow";
import { CollectionRow } from "../components/CollectionRow";
import { SectionHeading } from "../components/SectionHeading";
import { SkeletonList } from "../components/Skeletons";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Reveal, Stagger, Swap } from "../motion";

export type SavedFilter = "all" | "unread" | "collections";
export interface SavedCollection { id: string; label: string; count: number }

export interface SavedPageProps {
  state: EdLoadState;
  /** Everything saved that is still available, newest-saved first. */
  stories: EdStory[];
  filter: SavedFilter;
  collections: SavedCollection[];
  activeCollection?: string;
  /** Saved ids that are no longer in the live feed (can't be shown). */
  unavailableCount: number;
  onFilter: (f: SavedFilter) => void;
  onSelectCollection: (id?: string) => void;
  onOpen: (story: EdStory) => void;
  onRemove: (story: EdStory) => void;
  onAsk: (story: EdStory) => void;
  onRetry: () => void;
}

const FILTERS: { id: SavedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unread", label: "Unread" },
  { id: "collections", label: "Collections" },
];

/** SAVED = organize. A library: a count, a way to slice it, typographic
 *  collection rows, compact entries. Desktop adds a collections rail. */
export function SavedPage(p: SavedPageProps) {
  const total = p.stories.length;
  const active = p.collections.find((c) => c.id === p.activeCollection);

  let visible = p.stories;
  if (p.filter === "unread") visible = visible.filter((s) => !s.read);
  if (active) visible = visible.filter((s) => s.kicker === active.label);

  const showCollectionsMobile = p.filter === "collections" && !active;
  const showListMobile = !showCollectionsMobile;

  return (
    <div className="pt-6 lg:pt-12">
      <h1 className="ed-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.025em] text-ed-text md:text-[44px]">Saved</h1>
      <p className="mt-2 text-[16px] leading-relaxed text-ed-text-2">Your personal knowledge library.</p>
      {p.state === "ready" && total > 0 && (
        <p className="mt-4 text-[13px] text-ed-text-2" aria-live="polite">
          <span className="font-semibold text-ed-text">{total}</span> {total === 1 ? "story" : "stories"}
          {p.collections.length > 0 && <> · <span className="font-semibold text-ed-text">{p.collections.length}</span> {p.collections.length === 1 ? "collection" : "collections"}</>}
        </p>
      )}

      <Swap id={p.state}>
      {p.state === "loading" && <div className="mt-8"><SkeletonList count={5} thumb /></div>}

      {p.state === "error" && <ErrorState title="Couldn’t load your library." onRetry={p.onRetry} />}

      {p.state === "empty" && (
        <EmptyState
          title="Your library is empty."
          body="Save a story with the bookmark icon and it will wait for you here."
          actionLabel="Explore stories"
          actionTo="/"
        />
      )}

      {p.state === "ready" && (
        <>
          <TopicSelector
            topics={FILTERS}
            active={p.filter}
            onSelect={(id) => { p.onFilter(id as SavedFilter); p.onSelectCollection(undefined); }}
            label="Filter saved stories"
            className="mt-5 lg:hidden"
          />

          <div className="mt-6 lg:mt-10 lg:grid lg:grid-cols-12 lg:gap-14">
            {/* Collections: own screen on mobile (Collections filter), a rail on desktop. */}
            <aside
              aria-labelledby="collections"
              className={(showCollectionsMobile ? "block" : "hidden") + " lg:order-2 lg:col-span-4 lg:block"}
            >
              <SectionHeading id="collections" title="Collections" />
              {p.collections.length === 0 ? (
                <p className="mt-3 border-t border-ed-border pt-4 text-[15px] leading-relaxed text-ed-text-2">
                  Collections group what you save by topic. They’ll appear as your library grows.
                </p>
              ) : (
                <Stagger className="mt-2 border-t border-ed-text">
                  {p.collections.map((c) => (
                    <CollectionRow
                      key={c.id}
                      label={c.label}
                      count={c.count}
                      active={c.id === p.activeCollection}
                      onSelect={() => {
                        if (c.id === p.activeCollection) p.onSelectCollection(undefined);
                        else { p.onSelectCollection(c.id); if (p.filter === "collections") p.onFilter("all"); }
                      }}
                    />
                  ))}
                </Stagger>
              )}
            </aside>

            <section
              aria-labelledby="saved-list"
              className={(showListMobile ? "block" : "hidden") + " lg:order-1 lg:col-span-8 lg:block"}
            >
              <div className="flex items-baseline justify-between gap-4">
                <h2 id="saved-list" className="ed-eyebrow !text-ed-text">
                  {active ? active.label : p.filter === "unread" ? "Unread" : "Recently saved"}
                </h2>
                <div className="hidden items-center gap-1 lg:flex" role="group" aria-label="Filter saved stories">
                  {(["all", "unread"] as const).map((f) => (
                    <button
                      key={f}
                      type="button"
                      aria-pressed={p.filter === f}
                      onClick={() => p.onFilter(f)}
                      className={"inline-flex h-9 items-center rounded-md px-3 text-[13.5px] transition-colors " + (p.filter === f ? "bg-ed-sunken font-semibold text-ed-text" : "font-medium text-ed-text-2 hover:text-ed-text")}
                    >
                      {f === "all" ? "All" : "Unread"}
                    </button>
                  ))}
                </div>
              </div>

              {active && (
                <button
                  type="button"
                  onClick={() => p.onSelectCollection(undefined)}
                  className="-ml-1 mt-1 inline-flex min-h-11 items-center gap-1.5 px-1 text-[13.5px] font-medium text-ed-text-2 transition-colors hover:text-ed-text"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All saved stories
                </button>
              )}

              {visible.length === 0 ? (
                <EmptyState
                  className="!py-10"
                  title={p.filter === "unread" ? "Nothing unread." : "Nothing here yet."}
                  body={p.filter === "unread" ? "You’ve opened everything you saved." : "Stories you save in this topic will appear here."}
                />
              ) : (
                <Stagger key={`${p.filter}:${p.activeCollection ?? ""}`} className="mt-2 border-t border-ed-text">
                  {/* Removing a story slides it away and closes the gap. */}
                  <AnimatePresence mode="popLayout">
                    {visible.map((s) => (
                      <SavedStoryRow key={s.id} story={s} onOpen={p.onOpen} onRemove={p.onRemove} onAsk={p.onAsk} />
                    ))}
                  </AnimatePresence>
                </Stagger>
              )}

              {p.unavailableCount > 0 && (
                <Reveal as="p" delay={0.2} className="mt-6 text-[13px] leading-relaxed text-ed-text-2">
                  {p.unavailableCount} older saved {p.unavailableCount === 1 ? "story is" : "stories are"} no longer in the live feed, so {p.unavailableCount === 1 ? "it" : "they"} can’t be shown here.
                </Reveal>
              )}
            </section>
          </div>
        </>
      )}
      </Swap>
    </div>
  );
}
