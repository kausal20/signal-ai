// signal-ui-v2 · components/FeedCard.tsx
// ---------------------------------------------------------------------------
// Premium news card — Apple News / Linear / Arc feel. Collapsed state unchanged
// (top metadata → headline → inline Signal AI insight). Tapping the card
// smoothly UNFOLDS an in-place detail panel: AI summary → Why → Key takeaways
// → Opportunity → Read Original Source. Only one card open at a time (module
// bus); reduced-motion honored; keyboard + screen-reader accessible.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState, memo } from "react";
import { Bookmark, Globe, Sparkles, ArrowRight, ChevronDown, ExternalLink } from "lucide-react";
import { AnimatePresence, motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { BrandLogo } from "../icons/BrandLogo";
import { isSafeUrl, openOriginal } from "./SourceAttribution";
import { motionTokens, haptic } from "../animations/motion";
import { useArticleSummary } from "@/hooks/useArticleSummary";
import type { Signal } from "../shared/types";

// ── Single-open coordinator (module-level event bus) ────────────────────────
// Any card that opens dispatches; every other card listens and closes itself.
// Keeps state local — no prop plumbing changes to Home/Search.
const EXPAND_EVENT = "signal:feedcard:expand";
function announceExpand(id: string) {
  window.dispatchEvent(new CustomEvent(EXPAND_EVENT, { detail: { id } }));
}

interface Props {
  signal: Signal;
  onOpen?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  /** Opens the single Signal AI screen with this article already attached. */
  onAsk?: (id: string) => void;
  className?: string;
}

// Generic lead-in sentences that describe an ACTION taken ("Researchers
// conducted tests...", "The company announced...") without saying what was
// found/changed. Matched only to SKIP to the next sentence already present in
// the source text — never used to invent or alter content.
const VAGUE_OPENER = /^(researchers?|scientists?|officials?|the (company|team|study|report|paper)|analysts?|experts?|a new study)\b[\s\S]{0,60}?\b(conducted|examined|looked at|announced|studied|investigated|explored|discussed|reported on|tested|compared|is looking|are looking|said|stated|noted)\b/i;

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z"'(])/).filter(Boolean);
}

// Trims a description down to a clean, complete-sentence snippet that fits
// the card's 2-line headline slot — never a mid-word/mid-sentence "…" cut.
// Prefers whole sentences within the budget; if even the first sentence runs
// long, cuts cleanly at the last whole word instead of slicing mid-word.
function toHeadlineSnippet(text?: string, maxChars = 64): string {
  if (!text) return "";
  let clean = text.replace(/\s+/g, " ").trim();
  if (!clean) return "";

  // Prefer the concrete finding over a vague lead-in — only skips to a LATER
  // sentence that's already in the source; falls back to the original text
  // if the lead-in is all there is (never fabricates a replacement).
  const sentences = splitSentences(clean);
  if (sentences.length > 1 && VAGUE_OPENER.test(sentences[0])) {
    const rest = sentences.slice(1).join(" ").trim();
    if (rest) clean = rest;
  }

  if (clean.length <= maxChars) return clean;
  let out = "";
  for (const s of splitSentences(clean)) {
    const next = out ? `${out} ${s}` : s;
    if (next.length > maxChars) break;
    out = next;
  }
  if (out) return out;
  // First sentence alone is too long — cut at the last full word, no ellipsis.
  const words = clean.slice(0, maxChars).split(" ");
  words.pop();
  return words.join(" ");
}

// Split a paragraph into 3-5 sentence bullets (grounded, no fabrication).
function toBullets(text?: string, cap = 4): string[] {
  if (!text) return [];
  const parts = text
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+(?=[A-Z“"‘'(])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20 && s.length <= 200);
  return parts.slice(0, cap);
}

function FeedCardImpl({ signal, onOpen, onToggleSave, onAsk, className }: Props) {
  const { id, title, source, sourceKey, timeAgo, insight, saved, url } = signal;
  const reduce = useReducedMotion();
  const rootRef = useRef<HTMLElement>(null);
  const [expanded, setExpanded] = useState(false);

  // Listen for OTHER cards opening → auto-close self.
  useEffect(() => {
    const onExpand = (e: Event) => {
      const detail = (e as CustomEvent<{ id: string }>).detail;
      if (detail?.id && detail.id !== id) setExpanded(false);
    };
    window.addEventListener(EXPAND_EVENT, onExpand as EventListener);
    return () => window.removeEventListener(EXPAND_EVENT, onExpand as EventListener);
  }, [id]);

  // Lazily fetch the Signal Summary only after the user opens the card.
  // Cache-first + falls back to the article excerpt (`insight`) so a slow LLM
  // call never leaves the panel blank.
  const excerpt = signal.aiSummary || signal.whatHappened || insight || signal.takeaway;
  const { summary } = useArticleSummary(expanded ? id : undefined, excerpt);
  const aiSummary = signal.aiSummary || summary || excerpt;

  // ONE canonical headline for both collapsed and expanded state — factual
  // "what happened" only (never takeaway/insight, which are advice-framed).
  // Computed once so the card can never show two different headlines.
  const canonicalHeadline = toHeadlineSnippet(signal.whatHappened || signal.aiSummary || excerpt) || title;

  // Sections — only rendered when they have real content.
  const bullets = useMemo(() => toBullets(signal.whatHappened || aiSummary, 4), [signal.whatHappened, aiSummary]);
  const why = signal.takeaway || (insight && !bullets.includes(insight) ? insight : "");
  const opportunity = insight && insight !== why && !bullets.includes(insight) ? insight : "";

  const toggle = useCallback(() => {
    setExpanded((prev) => {
      const next = !prev;
      if (next) { haptic(6); announceExpand(id); onOpen?.(id); }
      return next;
    });
  }, [id, onOpen]);

  const handleSave = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); haptic(10); onToggleSave?.(id); },
    [id, onToggleSave],
  );
  const handleAsk = useCallback(
    (e: React.MouseEvent) => { e.stopPropagation(); haptic(8); onAsk?.(id); },
    [id, onAsk],
  );
  const onKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.target !== e.currentTarget) return;   // let inner buttons keep own semantics
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(); }
  }, [toggle]);

  // After expand animation, gently scroll enough content into view (no jump).
  useEffect(() => {
    if (!expanded || reduce) return;
    const t = window.setTimeout(() => {
      rootRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 260);
    return () => window.clearTimeout(t);
  }, [expanded, reduce]);

  const panelId = `feedcard-panel-${id}`;
  // Only animate the ACTIVE card (still + subtle) — hover lift disabled while
  // open to avoid competing transforms during expand.
  const hoverAnim = expanded || reduce ? undefined : { y: -3, scale: 1.01, transition: motionTokens.spring.card };
  const tapAnim = expanded || reduce ? undefined : { scale: 0.985, transition: motionTokens.spring.press };

  return (
    <fm.article
      ref={rootRef}
      role="button"
      tabIndex={0}
      aria-expanded={expanded}
      aria-controls={panelId}
      onClick={toggle}
      onKeyDown={onKeyDown}
      layout="position"
      whileHover={hoverAnim}
      whileTap={tapAnim}
      animate={{
        scale: reduce ? 1 : expanded ? 1.01 : 1,
        boxShadow: expanded
          ? "0 18px 44px -14px hsl(0 0% 0% / 0.55), 0 0 0 1px hsl(152 72% 48% / 0.14)"
          : "0 0 0 0 hsl(0 0% 0% / 0)",
      }}
      transition={{ duration: expanded ? 0.24 : 0.2, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "cursor-pointer rounded-[18px] border border-white/[0.06] bg-white/[0.028] p-4",
        "transition-[border-color,background-color] duration-300 ease-[cubic-bezier(0.2,0,0,1)]",
        "focus-visible:outline-none focus-visible:border-green/40",
        expanded
          ? "border-green/[0.22] bg-white/[0.048]"
          : "hover:border-green/[0.15] hover:bg-white/[0.05]",
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

      {/* ── HEADLINE ──
          ONE canonical headline, identical in collapsed and expanded state —
          factual "what happened" only, never advice/opportunity framing.
          whatHappened/aiSummary are grounded "what happened" fields;
          takeaway/insight (why it matters / opportunity) are deliberately
          excluded here — they read as recommendations ("this could help...").
          Expanding the card reveals additional sections below; it must never
          swap the headline text itself. */}
      <h3 className={cn("mt-3 text-[16px] font-bold leading-[1.28] tracking-[-0.015em] text-foreground", !expanded && !excerpt && "line-clamp-2")}>
        {canonicalHeadline}
      </h3>

      {/* ── SIGNAL AI INSIGHT (collapsed teaser; hidden when expanded — the
              panel below carries the same information more richly). Hidden
              when it's the same text already shown as the headline above. ── */}
      {insight && insight !== excerpt && !expanded && (
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

      {/* ── EXPAND CHEVRON (subtle, rotates on open) ── */}
      <div className="mt-2 flex justify-end">
        <fm.span
          aria-hidden
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground/60"
        >
          <ChevronDown className="h-4 w-4" />
        </fm.span>
      </div>

      {/* ── EXPANDED PANEL (Framer Motion: height:auto unfold + scale/translate
              lift on inner wrapper + staggered content reveal). ── */}
      <AnimatePresence initial={false}>
        {expanded && (
          <fm.section
            id={panelId}
            role="region"
            aria-label="Story details"
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? { height: "auto", opacity: 1 } : { height: 0, opacity: 0 }}
            animate={reduce ? { height: "auto", opacity: 1 } : {
              height: "auto", opacity: 1,
              transition: {
                height: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
              },
            }}
            exit={reduce ? { height: 0, opacity: 0 } : {
              height: 0, opacity: 0,
              transition: {
                height: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
                opacity: { duration: 0.2, ease: [0.22, 1, 0.36, 1] },
              },
            }}
            style={{ overflow: "hidden", willChange: "height" }}
          >
            <fm.div
              initial={reduce ? undefined : { opacity: 0, y: 8, scale: 0.985 }}
              animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? undefined : { opacity: 0, y: -4, scale: 0.99 }}
              transition={reduce ? { duration: 0 } : {
                opacity: { duration: 0.24, ease: [0.22, 1, 0.36, 1] },
                y: { type: "spring", stiffness: 320, damping: 30, mass: 0.7 },
                scale: { type: "spring", stiffness: 320, damping: 30, mass: 0.7 },
              }}
              style={{ willChange: "transform, opacity" }}
              className="mt-4 border-t border-white/[0.06] pt-4"
            >
              <fm.div
                initial="hidden"
                animate="show"
                variants={reduce ? undefined : {
                  hidden: {},
                  show: { transition: { staggerChildren: 0.045, delayChildren: 0.08 } },
                }}
                className="flex flex-col gap-4"
              >
                {/* AI SUMMARY */}
                {aiSummary && (
                  <Row
                    reduce={!!reduce}
                    label={<><Sparkles className="h-3 w-3" strokeWidth={2.5} /> AI Summary</>}
                  >
                    <p className="text-[13.5px] leading-relaxed text-foreground/85">{aiSummary}</p>
                  </Row>
                )}

                {/* WHY IT MATTERS */}
                {why && (
                  <Row reduce={!!reduce} label={<>Why it matters</>}>
                    <p className="text-[13.5px] leading-relaxed text-foreground/80">{why}</p>
                  </Row>
                )}

                {/* KEY TAKEAWAYS */}
                {bullets.length >= 2 && (
                  <Row reduce={!!reduce} label={<>Key takeaways</>}>
                    <ul className="flex flex-col gap-1.5">
                      {bullets.map((b, i) => (
                        <li key={i} className="flex items-start gap-2 text-[13px] leading-relaxed text-foreground/80">
                          <span aria-hidden className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-green/70" />
                          <span>{b}</span>
                        </li>
                      ))}
                    </ul>
                  </Row>
                )}

                {/* OPPORTUNITY (only if it's distinct from why + not already bulleted) */}
                {opportunity && (
                  <Row reduce={!!reduce} label={<>Opportunity</>}>
                    <p className="text-[13.5px] leading-relaxed text-foreground/80">{opportunity}</p>
                  </Row>
                )}

                {/* ── ACTIONS ROW ── */}
                <fm.div
                  variants={reduce ? undefined : {
                    hidden: { opacity: 0, y: 8 },
                    show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } },
                  }}
                  className="mt-1 flex flex-wrap items-stretch gap-2"
                >
                  {isSafeUrl(url) && (
                    <fm.button
                      type="button"
                      aria-label={`Open original source at ${source} (new tab)`}
                      onClick={(e) => { e.stopPropagation(); openOriginal(url); }}
                      whileTap={reduce ? undefined : { scale: 0.97 }}
                      className="group inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-green px-4 text-[13.5px] font-bold text-black shadow-[0_6px_22px_hsl(152_72%_48%/0.28)] transition-transform hover:brightness-110"
                    >
                      Source
                      <ExternalLink className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </fm.button>
                  )}
                  {onAsk && (
                    <fm.button
                      type="button"
                      aria-label="Ask Signal AI about this story"
                      onClick={handleAsk}
                      whileTap={reduce ? undefined : { scale: 0.97 }}
                      className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-green/40 px-4 text-[13px] font-bold text-green hover:bg-green/[0.08]"
                    >
                      <Sparkles className="h-3.5 w-3.5" strokeWidth={2.25} />
                      Signal AI
                    </fm.button>
                  )}
                </fm.div>
              </fm.div>
            </fm.div>
          </fm.section>
        )}
      </AnimatePresence>
    </fm.article>
  );
}

// Small section row with fade+slide-in on stagger. GPU-only props.
function Row({ label, children, reduce }: { label: React.ReactNode; children: React.ReactNode; reduce: boolean }) {
  return (
    <fm.div
      variants={reduce ? undefined : { hidden: { opacity: 0, y: 8 }, show: { opacity: 1, y: 0, transition: { duration: 0.18, ease: [0.22, 1, 0.36, 1] } } }}
    >
      <div className="mb-1 inline-flex items-center gap-1 font-mono-tight text-[10px] font-bold uppercase tracking-[0.14em] text-green/85">
        {label}
      </div>
      {children}
    </fm.div>
  );
}

// Memoized (as before): unrelated re-renders of the feed do not re-render cards.
// Local `expanded` state is per-card so the memo comparator still applies.
export const FeedCard = memo(FeedCardImpl, (a, b) =>
  a.onOpen === b.onOpen && a.onToggleSave === b.onToggleSave && a.onAsk === b.onAsk &&
  a.className === b.className &&
  a.signal.id === b.signal.id && a.signal.saved === b.signal.saved &&
  a.signal.title === b.signal.title && a.signal.insight === b.signal.insight &&
  a.signal.aiSummary === b.signal.aiSummary && a.signal.whatHappened === b.signal.whatHappened &&
  a.signal.takeaway === b.signal.takeaway &&
  a.signal.source === b.signal.source && a.signal.timeAgo === b.signal.timeAgo &&
  a.signal.sourceKey === b.signal.sourceKey && a.signal.url === b.signal.url,
);
