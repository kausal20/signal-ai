import { memo, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EdStory } from "../types";
import { StoryImage } from "./StoryImage";
import { SourceLine } from "./SourceLine";
import { SaveButton } from "./controls";
import { SignalGlyph } from "./SignalMark";

interface Props {
  story: EdStory;
  onOpen: (story: EdStory) => void;
  onToggleSave: (story: EdStory) => void;
  onAsk: (story: EdStory) => void;
  /** First screen: load the image eagerly. */
  priority?: boolean;
  className?: string;
}

function headlineSize(title: string): string {
  if (title.length > 110) return "text-[26px] md:text-[30px] lg:text-[32px]";
  if (title.length > 75) return "text-[28px] md:text-[34px] lg:text-[38px]";
  return "text-[30px] md:text-[38px] lg:text-[44px]";
}

/** The page's one dominant story. Magazine-feature composition: real image when
 *  we have one (with credit), otherwise a typographic opening under a rule —
 *  never a placeholder graphic. */
export const EditorialStory = memo(function EditorialStory({ story, onOpen, onToggleSave, onAsk, priority, className }: Props) {
  const [imageFailed, setImageFailed] = useState(false);
  const hasImage = !!story.image && !imageFailed;
  const open = () => onOpen(story);

  return (
    <article className={cn("group", className)}>
      {hasImage ? (
        <figure>
          <StoryImage src={story.image!} aspect="aspect-[16/10]" priority={priority} onFail={() => setImageFailed(true)} className="rounded-xl" />
          {story.imageCredit && <figcaption className="mt-2 text-[11.5px] leading-snug text-ed-text-2">Image: {story.imageCredit}</figcaption>}
        </figure>
      ) : (
        <div aria-hidden="true" className="h-[3px] w-full bg-ed-text" />
      )}

      <div className={hasImage ? "mt-5" : "mt-4"}>
        {story.kicker && <p className="ed-eyebrow">{story.kicker}</p>}

        <h2 className={cn("ed-serif mt-2.5 font-semibold leading-[1.12] tracking-[-0.02em] text-ed-text [text-wrap:balance]", headlineSize(story.title))}>
          {story.url ? (
            <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={open} className="decoration-ed-text/40 decoration-1 underline-offset-[6px] hover:underline">
              {story.title}
            </a>
          ) : story.title}
        </h2>

        {story.deck && <p className="mt-3.5 max-w-[62ch] text-[16.5px] leading-[1.55] text-ed-text-2 line-clamp-3">{story.deck}</p>}

        <SourceLine story={story} showKicker={false} className="mt-4" />

        <div className="-ml-2.5 mt-2 flex items-center gap-0.5">
          {story.url && (
            <a
              href={story.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={open}
              className="group/read inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[14.5px] font-semibold text-ed-accent-ink transition-colors hover:bg-ed-accent-soft"
            >
              Read{story.domain ? ` at ${story.domain.replace(/^www\./, "")}` : ""}
              <ArrowUpRight className="h-4 w-4 transition-transform duration-200 ease-out group-hover/read:-translate-y-0.5 group-hover/read:translate-x-0.5 motion-reduce:transition-none" aria-hidden="true" />
            </a>
          )}
          <button
            type="button"
            onClick={() => onAsk(story)}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-[14.5px] font-medium text-ed-text-2 transition-colors hover:bg-ed-sunken hover:text-ed-text"
          >
            <SignalGlyph className="h-4 w-4 text-ed-accent" strokeWidth={2.2} />
            Ask Signal
          </button>
          <SaveButton saved={story.saved} onToggle={() => onToggleSave(story)} title={story.title} className="ml-auto" />
        </div>
      </div>
    </article>
  );
});
