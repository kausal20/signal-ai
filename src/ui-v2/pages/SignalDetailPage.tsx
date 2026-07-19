// signal-ui-v2 · pages/SignalDetailPage.tsx
// ---------------------------------------------------------------------------
// Expanded signal / story view with viewport-triggered score ring, staggered
// body paragraphs, cascade related signals, and premium section choreography.
// ---------------------------------------------------------------------------
import { ChevronLeft, Bookmark, Share2, ExternalLink, Star } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { ScreenShell } from "../layouts/ScreenShell";
import { SectionHeader } from "../components/SectionHeader";
import { SignalScoreRing } from "../components/SignalScoreRing";
import { SignalBadge } from "../components/SignalBadge";
import { SignalButton } from "../components/SignalButton";
import { FeedCard } from "../components/FeedCard";
import { BrandLogo } from "../icons/BrandLogo";
import { staggerContainer as container, fadeInUp as item, motionTokens, viewportOnce, haptic } from "../animations/motion";
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

// Body paragraphs and related cards stagger via the shared motion system
// (imported as container/item).

export function SignalDetailPage({
  signal, body = [], relevance, sources = [], related = [],
  primaryActionLabel = "Read full story",
  onBack, onToggleSave, onShare, onOpenExternal, onOpenRelated,
}: Props) {
  const { id, title, source, sourceKey, score, tag, timeAgo, saved } = signal;
  const reduce = useReducedMotion();
  const V = reduce ? undefined : item;
  const anim = reduce
    ? { initial: undefined, animate: undefined }
    : { initial: "hidden" as const, animate: "show" as const };

  const header = (
    <div className="flex items-center justify-between bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_72%,transparent)] px-5 pb-3 pt-12">
      <fm.button
        type="button"
        onClick={onBack}
        aria-label="Back"
        whileTap={reduce ? undefined : { scale: 0.9 }}
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-foreground/80 transition-transform"
      >
        <ChevronLeft className="h-5 w-5" />
      </fm.button>
      <div className="flex gap-2">
        <fm.button
          type="button"
          aria-label="Share"
          onClick={() => onShare?.(id)}
          whileTap={reduce ? undefined : { scale: 0.9 }}
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-foreground/80 transition-transform"
        >
          <Share2 className="h-[18px] w-[18px]" />
        </fm.button>
        <fm.button
          type="button"
          aria-label={saved ? "Remove bookmark" : "Save"}
          onClick={() => {
            haptic(10);
            onToggleSave?.(id);
          }}
          whileTap={
            reduce
              ? undefined
              : {
                  scale: [1, 1.35, 0.9, 1.05, 1],
                  rotate: [0, -12, 8, -4, 0],
                  transition: { duration: 0.5, ease: motionTokens.ease.premium },
                }
          }
          className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] transition-transform"
        >
          <Bookmark className={`h-[18px] w-[18px] ${saved ? "fill-green text-green animate-bookmark-enhanced" : "text-foreground/80"}`} />
        </fm.button>
      </div>
    </div>
  );

  return (
    <ScreenShell header={header} bodyClassName="px-[22px] pb-10 pt-1">
      <fm.div variants={reduce ? undefined : container} {...anim}>
        {/* META + TITLE */}
        <fm.div variants={V} className="mb-5">
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
        </fm.div>

        {/* WHY THIS MATTERS */}
        {relevance && (
          <fm.div variants={V} className="mb-6 rounded-[18px] border border-green/[0.16] bg-green/[0.055] p-4">
            <div className="mb-2 flex items-center gap-1.5">
              <Star className="h-3.5 w-3.5 text-green" />
              <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-green">Why this matters to you</span>
            </div>
            <p className="text-[13.5px] leading-relaxed text-foreground/85">{relevance}</p>
          </fm.div>
        )}

        {/* BODY — staggered paragraphs */}
        {body.length > 0 && (
          <fm.div variants={reduce ? undefined : container} {...anim} className="mb-7 flex flex-col gap-3.5">
            {body.map((p, i) => (
              <fm.p key={i} variants={V} className="text-[15px] leading-relaxed text-foreground/75">{p}</fm.p>
            ))}
          </fm.div>
        )}

        {/* PRIMARY ACTION */}
        <fm.div variants={V}>
          <SignalButton
            fullWidth
            size="lg"
            className="mb-7"
            onClick={() => onOpenExternal?.(id)}
            iconRight={<ExternalLink className="h-[16px] w-[16px]" />}
          >
            {primaryActionLabel}
          </SignalButton>
        </fm.div>

        {/* SOURCES */}
        {sources.length > 0 && (
          <fm.section
            variants={V}
            className="mb-7"
          >
            <SectionHeader title="Sources" />
            <div className="flex flex-wrap gap-2">
              {sources.map((s) => (
                <span key={s.key} className="flex items-center gap-2 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5">
                  <BrandLogo source={s.key} name={s.name} size={14} />
                  <span className="text-[12px] font-semibold text-foreground/80">{s.name}</span>
                </span>
              ))}
            </div>
          </fm.section>
        )}

        {/* RELATED — cascade entrance */}
        {related.length > 0 && (
          <fm.section
            initial={reduce ? undefined : { opacity: 0 }}
            whileInView={reduce ? undefined : { opacity: 1 }}
            viewport={viewportOnce}
            transition={{ duration: motionTokens.duration.section, ease: motionTokens.ease.premium }}
          >
            <SectionHeader title="Related signals" />
            <fm.div variants={reduce ? undefined : container} {...anim} className="flex flex-col gap-2.5">
              {related.map((r) => (
                <fm.div key={r.id} variants={V}>
                  <FeedCard signal={r} onOpen={onOpenRelated} onToggleSave={onToggleSave} />
                </fm.div>
              ))}
            </fm.div>
          </fm.section>
        )}
      </fm.div>
    </ScreenShell>
  );
}
