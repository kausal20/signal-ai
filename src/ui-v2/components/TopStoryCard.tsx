// signal-ui-v2 · components/TopStoryCard.tsx
// ---------------------------------------------------------------------------
// Hero Story Card — premium editorial layout (Apple News / Perplexity Discover
// feel). Typography-first: nothing is clipped at one line. The card grows with
// its content (headline up to 3 lines, summary up to 3) between a comfortable
// min and a sensible max, so long and short stories both breathe. Buttons stay
// pinned to the bottom, equal width/height, regardless of text length.
// A keyed AnimatePresence swaps stories with a staggered reveal.
// ---------------------------------------------------------------------------
import { memo } from "react";
import { AnimatePresence, motion as fm, useReducedMotion, type Variants } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Bookmark, Share2, Clock, ArrowRight, Sparkles, Ban } from "lucide-react";
import { BrandLogo } from "../icons/BrandLogo";

import { openOriginal, isSafeUrl } from "./SourceAttribution";
import { eventBadge } from "../shared/eventType";
import { useArticleSummary } from "@/hooks/useArticleSummary";
import type { Signal } from "../shared/types";

interface Props {
  signal: Signal;
  onOpen?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  onShare?: (id: string) => void;
  className?: string;
}

function readMins(s: Signal): number {
  const words = `${s.title} ${s.takeaway ?? ""}`.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 120));
}

function categoryLabel(s: Signal): string {
  const t = (s.tag ?? "").toString().replace(/[_-]+/g, " ").trim();
  return t ? t.charAt(0).toUpperCase() + t.slice(1) : "AI";
}

// Affected-audience chips derived from the feed's `whoFor` (grounded, not invented).
function affectedChips(signal: Signal): string[] {
  return (signal.affected ?? "")
    .split(/[,;/]|\band\b|·/i)
    .map((s) => s.trim())
    .filter((s) => s.length >= 3 && s.length <= 22)
    .slice(0, 4);
}

// Staggered reveal for the content on story change.
const container: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: [0.22, 1, 0.36, 1], staggerChildren: 0.06, delayChildren: 0.05 } },
  exit: { opacity: 0, y: -18, transition: { duration: 0.26, ease: [0.4, 0, 1, 1] } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 380, damping: 30, mass: 0.7 } },
};

function TopStoryCardImpl({ signal, onOpen, onToggleSave, onShare, className = "" }: Props) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const badge = eventBadge(signal.title, signal.category, signal.tag);
  const affected = affectedChips(signal);
  // Signal Summary — AI-generated, cached per article. Falls back to the article
  // excerpt if the summary hasn't been generated yet, so the card is never blank.
  const excerpt = signal.whatHappened || signal.takeaway;
  const { summary } = useArticleSummary(signal.aiSummary ? undefined : signal.id, excerpt);
  const signalSummary = signal.aiSummary || summary || excerpt || "Key developments from today's top signal.";

  const handleShare = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onShare) onShare(signal.id);
    else if (navigator.share) {
      navigator.share({ title: signal.title, text: signal.takeaway || signal.title, url: window.location.href }).catch(() => {});
    }
  };

  return (
    <fm.article
      onClick={() => onOpen?.(signal.id)}
      whileHover={reduce ? undefined : { y: -3 }}
      transition={{ type: "spring", stiffness: 300, damping: 24 }}
      className={`group relative flex min-h-[300px] w-full cursor-pointer select-none flex-col overflow-hidden rounded-[28px] border border-white/[0.08] bg-[#0a0d0a]/95 p-6 shadow-[0_16px_44px_-14px_rgba(0,0,0,0.8)] backdrop-blur-xl sm:p-7 ${className}`}
    >
      {/* Ambient editorial glow (depth, not an image) */}
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-green/[0.10] blur-3xl" />

      {/* Persistent corner actions — never re-animate on story change */}
      <div className="absolute right-5 top-5 z-20 flex items-center gap-2 pointer-events-auto sm:right-6 sm:top-6">
        <fm.button
          type="button"
          aria-label={signal.saved ? "Remove bookmark" : "Bookmark story"}
          aria-pressed={signal.saved}
          onClick={(e) => { e.stopPropagation(); onToggleSave?.(signal.id); }}
          whileTap={reduce ? undefined : { scale: 0.88 }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-400 backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
        >
          <Bookmark className={`h-4 w-4 ${signal.saved ? "fill-green text-green" : ""}`} />
        </fm.button>
        <fm.button
          type="button"
          aria-label="Share story"
          onClick={handleShare}
          whileTap={reduce ? undefined : { scale: 0.88 }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 bg-white/[0.05] text-zinc-400 backdrop-blur-md transition-colors hover:border-white/20 hover:bg-white/[0.1] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
        >
          <Share2 className="h-4 w-4" />
        </fm.button>
      </div>

      {/* Content — swaps with a staggered reveal when the story changes */}
      <AnimatePresence mode="wait">
        <fm.div
          key={signal.id}
          variants={reduce ? undefined : container}
          initial={reduce ? undefined : "hidden"}
          animate={reduce ? undefined : "show"}
          exit={reduce ? undefined : "exit"}
          className="relative z-10 flex flex-1 flex-col"
        >
          {/* Breaking badge */}
          <fm.div variants={reduce ? undefined : item} className="mb-4 pr-24">
            <span className={`inline-flex items-center rounded-full border px-3 py-1 font-mono-tight text-[10.5px] font-bold uppercase tracking-[0.12em] backdrop-blur-md ${badge.className}`}>
              {badge.label}
            </span>
          </fm.div>

          {/* Headline — up to 3 lines, balanced wrap, typography is the hero */}
          <fm.h3
            variants={reduce ? undefined : item}
            className="text-[25px] font-extrabold leading-[1.14] tracking-[-0.025em] text-white [text-wrap:balance] line-clamp-3 sm:text-[30px]"
          >
            {signal.title}
          </fm.h3>

          {/* Signal Summary — AI briefing of the whole article (cache-first,
              backed by the article-summary edge fn). Max 4 lines per spec. */}
          <fm.span
            variants={reduce ? undefined : item}
            className="mt-3.5 font-mono-tight text-[9.5px] font-bold uppercase tracking-[0.10em] text-green"
          >
            Signal Summary
          </fm.span>
          <fm.p
            variants={reduce ? undefined : item}
            className="mt-1.5 max-w-[54ch] text-[15px] leading-relaxed text-white/70 line-clamp-4 sm:text-[15.5px]"
          >
            {signalSummary}
          </fm.p>
          {signal.takeaway && (signal.whatHappened && signal.takeaway !== signal.whatHappened) && (
            <fm.div variants={reduce ? undefined : item} className="mt-2.5 flex gap-2">
              <span className="mt-0.5 shrink-0 font-mono-tight text-[9.5px] font-bold uppercase tracking-[0.10em] text-green">Why</span>
              <p className="max-w-[52ch] text-[13.5px] leading-snug text-white/55 line-clamp-2">{signal.takeaway}</p>
            </fm.div>
          )}
          {affected.length > 0 && (
            <fm.div variants={reduce ? undefined : item} className="mt-3 flex flex-wrap items-center gap-1.5">
              <span className="font-mono-tight text-[9.5px] font-bold uppercase tracking-[0.10em] text-white/40">Affects</span>
              {affected.map((a) => (
                <span key={a} className="rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[11px] font-semibold text-white/75">
                  {a}
                </span>
              ))}
            </fm.div>
          )}

          {/* Metadata — single row, never wraps */}
          <fm.div
            variants={reduce ? undefined : item}
            className="mt-5 flex items-center gap-2 whitespace-nowrap text-[12.5px] text-zinc-400"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              {signal.sourceKey && <BrandLogo source={signal.sourceKey} name={signal.source} size={15} />}
              <span className="truncate font-semibold text-white/90">{signal.source}</span>
            </span>
            <span className="shrink-0 text-zinc-600">·</span>
            <span className="shrink-0 text-zinc-400">{categoryLabel(signal)}</span>
            <span className="shrink-0 text-zinc-600">·</span>
            <span className="inline-flex shrink-0 items-center gap-1"><Clock className="h-3.5 w-3.5" />{readMins(signal)} min</span>
          </fm.div>


          <fm.div variants={reduce ? undefined : item} className="mt-auto flex items-stretch gap-2.5 pt-6">
            {isSafeUrl(signal.url) ? (
              <fm.button
                type="button"
                onClick={(e) => { e.stopPropagation(); openOriginal(signal.url); }}
                whileHover={reduce ? undefined : { scale: 1.02 }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                transition={{ type: "spring", stiffness: 360, damping: 22 }}
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-green px-4 text-[14.5px] font-bold text-black shadow-[0_6px_22px_hsl(152_72%_48%/0.28)] transition-colors hover:bg-green/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0d0a]"
              >
                Read Story <ArrowRight className="h-4 w-4 stroke-[2.5]" />
              </fm.button>
            ) : (
              // No real source URL → a clear, non-interactive state instead of a
              // green button that silently does nothing on tap.
              <span
                aria-disabled="true"
                className="inline-flex h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.02] px-4 text-[13.5px] font-semibold text-muted-foreground/60"
              >
                <Ban className="h-4 w-4" /> Original source unavailable
              </span>
            )}
            {/* Signal has ONE Ask Signal screen — the overlay in Advisor. This
                navigates there with the article context (openAsk + article), so
                the user enters that SAME experience from a different entry point.
                No second page, no duplicate chat UI. */}
            <fm.button
              type="button"
              aria-label="Ask Signal AI about this story"
              onClick={(e) => {
                e.stopPropagation();
                navigate("/", {
                  state: {
                    openAsk: true,
                    article: {
                      article_id: signal.id,
                      headline: signal.title,
                      summary: signal.whatHappened ?? signal.takeaway,
                      publisher: signal.source,
                      publisher_domain: signal.domain,
                      published_at: signal.publishedAt,
                      source_type: signal.isOfficial ? "OFFICIAL_SOURCE" : undefined,
                      impact_score: signal.score,
                      event_type: signal.eventType ?? categoryLabel(signal),
                      article_url: signal.url,
                    },
                  },
                });
              }}
              whileHover={reduce ? undefined : { scale: 1.02 }}
              whileTap={reduce ? undefined : { scale: 0.97 }}
              transition={{ type: "spring", stiffness: 360, damping: 22 }}
              className="inline-flex h-12 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full border border-green/40 bg-[linear-gradient(120deg,hsl(152_72%_48%/0.18),hsl(152_72%_48%/0.06))] px-4 text-[14px] font-bold text-green shadow-[0_0_20px_hsl(152_72%_48%/0.18)] backdrop-blur-md transition-colors hover:bg-[linear-gradient(120deg,hsl(152_72%_48%/0.26),hsl(152_72%_48%/0.10))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0d0a]"
            >
              <Sparkles className="h-4 w-4" /> Signal AI
            </fm.button>
          </fm.div>
        </fm.div>
      </AnimatePresence>
    </fm.article>
  );
}

// Memoized so Home-level state changes (bookmarks, tab, brief) don't re-render
// the hero or re-trigger its Signal Summary fetch when nothing it paints changed.
export const TopStoryCard = memo(TopStoryCardImpl, (a, b) =>
  a.onOpen === b.onOpen && a.onToggleSave === b.onToggleSave && a.onShare === b.onShare &&
  a.className === b.className &&
  a.signal.id === b.signal.id && a.signal.saved === b.signal.saved &&
  a.signal.title === b.signal.title && a.signal.aiSummary === b.signal.aiSummary &&
  a.signal.whatHappened === b.signal.whatHappened && a.signal.takeaway === b.signal.takeaway,
);

// ── Editorial loading skeleton (shimmer, matches the card's rhythm) ────────
export function TopStoryCardSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`relative flex min-h-[300px] w-full flex-col overflow-hidden rounded-[28px] border border-white/[0.06] bg-[#0a0d0a]/95 p-6 sm:p-7 ${className}`} aria-hidden>
      <div className="motion-wave-shimmer mb-4 h-6 w-24 rounded-full" />
      <div className="motion-wave-shimmer mb-2.5 h-7 w-[92%] rounded-lg" />
      <div className="motion-wave-shimmer mb-2.5 h-7 w-[78%] rounded-lg" />
      <div className="motion-wave-shimmer mb-5 h-7 w-[46%] rounded-lg" />
      <div className="motion-wave-shimmer mb-2 h-4 w-[88%] rounded" />
      <div className="motion-wave-shimmer h-4 w-[64%] rounded" />
      <div className="motion-wave-shimmer mt-5 h-4 w-40 rounded" />
      <div className="mt-auto flex gap-2.5 pt-6">
        <div className="motion-wave-shimmer h-12 flex-1 rounded-2xl" />
        <div className="motion-wave-shimmer h-12 flex-1 rounded-2xl" />
      </div>
    </div>
  );
}
