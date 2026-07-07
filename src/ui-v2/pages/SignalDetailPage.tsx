// signal-ui-v2 · pages/SignalDetailPage.tsx
// ---------------------------------------------------------------------------
// Expanded signal / story view: full headline, the Signal Score, "why this
// matters to you", sources, and related signals. Opened when a feed card is
// tapped. Fully prop-driven.
//
// New screen — no direct production equivalent yet (feed cards currently expand
// in place). Wire the back action + related-tap to your router on merge.
// ---------------------------------------------------------------------------
import { ChevronLeft, Bookmark, Share2, ExternalLink, Star } from "lucide-react";
import { ScreenShell } from "../layouts/ScreenShell";
import { SectionHeader } from "../components/SectionHeader";
import { SignalScoreRing } from "../components/SignalScoreRing";
import { SignalBadge } from "../components/SignalBadge";
import { SignalButton } from "../components/SignalButton";
import { FeedCard } from "../components/FeedCard";
import { BrandLogo } from "../icons/BrandLogo";
import { motion } from "../animations/motion";
import type { Signal, SourceSummary } from "../shared/types";

interface Props {
  signal: Signal;
  /** Long-form body / summary paragraphs. */
  body?: string[];
  /** "Why this matters to you" — personalized note. */
  relevance?: string;
  /** Contributing sources for this story. */
  sources?: SourceSummary[];
  /** Related signals shown at the bottom. */
  related?: Signal[];
  /** External link label + handler (production supplies the URL/open logic). */
  primaryActionLabel?: string;

  onBack?: () => void;
  onToggleSave?: (id: string) => void;
  onShare?: (id: string) => void;
  onOpenExternal?: (id: string) => void;
  onOpenRelated?: (id: string) => void;
}

export function SignalDetailPage({
  signal, body = [], relevance, sources = [], related = [],
  primaryActionLabel = "Read full story",
  onBack, onToggleSave, onShare, onOpenExternal, onOpenRelated,
}: Props) {
  const { id, title, source, sourceKey, score, tag, timeAgo, saved } = signal;

  const header = (
    <div className="flex items-center justify-between bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_72%,transparent)] px-5 pb-3 pt-12">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-foreground/80 transition-transform active:scale-90"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="flex gap-2">
        <button
          type="button"
          aria-label="Share"
          onClick={() => onShare?.(id)}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-foreground/80 transition-transform active:scale-90"
        >
          <Share2 className="h-[18px] w-[18px]" />
        </button>
        <button
          type="button"
          aria-label={saved ? "Remove bookmark" : "Save"}
          onClick={() => onToggleSave?.(id)}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] transition-transform active:scale-90"
        >
          <Bookmark className={`h-[18px] w-[18px] ${saved ? "fill-green text-green animate-bookmark" : "text-foreground/80"}`} />
        </button>
      </div>
    </div>
  );

  return (
    <ScreenShell header={header} bodyClassName="px-[22px] pb-10 pt-1">
      {/* META + TITLE */}
      <div className={`mb-5 ${motion.fadeUp}`}>
        <div className="mb-3 flex items-center gap-2">
          <span className="flex items-center gap-1.5 font-mono-tight text-[10px] font-bold uppercase tracking-[0.12em] text-green">
            {sourceKey && <BrandLogo source={sourceKey} name={source} size={14} />}
            {source}
          </span>
          {tag && <SignalBadge tone="neutral">{tag}</SignalBadge>}
          {timeAgo && <span className="text-[10px] font-semibold text-muted-foreground">{timeAgo}</span>}
        </div>
        <div className="flex items-start justify-between gap-4">
          <h1 className="flex-1 text-[26px] font-extrabold leading-[1.15] tracking-[-0.025em] text-foreground">{title}</h1>
          <SignalScoreRing score={score} size={58} showLabel className="shrink-0" />
        </div>
      </div>

      {/* WHY THIS MATTERS */}
      {relevance && (
        <div className={`mb-6 rounded-[18px] border border-green/[0.16] bg-green/[0.055] p-4 ${motion.fadeUp}`}>
          <div className="mb-2 flex items-center gap-1.5">
            <Star className="h-3.5 w-3.5 text-green" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-green">Why this matters to you</span>
          </div>
          <p className="text-[13.5px] leading-relaxed text-foreground/85">{relevance}</p>
        </div>
      )}

      {/* BODY */}
      {body.length > 0 && (
        <div className={`mb-7 flex flex-col gap-3.5 ${motion.fadeUp}`}>
          {body.map((p, i) => (
            <p key={i} className="text-[15px] leading-relaxed text-foreground/75">{p}</p>
          ))}
        </div>
      )}

      {/* PRIMARY ACTION */}
      <SignalButton
        fullWidth
        size="lg"
        className={`mb-7 ${motion.fadeUp}`}
        onClick={() => onOpenExternal?.(id)}
        iconRight={<ExternalLink className="h-[16px] w-[16px]" />}
      >
        {primaryActionLabel}
      </SignalButton>

      {/* SOURCES */}
      {sources.length > 0 && (
        <section className={`mb-7 ${motion.fadeUp}`}>
          <SectionHeader title="Sources" />
          <div className="flex flex-wrap gap-2">
            {sources.map((s) => (
              <span key={s.key} className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5">
                <BrandLogo source={s.key} name={s.name} size={14} />
                <span className="text-[12px] font-semibold text-foreground/80">{s.name}</span>
              </span>
            ))}
          </div>
        </section>
      )}

      {/* RELATED */}
      {related.length > 0 && (
        <section className={motion.fadeUp}>
          <SectionHeader title="Related signals" />
          <div className="flex flex-col gap-2.5">
            {related.map((r) => (
              <FeedCard key={r.id} signal={r} onOpen={onOpenRelated} onToggleSave={onToggleSave} />
            ))}
          </div>
        </section>
      )}
    </ScreenShell>
  );
}
