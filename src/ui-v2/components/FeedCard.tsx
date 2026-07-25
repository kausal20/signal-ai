// signal-ui-v2 · components/FeedCard.tsx
// ---------------------------------------------------------------------------
// Premium news card — Apple News / Linear / Bloomberg / Perplexity feel in
// Signal's language. Three tiers only: minimal top metadata → headline (max 2
// lines) → inline Signal AI insight. Everything non-decision-making removed
// (NEWS/SOURCE labels, separators, extra badges). Readability over metadata.
// ---------------------------------------------------------------------------
import { useCallback } from "react";
import { Bookmark, Globe, Sparkles, ArrowRight } from "lucide-react";
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
  /** Opens the single Signal AI screen with this article already attached. */
  onAsk?: (id: string) => void;
  className?: string;
}

export function FeedCard({ signal, onOpen, onToggleSave, onAsk, className }: Props) {
  const { id, title, source, sourceKey, timeAgo, insight, saved, url } = signal;
  const reduce = useReducedMotion();

  const handleSave = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); haptic(10); onToggleSave?.(id); },
    [id, onToggleSave],
  );
  const handleAsk = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); haptic(8); onAsk?.(id); },
    [id, onAsk],
  );

  return (
    <fm.article
      onClick={() => onOpen?.(id)}
      whileHover={reduce ? undefined : { y: -3, scale: 1.01, transition: motionTokens.spring.card }}
      whileTap={reduce ? undefined : { scale: 0.985, transition: motionTokens.spring.press }}
      className={cn(
        "cursor-pointer rounded-[18px] border border-white/[0.06] bg-white/[0.028] p-4",
        "transition-[border-color,box-shadow] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
        "hover:border-green/[0.15] hover:bg-white/[0.05] hover:shadow-[0_8px_32px_-8px_hsl(0_0%_0%/0.5),0_0_0_1px_hsl(152_72%_48%/0.06)]",
        className,
      )}
    >
      {/* ── TOP ROW: publisher · badge ······ time · bookmark ── */}
      <div className="flex items-center gap-2">
        {sourceKey && <BrandLogo source={sourceKey} name={source} size={15} />}
        <span className="min-w-0 truncate text-[12.5px] font-semibold tracking-[-0.01em] text-foreground/90">
          {source}
        </span>
        {isSafeUrl(url) && (
          <fm.button
            type="button"
            aria-label={`Open original source at ${source} (new tab)`}
            onClick={(e) => { e.stopPropagation(); openOriginal(url); }}
            whileTap={reduce ? undefined : { scale: 0.9 }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 py-0.5 text-[11px] font-semibold text-green/80 transition-colors hover:bg-green/[0.12] hover:text-green"
          >
            Source
            <Globe className="h-3 w-3" />
          </fm.button>
        )}

        <span className="ml-auto shrink-0 text-[11.5px] font-medium text-muted-foreground">{timeAgo}</span>

        <fm.button
          type="button"
          aria-label={saved ? "Remove bookmark" : "Save story"}
          onClick={handleSave}
          whileTap={reduce ? undefined : {
            scale: [1, 1.35, 0.9, 1.05, 1], rotate: [0, -12, 8, -4, 0],
            transition: { duration: 0.5, ease: [0.22, 1, 0.36, 1] },
          }}
          className={cn(
            "-mr-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg transition-colors",
            saved ? "text-green" : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Bookmark className={cn("h-[18px] w-[18px] transition-all duration-300", saved && "fill-current animate-bookmark-enhanced")} />
        </fm.button>
      </div>

      {/* ── HEADLINE (max 2 lines, generous whitespace) ── */}
      <h3 className="mt-3 line-clamp-2 text-[16px] font-bold leading-[1.28] tracking-[-0.015em] text-foreground">
        {title}
      </h3>

      {/* ── SIGNAL AI INSIGHT (inline, lightweight; hidden when unavailable) ── */}
      {insight && (
        <fm.div
          initial={reduce ? undefined : { opacity: 0 }}
          animate={reduce ? undefined : { opacity: 1 }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          className="mt-3.5"
        >
          <button
            type="button"
            aria-label="Ask Signal AI about this story"
            onClick={handleAsk}
            className="group -my-2 -ml-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-1 py-2 text-green transition-opacity hover:opacity-80 active:opacity-60"
          >
            <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
            <span className="text-[12px] font-bold uppercase tracking-[0.06em]">Signal AI</span>
            <ArrowRight className="h-3.5 w-3.5 stroke-[2.5] transition-transform group-hover:translate-x-0.5" />
          </button>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-relaxed text-muted-foreground">
            {insight}
          </p>
        </fm.div>
      )}
    </fm.article>
  );
}
