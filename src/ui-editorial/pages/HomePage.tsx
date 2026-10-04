import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { RefreshCw } from "lucide-react";
import type { EdLoadState, EdStory, EdTopic } from "../types";
import { SignalAIEntry } from "../components/SignalAIEntry";
import { TopicSelector } from "../components/TopicSelector";
import { StoryRow } from "../components/StoryRow";
import { TodayBrief } from "../components/TodayBrief";
import { SectionHeading } from "../components/SectionHeading";
import { HomeSkeleton } from "../components/Skeletons";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { Stagger, Swap, press, revealV } from "../motion";

export interface HomePageProps {
  state: EdLoadState;
  greeting: string;
  name?: string;
  dateLabel: string;
  updatedLabel?: string;
  refreshing?: boolean;
  topics: EdTopic[];
  activeTopic: string;
  topStory?: EdStory;
  today: EdStory[];
  latest: EdStory[];
  catchUp: EdStory[];
  onSelectTopic: (id: string) => void;
  onOpenAI: (question: string) => void;
  onAskAbout: (story: EdStory) => void;
  onOpenStory: (story: EdStory) => void;
  onToggleSave: (story: EdStory) => void;
  onRefresh: () => void;
  onRetry: () => void;
}

const LATEST_STEP = 8;

/** HOME = consume intelligence. Calm, editorial, curated: one dominant story,
 *  a short numbered briefing, then a quiet chronological list. */
export function HomePage(p: HomePageProps) {
  const [shown, setShown] = useState(LATEST_STEP);
  useEffect(() => setShown(LATEST_STEP), [p.activeTopic]);
  const latest = p.latest.slice(0, shown);

  return (
    <div className="pt-5 lg:pt-10">
      {/* Masthead settles in line by line. */}
      <Stagger as="div">
      <motion.div variants={revealV} className="flex items-center justify-between gap-4">
        <p className="ed-eyebrow">{p.dateLabel}</p>
        <button
          type="button"
          onClick={p.onRefresh}
          disabled={p.refreshing}
          aria-label="Refresh stories"
          className="-mr-2.5 flex h-11 items-center gap-2 rounded-lg px-2.5 text-[12.5px] text-ed-text-2 transition-colors hover:bg-ed-sunken hover:text-ed-text disabled:opacity-60"
        >
          {p.updatedLabel && <span aria-live="polite">{p.refreshing ? "Updating…" : p.updatedLabel}</span>}
          <RefreshCw className={p.refreshing ? "h-4 w-4 animate-spin" : "h-4 w-4"} aria-hidden="true" />
        </button>
      </motion.div>

      <motion.h1 variants={revealV} className="ed-serif mt-1 text-[34px] font-semibold leading-[1.05] tracking-[-0.025em] text-ed-text md:text-[46px] lg:text-[52px]">
        {p.greeting}{p.name ? `, ${p.name}` : ""}
      </motion.h1>
      <motion.p variants={revealV} className="mt-3 max-w-[48ch] text-[17px] leading-relaxed text-ed-text-2">Here are the stories worth knowing today.</motion.p>

      <motion.div variants={revealV}>
        <SignalAIEntry onOpen={p.onOpenAI} className="mt-7 max-w-[680px]" />
      </motion.div>

      <motion.div variants={revealV}>
        <TopicSelector topics={p.topics} active={p.activeTopic} onSelect={p.onSelectTopic} label="Story topics" className="mt-7" />
      </motion.div>
      </Stagger>

      {/* Loading → content → empty/error, and topic changes, crossfade. */}
      <Swap id={`${p.state}:${p.activeTopic}`}>

      {p.state === "loading" && <HomeSkeleton />}

      {p.state === "error" && (
        <ErrorState title="Couldn’t load today’s stories." body="Check your connection and try again." onRetry={p.onRetry} />
      )}

      {p.state === "empty" && (
        <EmptyState
          title={p.activeTopic === "all" ? "Nothing new right now." : "Nothing in this topic yet."}
          body={p.activeTopic === "all" ? "New stories arrive throughout the day — check back soon." : "Signal hasn’t seen recent coverage here. Try another topic or look at everything."}
          actionLabel={p.activeTopic === "all" ? undefined : "Show all stories"}
          onAction={p.activeTopic === "all" ? undefined : () => p.onSelectTopic("all")}
        />
      )}

      {p.state === "ready" && p.topStory && (
        <>
          <TodayBrief
            key={p.activeTopic}
            stories={[p.topStory, ...p.today].filter((story, index, stories) => stories.findIndex((item) => item.id === story.id) === index).slice(0, 5)}
            onOpen={p.onOpenStory}
            onAsk={p.onAskAbout}
            onToggleSave={p.onToggleSave}
          />
          <div className="mt-10">
            {p.today.length > 0 && (
              <section aria-labelledby="todays-signal">
                <SectionHeading id="todays-signal" title="Today’s Signal" aside={`${p.today.length} to know`} />
                <Stagger as="ol" delay={0.12} className="mt-3 border-t border-ed-text">
                  {p.today.map((s, i) => (
                    <StoryRow key={s.id} story={s} index={i + 1} onOpen={p.onOpenStory} onToggleSave={p.onToggleSave} onAsk={p.onAskAbout} />
                  ))}
                </Stagger>
              </section>
            )}
          </div>

          {latest.length > 0 && (
            <section aria-labelledby="latest" className="mt-16">
              <SectionHeading id="latest" variant="title" title="Latest" />
              <Stagger className="mt-4 border-t border-ed-text lg:grid lg:grid-cols-2 lg:gap-x-14">
                {latest.map((s) => (
                  <StoryRow key={s.id} story={s} showThumb onOpen={p.onOpenStory} onToggleSave={p.onToggleSave} />
                ))}
              </Stagger>
              {p.latest.length > shown && (
                <motion.button
                  {...press}
                  type="button"
                  onClick={() => setShown((n) => n + LATEST_STEP)}
                  className="mt-6 inline-flex h-11 items-center rounded-lg border border-ed-border-strong bg-ed-surface px-5 text-[14.5px] font-semibold text-ed-text transition-colors hover:border-ed-text-3 active:bg-ed-sunken"
                >
                  Show more stories
                </motion.button>
              )}
            </section>
          )}

          {p.catchUp.length > 0 && (
            <section aria-labelledby="catch-up" className="mt-16">
              <SectionHeading id="catch-up" variant="title" title="Worth catching up on" aside="From the last few days" />
              <Stagger className="mt-4 border-t border-ed-text lg:grid lg:grid-cols-2 lg:gap-x-14">
                {p.catchUp.map((s) => (
                  <StoryRow key={s.id} story={s} onOpen={p.onOpenStory} onToggleSave={p.onToggleSave} />
                ))}
              </Stagger>
            </section>
          )}

          <p className="mt-16 text-[15px] text-ed-text-2">That’s the briefing for now. New stories will appear here as they’re published.</p>
        </>
      )}
      </Swap>
    </div>
  );
}
