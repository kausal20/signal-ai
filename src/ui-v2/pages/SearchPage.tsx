// signal-ui-v2 · pages/SearchPage.tsx
// ---------------------------------------------------------------------------
// Search & Discovery — redesigned for first-time user understanding.
//
// Information hierarchy:
//   1. Hero Search (glass capsule, radar icon, page explanation)
//   2. Trending Today (compact leaderboard)
//   3. Explore by Goal (clear intent cards)
//   4. Featured Collections (horizontal scroll)
//   5. Browse Sources (premium logo cards)
//   6. Search Results (when query active)
//
// All backend logic, APIs, navigation, routing, state, and data structures
// are completely unchanged. This is a presentation-only redesign.
// ---------------------------------------------------------------------------
import { useEffect, useMemo, useState } from "react";
import {
  Search as SearchIcon, X,
  CircuitBoard, Brain, Target, RefreshCw,
} from "lucide-react";
import { AnimatePresence, motion as fm, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { SectionHeader } from "../components/SectionHeader";
import { SignalInput } from "../components/SignalInput";
import { TrendingTicker } from "../components/TrendingTicker";
import { CollectionCard } from "../components/CollectionCard";
import { SourceRow } from "../components/SourceRow";
import { FeedCard } from "../components/FeedCard";
import { CountUp } from "../components/CountUp";
import type { TrendingTerm, Collection, SourceSummary, SectionKey, Signal } from "../shared/types";

// Staggered mount — sections cascade in top→bottom.
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.03 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
};

interface Intent {
  id: string;
  label: string;
  sub: string;
  icon: React.ReactNode;
}

interface Props {
  /** Controlled query value. */
  query: string;
  onQueryChange?: (q: string) => void;
  /** Animated placeholder text (production drives the typewriter). */
  placeholder?: string;
  /** Live match count for the current query (production computes it). */
  matchCount?: number;
  sourcesTracked?: string;

  trending: TrendingTerm[];
  collections: Collection[];
  sources: SourceSummary[];
  intents?: Intent[];
  bookmarkCount?: number;

  /** Live results for the current query (production filters + maps). */
  results?: Signal[];

  onNavigate?: (s: SectionKey) => void;
  onSubmitTerm?: (term: string) => void;
  onSelectIntent?: (id: string) => void;
  onOpenCollection?: (id: string) => void;
  onOpenSource?: (key: string) => void;
  onOpenSignal?: (id: string) => void;
  onToggleSave?: (id: string) => void;
}

// ── Intent cards with clear, human-readable copy ───────────────────────────
const DEFAULT_INTENTS: Intent[] = [
  {
    id: "build",
    label: "Build AI Apps",
    sub: "Tools, frameworks and APIs",
    icon: <CircuitBoard className="h-5 w-5" />,
  },
  {
    id: "learn",
    label: "Learn AI",
    sub: "Courses, tutorials and guides",
    icon: <Brain className="h-5 w-5" />,
  },
  {
    id: "opportunity",
    label: "Discover Opportunities",
    sub: "AI startups, jobs and business ideas",
    icon: <Target className="h-5 w-5" />,
  },
  {
    id: "catchup",
    label: "Today's AI Recap",
    sub: "Everything important in one place",
    icon: <RefreshCw className="h-5 w-5" />,
  },
];

export function SearchPage({
  query, onQueryChange, placeholder, matchCount, sourcesTracked = "1,240",
  trending, collections, sources, intents = DEFAULT_INTENTS, bookmarkCount = 0,
  results = [], onNavigate, onSubmitTerm, onSelectIntent, onOpenCollection,
  onOpenSource, onOpenSignal, onToggleSave,
}: Props) {
  const hasQuery = query.trim().length > 0;
  const reduce = useReducedMotion();
  const V = reduce ? undefined : item;
  const anim = reduce
    ? { initial: undefined, animate: undefined }
    : { initial: "hidden" as const, animate: "show" as const };

  // Typewriter placeholder — rotates through examples when idle.
  const TYPE_LIST = useMemo(() => [
    "Search MCP…", "Search Claude…", "Search AI agents…", "Search open-source models…", "Search founder opportunities…",
  ], []);
  const [typed, setTyped] = useState("");
  useEffect(() => {
    if (reduce || hasQuery) { setTyped(placeholder ?? "Search AI topics..."); return; }
    let phraseIdx = 0, charIdx = 0, deleting = false, timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      const full = TYPE_LIST[phraseIdx % TYPE_LIST.length];
      if (!deleting) {
        charIdx++;
        setTyped(full.slice(0, charIdx));
        if (charIdx >= full.length) { deleting = true; timer = setTimeout(tick, 1400); return; }
      } else {
        charIdx--;
        setTyped(full.slice(0, charIdx));
        if (charIdx <= 0) { deleting = false; phraseIdx++; }
      }
      timer = setTimeout(tick, deleting ? 30 : 65);
    };
    timer = setTimeout(tick, 400);
    return () => clearTimeout(timer);
  }, [reduce, hasQuery, TYPE_LIST, placeholder]);

  // Scroll-linked header collapse — title shrinks + description fades.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const { scrollY } = useScroll({ container: scrollEl ? { current: scrollEl } as any : undefined });
  const titleScale = useTransform(scrollY, [0, 100], [1, 0.82]);
  const titleY = useTransform(scrollY, [0, 100], [0, -6]);
  const descOpacity = useTransform(scrollY, [0, 70], [1, 0]);
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-search-scroll]");
    if (el) setScrollEl(el);
  }, []);

  // Max source count for ring normalization
  const maxSourceCount = useMemo(() => {
    return Math.max(1, ...sources.map(s => parseInt(s.count.replace(/[^0-9]/g, ""), 10) || 1));
  }, [sources]);

  // ── HEADER: Hero search area ──────────────────────────────────────────
  const header = (
    <div className="relative overflow-hidden bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.97)_78%,transparent)] px-[22px] pb-5 pt-[52px]">
      {/* Radar sweep — always render (subtle ambient decoration; not motion-sickness scale) */}
      <fm.div
        aria-hidden
        className="pointer-events-none absolute -top-24 left-1/2 -z-10 h-[320px] w-[320px] -translate-x-1/2 rounded-full opacity-40"
        style={{ background: "conic-gradient(from 0deg, hsl(152 72% 48% / 0.30), transparent 30%, hsl(152 72% 48% / 0.22) 60%, transparent 90%)" }}
        animate={{ rotate: 360 }}
        transition={{ duration: 18, repeat: Infinity, ease: "linear" }}
      />
      <fm.div
        aria-hidden
        className="pointer-events-none absolute -top-6 left-1/2 -z-10 h-44 w-[90%] -translate-x-1/2 rounded-full bg-green/[0.18] blur-3xl"
        animate={{ opacity: [0.4, 0.75, 0.4], scale: [0.95, 1.05, 0.95] }}
        transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {[0, 1, 2].map((i) => (
        <fm.span
          key={i}
          aria-hidden
          className="pointer-events-none absolute left-[22px] top-[92px] -z-10 h-8 w-8 rounded-full border border-green/40"
          animate={{ scale: [1, 3.4, 3.4], opacity: [0.65, 0, 0] }}
          transition={{ duration: 3, repeat: Infinity, delay: i * 1, ease: "easeOut" }}
        />
      ))}

      {/* Live indicator */}
      <fm.div
        initial={reduce ? undefined : { opacity: 0, y: -4 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="mb-3 flex items-center gap-2"
      >
        <span className="relative flex h-[7px] w-[7px] shrink-0">
          <span className="absolute inset-0 animate-[pulse-dot_2.2s_ease-in-out_infinite] rounded-full bg-green shadow-[0_0_8px_hsl(152_72%_52%)]" />
        </span>
        <span className="text-[11.5px] font-medium text-muted-foreground">
          Live AI Intelligence
        </span>
      </fm.div>

      {/* Page title — scroll-collapse + gradient text + shimmer sweep */}
      <fm.h1
        style={reduce ? undefined : { scale: titleScale, y: titleY, transformOrigin: "left top" }}
        className="relative mb-1.5 inline-block text-[28px] font-extrabold tracking-[-0.03em] leading-tight"
      >
        <span className="bg-[linear-gradient(90deg,#fff_0%,#fff_45%,hsl(152_72%_58%)_55%,#fff_65%,#fff_100%)] bg-[length:200%_100%] bg-clip-text text-transparent"
          style={{ backgroundPosition: reduce ? "0% 0%" : undefined, animation: reduce ? undefined : "shimmer 3.2s linear infinite" }}
        >
          Signal Radar
        </span>
      </fm.h1>

      {/* Page description — fades on scroll */}
      <fm.p
        style={reduce ? undefined : { opacity: descOpacity }}
        className="mb-5 max-w-[320px] text-[13.5px] leading-relaxed text-muted-foreground"
      >
        Search across AI news, tools, prompts, models and startups.
      </fm.p>

      {/* Search capsule */}
      <fm.div
        whileHover={reduce ? undefined : { scale: 1.008 }}
        whileFocus={reduce ? undefined : { scale: 1.015 }}
        transition={{ type: "spring", stiffness: 320, damping: 26 }}
        className="relative"
      >
        <SignalInput
          active={hasQuery}
          value={query}
          placeholder={hasQuery ? "" : (typed || placeholder || "Search AI topics...")}
          onChange={(e) => onQueryChange?.(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && hasQuery && onSubmitTerm?.(query.trim())}
          iconRight={
            hasQuery ? (
              <fm.button
                type="button"
                aria-label="Clear search"
                onClick={() => onQueryChange?.("")}
                whileTap={{ scale: 0.85, rotate: 90 }}
                whileHover={reduce ? undefined : { scale: 1.08 }}
                transition={{ type: "spring", stiffness: 400, damping: 20 }}
                className="flex h-6 w-6 items-center justify-center rounded-full bg-white/[0.08] text-muted-foreground hover:bg-white/[0.14]"
              >
                <X className="h-3.5 w-3.5" />
              </fm.button>
            ) : undefined
          }
        />
      </fm.div>

      {/* Match count — count-up + slide-in */}
      <AnimatePresence>
        {hasQuery && typeof matchCount === "number" && (
          <fm.div
            key="mc"
            initial={reduce ? { opacity: 1 } : { opacity: 0, y: -4, height: 0 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, height: "auto" }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, height: 0 }}
            transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
            className="mt-3 flex items-center gap-2 overflow-hidden pl-1"
          >
            <span className="relative flex h-[5px] w-[5px]">
              <span className="absolute inset-0 animate-[pulse-dot_1.5s_ease-in-out_infinite] rounded-full bg-green" />
            </span>
            <span className="text-[12.5px] text-muted-foreground">
              <CountUp value={matchCount} duration={550} className="font-mono-tight font-bold text-green" />
              {" "}results for "<span className="font-medium text-foreground/80">{query}</span>"
            </span>
          </fm.div>
        )}
      </AnimatePresence>
    </div>
  );

  // ── PAGE BODY ─────────────────────────────────────────────────────────
  return (
    <ScreenShell
      header={header}
      footer={<BottomNav active="search" bookmarkCount={bookmarkCount} onNavigate={onNavigate} />}
      bodyClassName="px-[22px] pb-28 pt-2"
      data-search-scroll
    >
      <AnimatePresence mode="wait" initial={false}>
        {hasQuery ? (
          /* ── SEARCH RESULTS ─────────────────────────────────────────── */
          <fm.section
            key="results"
            initial={reduce ? undefined : { opacity: 0, y: 8 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <SectionHeader title="Search Results" />
            {results.length > 0 ? (
              <fm.div variants={reduce ? undefined : container} {...anim} className="flex flex-col gap-2.5">
                {results.map((s) => (
                  <fm.div key={s.id} variants={V} layout>
                    <FeedCard signal={s} onOpen={onOpenSignal} onToggleSave={onToggleSave} />
                  </fm.div>
                ))}
              </fm.div>
            ) : (
              <fm.div
                initial={reduce ? undefined : { opacity: 0, y: 10 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                transition={{ duration: 0.35 }}
                className="flex flex-col items-center px-4 py-14 text-center"
              >
                <fm.div
                  animate={reduce ? undefined : { y: [0, -4, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
                  className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green/[0.08] text-green"
                >
                  <SearchIcon className="h-6 w-6" />
                </fm.div>
                <p className="text-[15px] font-bold text-foreground">No results found</p>
                <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">
                  Try a different search term, or explore a trending topic below.
                </p>
                <fm.div variants={reduce ? undefined : container} {...anim} className="mt-5 flex flex-wrap justify-center gap-2">
                  {trending.slice(0, 4).map((t) => (
                    <fm.button
                      key={t.rank}
                      type="button"
                      variants={V}
                      onClick={() => onSubmitTerm?.(t.term)}
                      whileTap={{ scale: 0.9 }}
                      whileHover={reduce ? undefined : { y: -2, scale: 1.04 }}
                      transition={{ type: "spring", stiffness: 380, damping: 22 }}
                      className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-foreground hover:border-green/20 hover:text-green"
                    >
                      {t.term}
                    </fm.button>
                  ))}
                </fm.div>
              </fm.div>
            )}
          </fm.section>
        ) : (
          <fm.div
            key="discovery"
            variants={reduce ? undefined : container}
            {...anim}
            exit={reduce ? undefined : { opacity: 0, y: -6 }}
            transition={{ duration: 0.28 }}
          >
            {/* ── 1. TRENDING TODAY — Horizontal Scroll Ticker ──────── */}
            <fm.section variants={V} className="mb-9">
              <SectionHeader
                title="Trending Today"
                action={
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                    <span className="relative flex h-[5px] w-[5px]">
                      <span className="absolute inset-0 animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full bg-green" />
                    </span>
                    Live
                  </span>
                }
              />
              <TrendingTicker trending={trending} onSelect={onSubmitTerm} />
            </fm.section>

            {/* ── 2. EXPLORE BY GOAL — animated sheen + hover lift + icon bounce ── */}
            <fm.section variants={V} className="mb-9">
              <SectionHeader title="Explore by Goal" description="Choose what you want to do" />
              <fm.div variants={reduce ? undefined : container} {...anim} className="grid grid-cols-2 gap-3">
                {intents.map((it, idx) => (
                  <fm.button
                    key={it.id}
                    type="button"
                    variants={V}
                    onClick={() => onSelectIntent?.(it.id)}
                    whileTap={{ scale: 0.97, rotateX: 2 }}
                    whileHover={reduce ? undefined : { y: -5, scale: 1.02 }}
                    transition={{ type: "spring", stiffness: 320, damping: 22 }}
                    style={{ transformStyle: "preserve-3d", transformPerspective: 700 }}
                    className="mission-card group relative flex min-h-[120px] flex-col items-start gap-2.5 overflow-hidden p-4 text-left"
                  >
                    {/* Animated top sheen bar — always renders (subtle) */}
                    <fm.span
                      aria-hidden
                      className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-green to-transparent opacity-80"
                      initial={{ x: "-100%" }}
                      animate={{ x: "100%" }}
                      transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut", delay: idx * 0.35 }}
                    />
                    {/* Corner glow that pulses */}
                    <fm.span
                      aria-hidden
                      className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-green/[0.18] blur-2xl"
                      animate={{ opacity: [0.35, 0.75, 0.35], scale: [0.9, 1.1, 0.9] }}
                      transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut", delay: idx * 0.4 }}
                    />
                    <fm.span
                      className="glow-orb relative"
                      whileHover={reduce ? undefined : { rotate: [0, -8, 8, 0], scale: 1.12 }}
                      transition={{ duration: 0.5 }}
                    >
                      {it.icon}
                    </fm.span>
                    <div>
                      <div className="text-[13.5px] font-bold text-foreground leading-snug">{it.label}</div>
                      <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{it.sub}</div>
                    </div>
                  </fm.button>
                ))}
              </fm.div>
            </fm.section>

            {/* ── 3. FEATURED COLLECTIONS — 3D press + lift on hover ── */}
            {collections.length > 0 && (
              <fm.section variants={V} className="mb-9">
                <SectionHeader title="Featured Collections" />
                <div className="no-scrollbar -mx-[22px] flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-[22px] pb-2">
                  {collections.map((c) => (
                    <fm.div
                      key={c.id}
                      whileTap={{ scale: 0.94, rotateX: 4 }}
                      whileHover={reduce ? undefined : { y: -6, boxShadow: "0 18px 44px hsl(152 72% 48% / 0.20)" }}
                      transition={{ type: "spring", stiffness: 320, damping: 22 }}
                      style={{ transformStyle: "preserve-3d", transformPerspective: 600 }}
                      className="rounded-2xl"
                    >
                      <CollectionCard collection={c} onClick={onOpenCollection} className="snap-start" />
                    </fm.div>
                  ))}
                </div>
              </fm.section>
            )}

            {/* ── 4. BROWSE SOURCES — row slide-in cascade ────────────── */}
            <fm.section variants={V}>
              <SectionHeader title="Browse Sources" description="Trusted AI news and communities" />
              <fm.div variants={reduce ? undefined : container} {...anim} className="flex flex-col gap-2">
                {sources.map((s, i) => (
                  <fm.div
                    key={s.key}
                    variants={V}
                    whileTap={{ scale: 0.985 }}
                    whileHover={reduce ? undefined : { x: 3 }}
                    transition={{ type: "spring", stiffness: 340, damping: 24 }}
                  >
                    <SourceRow source={s} onClick={onOpenSource} maxCount={maxSourceCount} index={i} />
                  </fm.div>
                ))}
              </fm.div>
            </fm.section>
          </fm.div>
        )}
      </AnimatePresence>
    </ScreenShell>
  );
}
