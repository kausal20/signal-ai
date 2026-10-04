import { memo, useState } from "react";
import { motion } from "framer-motion";
import { useRowMotion } from "../motion";
import { cn } from "@/lib/utils";
import type { EdStory } from "../types";
import { SourceLine } from "./SourceLine";
import { StoryImage } from "./StoryImage";

interface Props {
  story: EdStory;
  onOpen: (story: EdStory) => void;
}

/** Built for scanning: sans headline (denser than the serif list), source ·
 *  category · time, optional small thumbnail. No deck, no card. */
export const SearchResultRow = memo(function SearchResultRow({ story, onOpen }: Props) {
  const [thumbFailed, setThumbFailed] = useState(false);
  const rowMotion = useRowMotion();
  const thumb = story.image && !thumbFailed ? story.image : undefined;
  return (
    <motion.li {...rowMotion} className="border-b border-ed-border">
      <article className="flex items-start gap-4 py-4">
        <div className="min-w-0 flex-1">
          <h3 className={cn("text-[16.5px] font-semibold leading-[1.35] tracking-[-0.01em] [text-wrap:pretty]", story.read ? "text-ed-text-2" : "text-ed-text")}>
            {story.url ? (
              <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(story)} className="decoration-ed-text/40 underline-offset-4 hover:underline">
                {story.title}
              </a>
            ) : story.title}
          </h3>
          <SourceLine story={story} className="mt-1.5" />
        </div>
        {thumb && (
          <StoryImage src={thumb} aspect="aspect-square" onFail={() => setThumbFailed(true)} className="h-14 w-14 shrink-0 rounded-md" />
        )}
      </article>
    </motion.li>
  );
});
