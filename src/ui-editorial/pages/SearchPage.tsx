import { ArrowUpRight, Clock, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import type { EdStory } from "../types";
import { SearchInput } from "../components/SearchInput";
import { SearchResultRow } from "../components/SearchResultRow";
import { SectionHeading } from "../components/SectionHeading";
import { SkeletonList } from "../components/Skeletons";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Stagger, Swap, itemV } from "../motion";

export interface RecentSearch { term: string; whenLabel: string }
export interface TrendingTopic { term: string; meta?: string }

export type SearchState = "idle" | "loading" | "ready" | "empty" | "error";

export interface SearchPageProps {
  query: string;
  state: SearchState;
  suggestions: string[];
  trending: TrendingTopic[];
  recent: RecentSearch[];
  results: EdStory[];
  related: string[];
  onQueryChange: (q: string) => void;
  onSubmit: (q: string) => void;
  onPickTerm: (term: string) => void;
  onRemoveRecent: (term: string) => void;
  onClearRecent: () => void;
  onOpenStory: (story: EdStory) => void;
  onAskSignal: (query: string) => void;
  onRetry: () => void;
}

/** SEARCH = find. The field is the page: no headline, no hero. Idle state is
 *  quiet lists; results are dense and scannable. */
export function SearchPage(p: SearchPageProps) {
  const q = p.query.trim();
  const idle = p.state === "idle";

  return (
    <div className="pt-6 lg:pt-10">
      <h1 className="sr-only">Search</h1>
      <SearchInput value={p.query} onChange={p.onQueryChange} onSubmit={p.onSubmit} className="lg:h-16" />

      <Swap id={p.state}>
      {idle && (
        <div className="mt-8 lg:grid lg:grid-cols-12 lg:gap-14">
          <div className="lg:col-span-7">
            {p.suggestions.length > 0 && (
              <section aria-labelledby="try-searching">
                <h2 id="try-searching" className="ed-eyebrow">Try searching</h2>
                <Stagger className="mt-3 flex flex-wrap gap-x-5 gap-y-1">
                  {p.suggestions.map((s) => (
                    <motion.li key={s} variants={itemV}>
                      <button
                        type="button"
                        onClick={() => p.onPickTerm(s)}
                        className="inline-flex min-h-11 items-center gap-1 border-b border-ed-border-strong text-[16px] text-ed-text transition-colors hover:border-ed-accent"
                      >
                        {s}
                      </button>
                    </motion.li>
                  ))}
                </Stagger>
              </section>
            )}

            {p.trending.length > 0 && (
              <section aria-labelledby="trending" className="mt-10">
                <SectionHeading id="trending" variant="title" title="Trending now" />
                <Stagger as="ol" delay={0.1} className="mt-3 border-t border-ed-text">
                  {p.trending.map((t, i) => (
                    <motion.li key={t.term} variants={itemV} className="border-b border-ed-border">
                      <button
                        type="button"
                        onClick={() => p.onPickTerm(t.term)}
                        className="group flex min-h-[56px] w-full items-center gap-4 py-3 text-left"
                      >
                        <span className="ed-serif ed-numeral w-7 shrink-0 text-[20px] text-ed-text-3">{String(i + 1).padStart(2, "0")}</span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[17px] font-semibold tracking-[-0.01em] text-ed-text group-hover:underline group-hover:decoration-ed-text/40 group-hover:underline-offset-4">{t.term}</span>
                          {t.meta && <span className="mt-0.5 block text-[12.5px] text-ed-text-2">{t.meta}</span>}
                        </span>
                        <ArrowUpRight className="h-4 w-4 shrink-0 text-ed-text-3 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" aria-hidden="true" />
                      </button>
                    </motion.li>
                  ))}
                </Stagger>
              </section>
            )}
          </div>

          <section aria-labelledby="recent" className="mt-10 lg:col-span-5 lg:mt-0">
            <SectionHeading
              id="recent"
              title="Recent searches"
              aside={p.recent.length > 0 ? (
                <button type="button" onClick={p.onClearRecent} className="-mr-2 inline-flex min-h-11 items-center px-2 text-[12.5px] font-medium text-ed-text-2 underline-offset-4 hover:text-ed-text hover:underline">
                  Clear all
                </button>
              ) : undefined}
            />
            {p.recent.length === 0 ? (
              <p className="mt-3 border-t border-ed-border pt-4 text-[15px] leading-relaxed text-ed-text-2">
                Your searches will show up here, only on this device.
              </p>
            ) : (
              <Stagger delay={0.1} className="mt-2 border-t border-ed-text">
                <AnimatePresence>
                {p.recent.map((r) => (
                  <motion.li key={r.term} layout="position" variants={itemV} exit="exit" className="flex items-center border-b border-ed-border">
                    <button
                      type="button"
                      onClick={() => p.onPickTerm(r.term)}
                      className="flex min-h-[52px] min-w-0 flex-1 items-center gap-3 py-2 text-left"
                    >
                      <Clock className="h-4 w-4 shrink-0 text-ed-text-3" aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate text-[16px] text-ed-text">{r.term}</span>
                      <span className="shrink-0 text-[12.5px] text-ed-text-2">{r.whenLabel}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => p.onRemoveRecent(r.term)}
                      aria-label={`Remove “${r.term}” from recent searches`}
                      className="-mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ed-text-3 transition-colors hover:bg-ed-sunken hover:text-ed-text"
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </motion.li>
                ))}
                </AnimatePresence>
              </Stagger>
            )}
          </section>
        </div>
      )}

      {p.state === "loading" && (
        <div className="mt-8">
          <p className="sr-only" role="status">Searching…</p>
          <SkeletonList count={6} thumb />
        </div>
      )}

      {p.state === "error" && (
        <ErrorState title="Search didn’t go through." body="Check your connection and try again." onRetry={p.onRetry} />
      )}

      {p.state === "empty" && (
        <EmptyState
          title={`No stories found for “${q}”.`}
          body="Try a broader term, a company name or a technology. Or ask Signal what it knows."
          actionLabel="Ask Signal about this"
          onAction={() => p.onAskSignal(q)}
        />
      )}

      {p.state === "ready" && (
        <section aria-labelledby="results" className="mt-8">
          <div className="flex items-baseline justify-between gap-4">
            <h2 id="results" className="text-[13.5px] text-ed-text-2" aria-live="polite">
              <span className="font-semibold text-ed-text">{p.results.length}</span> {p.results.length === 1 ? "story" : "stories"} for “{q}”
            </h2>
            <button
              type="button"
              onClick={() => p.onAskSignal(q)}
              className="-mr-2 inline-flex min-h-11 items-center px-2 text-[13.5px] font-semibold text-ed-accent-ink underline decoration-ed-accent/40 underline-offset-4 hover:decoration-ed-accent"
            >
              Ask Signal about this
            </button>
          </div>

          {p.related.length > 0 && (
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="ed-eyebrow">Related</span>
              {p.related.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => p.onPickTerm(r)}
                  className="inline-flex min-h-11 items-center border-b border-ed-border-strong text-[14.5px] text-ed-text transition-colors hover:border-ed-accent"
                >
                  {r}
                </button>
              ))}
            </div>
          )}

          <Stagger className="mt-2 border-t border-ed-text lg:grid lg:grid-cols-2 lg:gap-x-14">
            {p.results.map((s) => (
              <SearchResultRow key={s.id} story={s} onOpen={p.onOpenStory} />
            ))}
          </Stagger>
        </section>
      )}
      </Swap>
    </div>
  );
}
