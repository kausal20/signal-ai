// signal-ui-v2 · components/FeedCard.tsx
import { Bookmark, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "../icons/BrandLogo";
import { SignalBadge } from "./SignalBadge";
import type { Signal } from "../shared/types";

interface Props {
  signal: Signal;
  onOpen?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  className?: string;
}

/**
 * Quiet feed card: source · headline · one-line takeaway. Intentionally low
 * chrome so the eye flows down the feed. All data via the `signal` prop.
 */
export function FeedCard({ signal, onOpen, onToggleSave, className }: Props) {
  const { id, title, source, sourceKey, tag, timeAgo, takeaway, critical, saved } = signal;

  return (
    <article
      onClick={() => onOpen?.(id)}
      className={cn(
        "cursor-pointer rounded-[18px] border border-white/[0.06] bg-white/[0.028] p-4 transition-all hover:bg-white/[0.05] active:scale-[0.985]",
        className
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono-tight text-[9px] font-bold uppercase tracking-[0.12em] text-green">
          {sourceKey && <BrandLogo source={sourceKey} name={source} size={13} />}
          {source}
        </span>
        {tag && (
          <>
            <span className="h-[2.5px] w-[2.5px] rounded-full bg-white/25" />
            <span className="text-[9px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{tag}</span>
          </>
        )}
        {timeAgo && (
          <>
            <span className="h-[2.5px] w-[2.5px] rounded-full bg-white/25" />
            <span className="text-[9px] font-semibold text-muted-foreground">{timeAgo}</span>
          </>
        )}
        {critical && <SignalBadge tone="amber" className="ml-1">Critical</SignalBadge>}
        <button
          type="button"
          aria-label={saved ? "Remove bookmark" : "Save signal"}
          onClick={(e) => { e.stopPropagation(); onToggleSave?.(id); }}
          className={cn(
            "ml-auto flex h-7 w-7 items-center justify-center rounded-lg transition-all active:scale-90",
            saved ? "text-green" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-current animate-bookmark")} />
        </button>
      </div>

      <h3 className="mb-1.5 text-[15.5px] font-bold leading-snug tracking-[-0.01em] text-foreground">{title}</h3>

      {takeaway && (
        <div className="flex items-start gap-1.5">
          <Star className="mt-0.5 h-3 w-3 shrink-0 text-green" />
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">{takeaway}</span>
        </div>
      )}
    </article>
  );
}
