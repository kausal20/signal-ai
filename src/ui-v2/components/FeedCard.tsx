// signal-ui-v2 · components/FeedCard.tsx
// ---------------------------------------------------------------------------
// Quiet feed card with premium motion: hover lift + border glow, enhanced
// bookmark animation with rotate + glow + haptic, spring press feedback.
// ---------------------------------------------------------------------------
import { useCallback } from "react";
import { Bookmark, Star, Globe } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BrandLogo } from "../icons/BrandLogo";

import { isSafeUrl, openOriginal } from "./SourceAttribution";
import { motionTokens, haptic } from "../animations/motion";
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
  const { id, title, source, sourceKey, tag, timeAgo, takeaway, saved, url } = signal;
  const reduce = useReducedMotion();

  const handleSave = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      haptic(10);
      onToggleSave?.(id);
    },
    [id, onToggleSave]
  );

  return (
    <fm.article
      onClick={() => onOpen?.(id)}
      whileHover={
        reduce
          ? undefined
          : {
              y: -3,
              scale: 1.01,
              transition: motionTokens.spring.card,
            }
      }
      whileTap={
        reduce
          ? undefined
          : {
              scale: 0.985,
              transition: motionTokens.spring.press,
            }
      }
      className={cn(
        "cursor-pointer rounded-[18px] border border-white/[0.06] bg-white/[0.028] p-4",
        "transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
        "hover:border-green/[0.15] hover:bg-white/[0.05] hover:shadow-[0_8px_32px_-8px_hsl(0_0%_0%/0.5),0_0_0_1px_hsl(152_72%_48%/0.06)]",
        className
      )}
    >
      <div className="mb-2.5 flex items-center gap-2">
        <span className="flex items-center gap-1.5 font-mono-tight text-[9px] font-bold uppercase tracking-[0.12em] text-green">
          {sourceKey && <BrandLogo source={sourceKey} name={source} size={13} />}
          {source}
        </span>
        {isSafeUrl(url) && (
          <>
            <span className="h-[2.5px] w-[2.5px] rounded-full bg-white/25" />
            <fm.button
              type="button"
              aria-label={`Open original source at ${source} (new tab)`}
              onClick={(e) => { e.stopPropagation(); openOriginal(url); }}
              whileTap={reduce ? undefined : { scale: 0.9 }}
              className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 font-mono-tight text-[9px] font-bold uppercase tracking-[0.08em] text-green/80 transition-colors hover:bg-green/[0.12] hover:text-green"
            >
              Source
              <Globe className="h-3 w-3" />
            </fm.button>
          </>
        )}
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
        
        <fm.button
          type="button"
          aria-label={saved ? "Remove bookmark" : "Save signal"}
          onClick={handleSave}
          whileTap={
            reduce
              ? undefined
              : {
                  scale: [1, 1.35, 0.9, 1.05, 1],
                  rotate: [0, -12, 8, -4, 0],
                  transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
                }
          }
          className={cn(
            "ml-auto flex h-7 w-7 items-center justify-center rounded-lg transition-all",
            saved ? "text-green" : "text-muted-foreground hover:text-foreground"
          )}
        >
          <Bookmark
            className={cn(
              "h-4 w-4 transition-all duration-300",
              saved && "fill-current animate-bookmark-enhanced"
            )}
          />
        </fm.button>
      </div>

      <h3 className="mb-1.5 text-[15.5px] font-bold leading-snug tracking-[-0.01em] text-foreground">{title}</h3>

      {takeaway && (
        <div className="flex items-start gap-1.5">
          <Star className="mt-0.5 h-3 w-3 shrink-0 text-green" />
          <span className="text-[12.5px] leading-relaxed text-muted-foreground">{takeaway}</span>
        </div>
      )}
    </fm.article>
  );
}
