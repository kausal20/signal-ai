import { Fragment, type ReactNode } from "react";
import { BadgeCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { EdStory } from "../types";
import { SourceIdentity } from "./SourceIdentity";

interface Props {
  story: Pick<EdStory, "source" | "kicker" | "timeAgo" | "official" | "url" | "domain">;
  showKicker?: boolean;
  className?: string;
}

/** "Official · TechCrunch · Models · 3h ago" — honest provenance on one line.
 *  Metadata uses text-2 (AA contrast); "Official" is the only accent here.
 *  Separators trail each item, so a wrapped line never starts with a dot. */
export function SourceLine({ story, showKicker = true, className }: Props) {
  const items: ReactNode[] = [];
  if (story.official) {
    items.push(
      <span className="inline-flex items-center gap-1 align-middle font-semibold text-ed-accent-ink">
        <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" />
        Official
      </span>,
    );
  }
  items.push(<SourceIdentity story={story} className="font-medium text-ed-text" />);
  if (showKicker && story.kicker) items.push(story.kicker);
  if (story.timeAgo) items.push(story.timeAgo);

  return (
    <p className={cn("text-[12.5px] leading-[1.6] text-ed-text-2", className)}>
      {items.map((node, i) => (
        <Fragment key={i}>
          <span className={cn("whitespace-nowrap", i < items.length - 1 && "after:mx-1.5 after:text-ed-text-3 after:content-['·']")}>{node}</span>
          {i < items.length - 1 ? " " : null}
        </Fragment>
      ))}
    </p>
  );
}
