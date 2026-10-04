import { memo, useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ArrowUpRight, ChevronDown } from "lucide-react";
import { settle, useRowMotion } from "../motion";
import { cn } from "@/lib/utils";
import type { EdStory } from "../types";
import { SourceLine } from "./SourceLine";
import { StoryImage } from "./StoryImage";
import { SaveButton } from "./controls";
import { SignalGlyph } from "./SignalMark";

interface Props {
  story: EdStory;
  /** 1-based position → renders a serif numeral (Today's Signal). */
  index?: number;
  /** Small thumbnail on the right when we have a real image. */
  showThumb?: boolean;
  onOpen: (story: EdStory) => void;
  onToggleSave: (story: EdStory) => void;
  onAsk?: (story: EdStory) => void;
}

/** Compact editorial list row. Type carries the hierarchy: serif headline,
 *  quiet metadata, hairline divider. Used inside an <ol>/<ul>. */
export const StoryRow = memo(function StoryRow({ story, index, showThumb = false, onOpen, onToggleSave, onAsk }: Props) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const summaryId = useId();
  const reduce = useReducedMotion();
  const rowMotion = useRowMotion();
  const thumb = showThumb && story.image && !thumbFailed ? story.image : undefined;

  return (
    <motion.li {...rowMotion} className="border-b border-ed-border">
      <article className="flex items-start gap-4 py-[18px]">
        {index != null && (
          <span aria-hidden="true" className="ed-serif ed-numeral w-8 shrink-0 pt-px text-[22px] font-medium leading-none text-ed-text-3">
            {String(index).padStart(2, "0")}
          </span>
        )}

        <div className="min-w-0 flex-1">
          <h3 className={cn("ed-serif text-[19px] font-medium leading-[1.28] tracking-[-0.005em] [text-wrap:pretty]", story.read ? "text-ed-text-2" : "text-ed-text")}>
            {onAsk ? (
              <button type="button" aria-expanded={expanded} aria-controls={summaryId} onClick={() => setExpanded((value) => !value)} className="flex min-h-11 w-full items-start gap-2 text-left">
                <span className="flex-1">{story.title}</span>
                <motion.span initial={false} animate={{ rotate: expanded ? 180 : 0 }} transition={reduce ? { duration: 0 } : settle} className="mt-1 flex shrink-0 text-ed-text-3">
                  <ChevronDown className="h-4 w-4" aria-hidden="true" />
                </motion.span>
              </button>
            ) : story.url ? (
              <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(story)} className="decoration-ed-text/40 decoration-1 underline-offset-4 hover:underline">
                {story.title}
              </a>
            ) : story.title}
          </h3>
          <SourceLine story={story} className="mt-2" />
        </div>

        {thumb && (
          <StoryImage
            src={thumb}
            aspect="aspect-square"
            onFail={() => setThumbFailed(true)}
            className="h-[72px] w-[72px] shrink-0 rounded-lg"
          />
        )}
        <SaveButton saved={story.saved} onToggle={() => onToggleSave(story)} title={story.title} className="-mr-2 -mt-1.5" />
      </article>
      {onAsk && (
        <div id={summaryId}>
          <AnimatePresence initial={false}>
            {expanded && (
              <motion.div
                key="summary"
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={reduce ? { duration: 0 } : settle}
                className="overflow-hidden"
              >
                <div className={cn("pb-4", index != null && "pl-12")}>
                  <div className="mb-3 flex items-center gap-2 rounded-lg bg-ed-accent/10 px-3 py-2 text-ed-accent-ink">
                    <SignalGlyph className="h-4 w-4 shrink-0" />
                    <span className="text-[12px] font-semibold tracking-wide">Signal AI Summary</span>
                  </div>
                  <p className="line-clamp-3 text-[14.5px] leading-relaxed text-ed-text-2">
                    {story.deck || "A summary isn’t available for this article yet. Read the source or ask Signal AI for more context."}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-3">
                    {story.url ? (
                      <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(story)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-ed-border-strong px-3 text-[13.5px] font-semibold text-ed-text transition-colors hover:bg-ed-sunken">
                        Source <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                      </a>
                    ) : <span className="text-[13px] text-ed-text-3">Source unavailable</span>}
                    <button type="button" onClick={() => onAsk(story)} className="inline-flex min-h-11 items-center rounded-lg bg-ed-accent-ink px-3 text-[13.5px] font-semibold text-ed-on-accent transition-opacity hover:opacity-90">
                      Signal AI
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.li>
  );
});
