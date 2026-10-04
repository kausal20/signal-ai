import { forwardRef, memo, useState } from "react";
import { motion } from "framer-motion";
import { useRowMotion } from "../motion";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/adapters/homeV2";
import type { EdStory } from "../types";
import { StoryImage } from "./StoryImage";
import { RowMenu } from "./controls";
import { SourceIdentity } from "./SourceIdentity";

interface Props {
  story: EdStory;
  onOpen: (story: EdStory) => void;
  onRemove: (story: EdStory) => void;
  onAsk: (story: EdStory) => void;
}

/** A library entry: small recognisable thumbnail (when real), headline, source,
 *  when it was saved (only if we actually recorded it), overflow menu. */
// forwardRef: AnimatePresence(popLayout) measures the leaving row.
export const SavedStoryRow = memo(forwardRef<HTMLLIElement, Props>(function SavedStoryRow({ story, onOpen, onRemove, onAsk }, ref) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const rowMotion = useRowMotion();
  const thumb = story.image && !thumbFailed ? story.image : undefined;
  const when = story.savedAt ? `Saved ${formatTimeAgo(story.savedAt)}` : story.timeAgo;
  return (
    <motion.li ref={ref} layout="position" {...rowMotion} exit="exit" className="border-b border-ed-border">
      <article className="flex items-center gap-4 py-3.5">
        {thumb && (
          <StoryImage src={thumb} aspect="aspect-square" onFail={() => setThumbFailed(true)} className="h-14 w-14 shrink-0 rounded-md" />
        )}
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-[15.5px] font-semibold leading-[1.35] tracking-[-0.01em] line-clamp-2", story.read ? "text-ed-text-2" : "text-ed-text")}>
            {story.url ? (
              <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(story)} className="decoration-ed-text/40 underline-offset-4 hover:underline">
                {story.title}
              </a>
            ) : story.title}
          </h3>
          <p className="mt-1 text-[12.5px] leading-snug text-ed-text-2">
            <SourceIdentity story={story} className="font-medium text-ed-text" />
            {story.kicker && <><span aria-hidden="true"> · </span>{story.kicker}</>}
            {when && <><span aria-hidden="true"> · </span>{when}</>}
          </p>
        </div>
        <RowMenu
          label={`More options for “${story.title}”`}
          className="-mr-2 shrink-0"
          items={[
            { label: "Ask Signal about this", onSelect: () => onAsk(story) },
            { label: "Remove from Saved", onSelect: () => onRemove(story), danger: true },
          ]}
        />
      </article>
    </motion.li>
  );
}));
