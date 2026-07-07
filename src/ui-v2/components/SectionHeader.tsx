// signal-ui-v2 · components/SectionHeader.tsx
// ---------------------------------------------------------------------------
// Improved typography hierarchy: medium-weight section titles (not tiny
// uppercase everywhere), readable subtitles, and optional right-aligned action.
// ---------------------------------------------------------------------------
import { cn } from "@/lib/utils";

interface Props {
  /** Section title, e.g. "Trending Today". Rendered in sentence case. */
  title: string;
  /** Optional right-aligned adornment (e.g. a live indicator or action). */
  action?: React.ReactNode;
  /** Optional supporting line under the title. */
  description?: string;
  className?: string;
}

/** Section header with clear visual hierarchy — title is prominent, not tiny. */
export function SectionHeader({ title, action, description, className }: Props) {
  return (
    <div className={cn("mb-4", className)}>
      <div className="flex items-center justify-between">
        <h2 className="text-[16px] font-bold tracking-[-0.01em] text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {description && (
        <p className="mt-1 text-[13px] leading-relaxed text-muted-foreground">{description}</p>
      )}
    </div>
  );
}
