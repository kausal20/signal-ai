import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface Props {
  title: string;
  /** "label" = small uppercase section label · "title" = serif section title. */
  variant?: "label" | "title";
  /** Right-aligned quiet text or action (a date, a count, a link). */
  aside?: ReactNode;
  as?: "h2" | "h3";
  className?: string;
  id?: string;
}

/** Section headings carry hierarchy through type, not boxes or colour. */
export function SectionHeading({ title, variant = "label", aside, as: Tag = "h2", className, id }: Props) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4", className)}>
      <Tag
        id={id}
        className={cn(
          variant === "label"
            ? "ed-eyebrow !text-ed-text"
            : "ed-serif text-[24px] font-semibold leading-tight tracking-[-0.01em] text-ed-text",
        )}
      >
        {title}
      </Tag>
      {aside && <div className="shrink-0 text-[12.5px] text-ed-text-2">{aside}</div>}
    </div>
  );
}
