// signal-ui-v2 · pages/HomePage.tsx
// ---------------------------------------------------------------------------
// Home — a premium AI NEWS HUB. Answers one question: "What happened today?"
//
// Presentation order:
//   1. Updated just now (live)      2. Welcome back
//   3. Top Story (one featured)     4. Category filters
//   5. Today's Brief (swipe)        6. Latest Stories (chronological)
//   7. You're all caught up
//
// Recommendation / learning / opportunity / advisor content lives on the
// Advisor page — it is intentionally NOT rendered here. This is a
// presentation-only reorganisation: Props, data sources, handlers, routing,
// navigation and feed logic are all unchanged. `hero`, `project` and their
// handlers remain in the Props contract (passed by Index) but are not shown.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, Bookmark, ArrowRight, Clock } from "lucide-react";
import { motion as fm, useReducedMotion, useScroll, useTransform, LayoutGroup, type Variants } from "framer-motion";
import { staggerContainer as container, motionTokens } from "../animations/motion";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { LivePulse } from "../components/LivePulse";
import { AskSignalLauncher } from "../ask/AskSignalLauncher";
import { SectionHeader } from "../components/SectionHeader";
import { FeedCard } from "../components/FeedCard";
import { TopStoryCard } from "../components/TopStoryCard";
import { CountUp } from "../components/CountUp";
import { BrandLogo } from "../icons/BrandLogo";
import type { Recommendation, Signal, SectionKey, UserProfile, Project } from "../shared/types";

interface CategoryTab {
  id: string;
  label: string;
}

interface Props {
  profile: UserProfile;
  /** e.g. "4 things worth your time today · 6 min read". */
  briefSummary?: string;
  livePulseLabel?: React.ReactNode;
  hero?: Recommendation;    // opportunity — Advisor page only; not rendered here
  emptyLabel?: string;      // shown when nothing matches the active category
  brief: Signal[];          // swipeable rail
  topSignals: Signal[];     // importance-ranked pool; only used as Top Story fallback
  feed: Signal[];           // Latest Stories — already time-sorted + cross-section deduped
  categories?: CategoryTab[];
  activeCategory?: string;
  bookmarkCount?: number;
  /** "Continue Building" — Advisor page only; not rendered here. */
  project?: Project | null;

  onNavigate?: (s: SectionKey) => void;
  onOpenProfile?: () => void;
  onSelectCategory?: (id: string) => void;
  onOpenSignal?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  /** Opens the single Signal AI screen with the story attached as context. */
  onAskSignal?: (id: string) => void;
  onStartHero?: (id: string) => void;
  onToggleHeroSave?: (id: string) => void;
  onContinueProject?: (id: string) => void;
}

// ── Motion (spec timings) ───────────────────────────────────────────────────
const EASE = motionTokens.ease.premium;
const fadeUp: Variants = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } } };
const topStoryV: Variants = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE } } };
const chipRow: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.04, delayChildren: 0.02 } } };
const chipItem: Variants = { hidden: { opacity: 0, x: -12 }, show: { opacity: 1, x: 0, transition: { duration: 0.22, ease: EASE } } };
const briefRow: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };

// Estimate reading time from the copy we actually have (~120 wpm on snippets).
function readMins(s: Signal): number {
  const words = `${s.title} ${s.takeaway ?? ""}`.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 120));
}

export function HomePage({
  profile, briefSummary, livePulseLabel = "3 critical signals in the last hour",
  emptyLabel, brief, topSignals, feed, categories = [], activeCategory,
  bookmarkCount = 0, onNavigate, onOpenProfile, onSelectCategory,
  onOpenSignal, onToggleSave, onAskSignal,
}: Props) {
  const reduce = useReducedMotion();
  const anim = reduce
    ? { initial: undefined, animate: undefined }
    : { initial: "hidden" as const, animate: "show" as const };

  // Scroll-driven collapse: greeting shrinks + subtitle fades as the feed rises.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const { scrollY } = useScroll({ container: scrollEl ? { current: scrollEl } as React.RefObject<HTMLElement> : undefined });
  const greetingScale = useTransform(scrollY, [0, 90], [1, 0.78]);
  const greetingY = useTransform(scrollY, [0, 90], [0, -8]);
  const subOpacity = useTransform(scrollY, [0, 60], [1, 0]);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-home-scroll]");
    if (el) setScrollEl(el);
  }, []);

  const critical =
    typeof livePulseLabel === "string"
      ? Number((livePulseLabel.match(/(\d+)/) ?? [])[1] ?? NaN)
      : NaN;
  const isAll = !activeCategory || activeCategory === "all";

  // ── TOP STORY — exactly one, frozen to the "All" view so category filters
  // never change it (spec: "Do not affect Top Story"). ─────────────────────
  const topStoryRef = useRef<Signal | null>(null);
  const topCandidate = topSignals[0] ?? brief[0] ?? feed[0] ?? null;
  if (isAll && topCandidate) topStoryRef.current = topCandidate;
  const topStory = isAll ? topCandidate : (topStoryRef.current ?? topCandidate);

  const categoryLabel = (tag: string) => categories.find((c) => c.id === tag)?.label ?? tag;

  // ── TODAY'S BRIEF — 4–8 highlights, minus the Top Story. ──────────────────
  const briefCards = useMemo(
    () => brief.filter((s) => s.id !== topStory?.id).slice(0, 8),
    [brief, topStory?.id],
  );

  // ── LATEST STORIES — pure chronological feed, already deduped against Top
  // Story / Today's Brief upstream (Index.tsx's `briefing.feed`). Do NOT merge
  // `topSignals` back in here — they're importance-ranked, not time-ranked,
  // and re-adding them breaks the chronological guarantee for this section.
  const latest = useMemo(() => {
    const seen = new Set<string>();
    if (topStory) seen.add(topStory.id);
    const out: Signal[] = [];
    for (const s of feed) {
      if (seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [feed, topStory]);

  const nothingToShow = !topStory && briefCards.length === 0 && latest.length === 0;

  // ── SECTIONS 1 + 2 — Updated just now · Welcome back ──────────────────────
  const header = (
    <div className="relative">
      {!reduce && (
        <fm.div
          aria-hidden
          className="pointer-events-none absolute -top-8 left-1/2 -z-10 h-40 w-[80%] -translate-x-1/2 rounded-full bg-green/[0.10] blur-3xl"
          animate={{ opacity: [0.25, 0.5, 0.25] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div className="bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_60%,transparent)] px-4 pb-3.5 pt-[52px] backdrop-blur sm:px-5 lg:px-6">
        <div className="mx-auto w-full max-w-[920px]">
          <div className="mb-3.5 flex items-center justify-between gap-3">
            <LivePulse bare label="Updated just now" />
            {/* Signal AI is a primary, always-visible action here. This is the
                ONE Signal AI surface in the app — the launcher owns the overlay. */}
            <div className="flex shrink-0 items-center gap-2">
              <AskSignalLauncher />
              <fm.button
                type="button"
                onClick={onOpenProfile}
                aria-label="Open profile"
                whileTap={reduce ? undefined : { scale: 0.9 }}
                whileHover={reduce ? undefined : { scale: 1.06 }}
                className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-[13px] font-bold text-green"
              >
                {profile.initials ?? profile.name.slice(0, 1).toUpperCase()}
              </fm.button>
            </div>
          </div>
          <fm.h1
            style={reduce ? undefined : { scale: greetingScale, y: greetingY, transformOrigin: "left top" }}
            className="text-[25px] font-extrabold tracking-[-0.025em] text-foreground"
          >
            Welcome back, <span className="text-green">{profile.name.split(" ")[0]}</span>
          </fm.h1>
          {briefSummary && (
            <fm.p
              style={reduce ? undefined : { opacity: subOpacity }}
              className="mt-1 text-[13px] text-muted-foreground"
            >
              {briefSummary}
            </fm.p>
          )}
        </div>
      </div>
    </div>
  );

  return (
    <ScreenShell
      header={header}
      footer={<BottomNav active="home" bookmarkCount={bookmarkCount} onNavigate={onNavigate} />}
      bodyClassName="px-4 pb-28 pt-2 sm:px-5 lg:px-6"
      data-home-scroll
    >
      <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
        {/* live count line */}
        <LivePulse
          className="-mb-1"
          label={
            Number.isFinite(critical) ? (
              <>
                <CountUp value={critical as number} duration={900} className="font-mono-tight font-bold text-foreground/90" />{" "}
                critical signal{critical === 1 ? "" : "s"} today
              </>
            ) : (
              livePulseLabel
            )
          }
        />

        {/* ═══ SECTION 3 · TOP STORY ═══ */}
        {topStory && (
          <fm.section variants={reduce ? undefined : topStoryV} {...anim} aria-label="Top story">
            <SectionHeader title="Top Story" />
            <TopStoryCard signal={topStory} onOpen={onOpenSignal} onToggleSave={onToggleSave} />
          </fm.section>
        )}

        {/* ═══ SECTION 4 · CATEGORY FILTERS ═══ */}
        {categories.length > 0 && (
          <fm.div
            variants={reduce ? undefined : chipRow}
            {...anim}
            className="no-scrollbar -mx-4 flex gap-2.5 overflow-x-auto px-4 sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6"
            role="group"
            aria-label="Filter categories"
          >
            {categories.map((c) => {
              const on = c.id === activeCategory;
              return (
                <fm.button
                  key={c.id}
                  type="button"
                  variants={reduce ? undefined : chipItem}
                  aria-pressed={on}
                  onClick={() => onSelectCategory?.(c.id)}
                  whileHover={reduce ? undefined : { scale: 1.03 }}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 380, damping: 24 }}
                  className={`relative flex h-[38px] shrink-0 items-center whitespace-nowrap rounded-full border px-4 text-[12.5px] font-semibold transition-colors ${
                    on ? "border-green text-black" : "border-white/[0.08] text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {on && (
                    <fm.span
                      layoutId="home-cat-pill"
                      className="absolute inset-0 -z-10 rounded-full bg-green shadow-[0_0_18px_hsl(152_72%_48%/0.28)]"
                      transition={{ type: "spring", stiffness: 380, damping: 32 }}
                    />
                  )}
                  {c.label}
                </fm.button>
              );
            })}
          </fm.div>
        )}

        {/* ═══ SECTION 5 · TODAY'S BRIEF (swipe) ═══ */}
        {briefCards.length > 0 && (
          <section aria-label="Today's brief">
            <SectionHeader
              title="Today's Brief"
              action={<span className="text-[10px] font-semibold text-muted-foreground/70">{briefCards.length}</span>}
            />
            <fm.div
              variants={reduce ? undefined : briefRow}
              {...anim}
              className="no-scrollbar -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-1 [scroll-padding:16px] sm:-mx-5 sm:px-5 lg:-mx-6 lg:px-6"
            >
              {briefCards.map((s) => (
                <fm.button
                  key={s.id}
                  type="button"
                  variants={reduce ? undefined : fadeUp}
                  onClick={() => onOpenSignal?.(s.id)}
                  whileHover={reduce ? undefined : { y: -4 }}
                  whileTap={reduce ? undefined : { scale: 0.97 }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  className="flex h-[170px] w-[280px] shrink-0 snap-start flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.035] p-4 text-left"
                >
                  <div>
                    <div className="mb-2">
                      <span className="flex items-center gap-1.5 font-mono-tight text-[9.5px] font-bold tracking-[0.12em] text-green">
                        {s.sourceKey && <BrandLogo source={s.sourceKey} name={s.source} size={12} />}
                        {s.source}
                      </span>
                    </div>
                    <div className="text-[14px] font-bold leading-snug text-foreground line-clamp-2">{s.title}</div>
                    {s.takeaway && (
                      <div className="mt-1 text-[11.5px] leading-snug text-muted-foreground line-clamp-2">{s.takeaway}</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between text-[10.5px] text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{readMins(s)} min read</span>
                    <fm.span
                      role="button"
                      tabIndex={0}
                      aria-label={s.saved ? "Remove bookmark" : "Bookmark"}
                      onClick={(e) => { e.stopPropagation(); onToggleSave?.(s.id); }}
                      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onToggleSave?.(s.id); } }}
                      whileTap={reduce ? undefined : { scale: 0.85 }}
                      className="flex h-6 w-6 items-center justify-center rounded-full hover:text-green"
                    >
                      <Bookmark className={`h-3.5 w-3.5 ${s.saved ? "fill-green text-green" : ""}`} />
                    </fm.span>
                  </div>
                </fm.button>
              ))}
              <div className="flex w-6 shrink-0 snap-end items-center text-muted-foreground/40">
                <ChevronRight className="h-4 w-4" />
              </div>
            </fm.div>
          </section>
        )}

        {/* ═══ SECTION 6 · LATEST STORIES (chronological) ═══ */}
        {latest.length > 0 && (
          <section aria-label="Latest stories">
            <SectionHeader title="Latest Stories" />
            <LayoutGroup id="home-latest-stories">
              <fm.div variants={reduce ? undefined : container} {...anim} className="flex flex-col gap-4">
                {latest.map((s) => (
                  <fm.div key={s.id} layout="position" variants={reduce ? undefined : fadeUp}>
                    <FeedCard signal={s} onOpen={onOpenSignal} onToggleSave={onToggleSave} onAsk={onAskSignal} />
                  </fm.div>
                ))}
              </fm.div>
            </LayoutGroup>
          </section>
        )}

        {/* ═══ SECTION 7 · YOU'RE ALL CAUGHT UP ═══ */}
        {nothingToShow ? (
          <div className="flex flex-col items-center px-6 py-16 text-center">
            <p className="text-[13.5px] font-bold text-foreground">{emptyLabel ?? "Nothing here yet"}</p>
            <p className="text-[11.5px] text-muted-foreground">Try another category.</p>
          </div>
        ) : (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <fm.div
              initial={reduce ? undefined : { scale: 0.6, opacity: 0 }}
              whileInView={reduce ? undefined : { scale: 1, opacity: 1 }}
              viewport={{ once: true, amount: 0.6 }}
              transition={{ type: "spring", stiffness: 300, damping: 16 }}
              className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-green/[0.22] bg-green/10 text-green"
            >
              <fm.span
                initial={reduce ? undefined : { pathLength: 0, opacity: 0 }}
                whileInView={reduce ? undefined : { pathLength: 1, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ duration: 0.35, ease: EASE, delay: 0.12 }}
              >
                <Check className="h-5 w-5" />
              </fm.span>
            </fm.div>
            <p className="text-[13.5px] font-bold text-foreground">You're all caught up</p>
            <p className="text-[11.5px] text-muted-foreground">We'll notify you when something important happens.</p>
          </div>
        )}
      </div>
    </ScreenShell>
  );
}
