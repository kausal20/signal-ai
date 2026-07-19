// signal-ui-v2 · pages/SearchPage.tsx
// ---------------------------------------------------------------------------
// Search & Discovery — premium multi-section layout.
//
// Presentation order:
//   1. Sticky glass search bar (rotating placeholder, voice + clear)
//   2. Quick category chips (horizontal scroll)
//   3. Recent searches (client-only, localStorage)
//   4. Trending searches (2-col grid)
//   5. Suggested topics (premium glass cards)
//   6. Explore by goal + Featured collections + Browse sources (preserved)
//   7. Grouped search results (when a query is active)
//
// PRESENTATION ONLY. The Props contract, every handler, the search logic, the
// data, routing, and navigation are all unchanged. Recent-search history is
// stored locally in the browser (no backend, no API) purely as a UI aid.
// ---------------------------------------------------------------------------
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Search as SearchIcon, X, Mic, Clock, Trash2, TrendingUp, ArrowUpRight,
  Newspaper, FlaskConical, Play, Github, Brain, Cpu, Briefcase, Code2,
  Atom, Palette, HeartPulse, Wrench, DollarSign, GraduationCap,
  CircuitBoard, Target, RefreshCw, ChevronRight, Bookmark, Sparkles, HelpCircle,
} from "lucide-react";
import { AnimatePresence, motion as fm, useReducedMotion } from "framer-motion";
import { motionTokens } from "../animations/motion";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { SectionHeader } from "../components/SectionHeader";
import { CollectionCard } from "../components/CollectionCard";
import { SourceRow } from "../components/SourceRow";
import { FeedCard } from "../components/FeedCard";
import { CountUp } from "../components/CountUp";
import type { TrendingTerm, Collection, SourceSummary, SectionKey, Signal } from "../shared/types";

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
  loading?: boolean;
  error?: string | null;

  /** Set to "trending" when backend returned fallback content. */
  fallback?: string | null;
  /** Related search terms returned by the backend. */
  relatedTopics?: string[];
  /** "Did you mean" suggestions from the backend. */
  suggestions?: string[];

  onNavigate?: (s: SectionKey) => void;
  onSubmitTerm?: (term: string) => void;
  onSelectIntent?: (id: string) => void;
  onOpenCollection?: (id: string) => void;
  onOpenSource?: (key: string) => void;
  onOpenSignal?: (id: string) => void;
  onToggleSave?: (id: string) => void;
}

// ── Motion — spec: fade + translateY 12px, 0.22s, 60ms stagger ─────────────
const EASE = motionTokens.ease.premium;
const gridContainer = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } } };
const cardItem = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.22, ease: EASE } },
};

// ── Rotating placeholders (4s cadence) ─────────────────────────────────────
const PLACEHOLDERS = [
  "Search anything…", "Ask Signal…", "Research a topic…",
  "Find videos…", "Discover tools…", "Explore AI…",
];

// ── Quick category chips ───────────────────────────────────────────────────
const CATEGORIES: { label: string; Icon: typeof Newspaper }[] = [
  { label: "News", Icon: Newspaper }, { label: "Research", Icon: FlaskConical },
  { label: "Videos", Icon: Play }, { label: "GitHub", Icon: Github },
  { label: "AI Models", Icon: Brain }, { label: "Technology", Icon: Cpu },
  { label: "Business", Icon: Briefcase }, { label: "Programming", Icon: Code2 },
  { label: "Science", Icon: Atom }, { label: "Design", Icon: Palette },
  { label: "Health", Icon: HeartPulse }, { label: "Tools", Icon: Wrench },
];

// ── Suggested topics (premium cards) ───────────────────────────────────────
const TOPICS: { title: string; sub: string; Icon: typeof Cpu; tint: string }[] = [
  { title: "Technology", sub: "Hardware, chips, devices", Icon: Cpu, tint: "152 72% 48%" },
  { title: "Programming", sub: "Languages, frameworks", Icon: Code2, tint: "210 90% 60%" },
  { title: "Business", sub: "Startups, strategy", Icon: Briefcase, tint: "38 92% 55%" },
  { title: "Finance", sub: "Markets, funding", Icon: DollarSign, tint: "152 60% 50%" },
  { title: "AI", sub: "Models, agents, research", Icon: Brain, tint: "270 80% 68%" },
  { title: "Education", sub: "Courses, tutorials", Icon: GraduationCap, tint: "190 85% 55%" },
  { title: "Health", sub: "Bio, medicine, wellness", Icon: HeartPulse, tint: "0 75% 62%" },
  { title: "Science", sub: "Physics, space, discovery", Icon: Atom, tint: "220 70% 62%" },
];

// ── Empty-state quick suggestions ──────────────────────────────────────────
const QUICK_SUGGESTIONS = [
  "Latest AI News", "Startup Ideas", "React Animations", "Open Source",
  "Apple", "Tesla", "Machine Learning", "Cybersecurity",
];

// ── Intents (preserved — Explore by Goal) ──────────────────────────────────
const DEFAULT_INTENTS: Intent[] = [
  { id: "build", label: "Build AI Apps", sub: "Tools, frameworks and APIs", icon: <CircuitBoard className="h-5 w-5" /> },
  { id: "learn", label: "Learn AI", sub: "Courses, tutorials and guides", icon: <Brain className="h-5 w-5" /> },
  { id: "opportunity", label: "Discover Opportunities", sub: "AI startups, jobs and ideas", icon: <Target className="h-5 w-5" /> },
  { id: "catchup", label: "Today's AI Recap", sub: "Everything important in one place", icon: <RefreshCw className="h-5 w-5" /> },
];

// ── Recent-search persistence (client only) ────────────────────────────────
const RECENT_KEY = "signal:recentSearches";
type Recent = { term: string; t: number };
function readRecent(): Recent[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((r) => r && typeof r.term === "string").slice(0, 6) : [];
  } catch { return []; }
}
function timeAgo(t: number): string {
  const m = Math.floor((Date.now() - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

// ── Result grouping — real fields only (Saved + by tag) ────────────────────
const TAG_LABEL: Record<string, { label: string; Icon: typeof Newspaper }> = {
  research: { label: "Research", Icon: FlaskConical },
  news: { label: "News", Icon: Newspaper },
  models: { label: "AI Models", Icon: Brain },
  tools: { label: "Tools", Icon: Wrench },
  community: { label: "Community", Icon: Github },
};
function titleCase(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "Results";
}
interface Group { key: string; label: string; Icon: typeof Newspaper; items: Signal[]; }
function groupResults(results: Signal[]): Group[] {
  const saved = results.filter((r) => r.saved);
  const rest = results.filter((r) => !r.saved);
  const byTag = new Map<string, Signal[]>();
  for (const r of rest) {
    const k = r.tag || "results";
    (byTag.get(k) ?? byTag.set(k, []).get(k)!).push(r);
  }
  const groups: Group[] = [...byTag.entries()].map(([k, items]) => ({
    key: k,
    label: TAG_LABEL[k]?.label ?? titleCase(k),
    Icon: TAG_LABEL[k]?.Icon ?? Newspaper,
    items,
  }));
  groups.sort((a, b) => b.items.length - a.items.length);
  if (saved.length) groups.push({ key: "saved", label: "Saved", Icon: Bookmark, items: saved });
  return groups;
}

// ── Editorial section order + labels (entity search) ───────────────────────
const SECTION_ORDER: { key: string; label: string; sub?: string; Icon: typeof Newspaper }[] = [
  { key: "official",   label: "Official Company News", sub: "Genuine company events — funding, launches, partnerships, legal, research", Icon: Newspaper },
  { key: "analysis",   label: "Related Analysis",  sub: "Analysis and context about this company", Icon: TrendingUp },
  { key: "review",     label: "Reviews",           Icon: Sparkles },
  { key: "comparison", label: "Comparisons",       Icon: Target },
  { key: "tutorial",   label: "Tutorials",         Icon: GraduationCap },
  { key: "benchmark",  label: "Benchmarks",        Icon: FlaskConical },
  { key: "list",       label: "Lists & Roundups",  Icon: Wrench },
  { key: "repo",       label: "GitHub Projects",   Icon: Github },
  { key: "opinion",    label: "Opinions",          Icon: Brain },
  { key: "mentioned",  label: "Mentioned In",      sub: "Mentions this company but isn't primarily about it", Icon: SearchIcon },
];

// ═══════════════════════════════════════════════════════════════════════════
//  Memoized sub-components
// ═══════════════════════════════════════════════════════════════════════════
const CategoryChip = memo(function CategoryChip({
  label, Icon, active, reduce, onClick,
}: { label: string; Icon: typeof Newspaper; active: boolean; reduce: boolean; onClick: () => void }) {
  return (
    <fm.button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      whileHover={reduce ? undefined : { scale: 1.03 }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 380, damping: 24 }}
      className={[
        "flex h-[38px] shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[12.5px] font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-1 focus-visible:ring-offset-[#050505]",
        "transition-colors duration-200",
        active
          ? "border-green bg-green text-black"
          : "border-white/[0.08] bg-white/[0.04] text-foreground/80 hover:border-green/25 hover:text-green",
      ].join(" ")}
    >
      <Icon className="h-3.5 w-3.5" strokeWidth={2} />
      {label}
    </fm.button>
  );
});

const RecentCard = memo(function RecentCard({
  term, t, reduce, onSearch, onDelete,
}: { term: string; t: number; reduce: boolean; onSearch: () => void; onDelete: () => void }) {
  return (
    <fm.div
      variants={reduce ? undefined : cardItem}
      layout
      whileHover={reduce ? undefined : { x: 3 }}
      transition={{ type: "spring", stiffness: 340, damping: 26 }}
      className="group flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3.5 py-2.5"
    >
      <button
        type="button"
        onClick={onSearch}
        className="flex min-w-0 flex-1 items-center gap-3 text-left focus-visible:outline-none"
        aria-label={`Search ${term} again`}
      >
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.05] text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
        </span>
        <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground">{term}</span>
        <span className="shrink-0 text-[11px] text-muted-foreground/70">{timeAgo(t)}</span>
      </button>
      <button
        type="button"
        onClick={onDelete}
        aria-label={`Remove ${term} from recent searches`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted-foreground/50 transition-colors hover:bg-white/[0.06] hover:text-foreground active:scale-90"
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </fm.div>
  );
});

const TrendingCard = memo(function TrendingCard({
  term, reduce, onClick,
}: { term: TrendingTerm; reduce: boolean; onClick: () => void }) {
  return (
    <fm.button
      type="button"
      variants={reduce ? undefined : cardItem}
      onClick={onClick}
      whileHover={reduce ? undefined : { y: -4, scale: 1.02, borderColor: "hsl(152 72% 48% / 0.3)" }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="flex min-h-[76px] flex-col justify-between rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="line-clamp-2 text-[13.5px] font-bold leading-snug text-foreground">{term.term}</span>
        <TrendingUp className="h-4 w-4 shrink-0 text-green" strokeWidth={2.4} />
      </div>
      <div className="flex items-center gap-1.5">
        <span className="rounded-full bg-green/[0.12] px-2 py-0.5 text-[10px] font-bold text-green">
          #{term.rank}
        </span>
        <ArrowUpRight className="h-3 w-3 text-green/70" />
      </div>
    </fm.button>
  );
});

const TopicCard = memo(function TopicCard({
  title, sub, Icon, tint, reduce, onClick,
}: { title: string; sub: string; Icon: typeof Cpu; tint: string; reduce: boolean; onClick: () => void }) {
  return (
    <fm.button
      type="button"
      variants={reduce ? undefined : cardItem}
      onClick={onClick}
      whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      transition={{ type: "spring", stiffness: 320, damping: 24 }}
      className="relative flex min-h-[112px] flex-col items-start gap-2.5 overflow-hidden rounded-[20px] border border-white/[0.07] p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
      style={{ background: `linear-gradient(150deg, hsl(${tint} / 0.10), hsl(0 0% 100% / 0.015) 60%)` }}
    >
      <span
        className="flex h-10 w-10 items-center justify-center rounded-xl"
        style={{ background: `hsl(${tint} / 0.14)`, color: `hsl(${tint})` }}
      >
        <Icon className="h-5 w-5" strokeWidth={2} />
      </span>
      <div>
        <div className="text-[14px] font-bold text-foreground">{title}</div>
        <div className="mt-0.5 text-[11.5px] text-muted-foreground">{sub}</div>
      </div>
    </fm.button>
  );
});

// ═══════════════════════════════════════════════════════════════════════════
export function SearchPage({
  query, onQueryChange, placeholder, matchCount, sourcesTracked = "1,240",
  trending, collections, sources, intents = DEFAULT_INTENTS, bookmarkCount = 0,
  results = [], loading = false, error = null, fallback = null,
  relatedTopics = [], suggestions = [],
  onNavigate, onSubmitTerm, onSelectIntent, onOpenCollection,
  onOpenSource, onOpenSignal, onToggleSave,
}: Props) {
  const hasQuery = query.trim().length > 0;
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [focused, setFocused] = useState(false);
  const anim = reduce
    ? { initial: undefined as const, animate: undefined as const }
    : { initial: "hidden" as const, animate: "show" as const };

  // Rotating placeholder every 4s (idle only).
  const [phIdx, setPhIdx] = useState(0);
  useEffect(() => {
    if (reduce || hasQuery || focused) return;
    const id = setInterval(() => setPhIdx((i) => (i + 1) % PLACEHOLDERS.length), 4000);
    return () => clearInterval(id);
  }, [reduce, hasQuery, focused]);
  const placeholderText = placeholder && focused ? placeholder : PLACEHOLDERS[phIdx];

  // Recent searches (client-only).
  const [recent, setRecent] = useState<Recent[]>(() => (typeof localStorage !== "undefined" ? readRecent() : []));
  useEffect(() => {
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(recent.slice(0, 6))); } catch { /* ignore */ }
  }, [recent]);
  const recordRecent = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setRecent((prev) => [{ term: t, t: Date.now() }, ...prev.filter((r) => r.term.toLowerCase() !== t.toLowerCase())].slice(0, 6));
  }, []);

  // Submit wrapper — records history, then delegates to the unchanged handler.
  const submit = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    recordRecent(t);
    onSubmitTerm?.(t);
  }, [recordRecent, onSubmitTerm]);
  const deleteRecent = useCallback((term: string) => {
    setRecent((prev) => prev.filter((r) => r.term !== term));
  }, []);

  // Brief searching skeleton on query change (presentation only — data is
  // already computed synchronously; this smooths the transition).
  const [searching, setSearching] = useState(false);
  const isSearching = loading || searching;
  const [phase, setPhase] = useState(0);
  const PHASES = ["Searching", "Finding sources", "Ranking results", "Preparing response"];
  useEffect(() => {
    if (!hasQuery || reduce) { setSearching(false); return; }
    setSearching(true);
    setPhase(0);
    const step = setInterval(() => setPhase((p) => Math.min(p + 1, PHASES.length - 1)), 110);
    const done = setTimeout(() => setSearching(false), 460);
    return () => { clearInterval(step); clearTimeout(done); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, hasQuery, reduce]);

  // Active category = chip whose label matches the current query.
  const activeCategory = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORIES.find((c) => c.label.toLowerCase() === q)?.label ?? null;
  }, [query]);

  // Entity search returns an editorial `section` per result → Bloomberg-style
  // layout. "Official Company News" holds only genuine company events; the rest
  // fall into labelled lower sections. Keyword search has no section → by-tag.
  const entityMode = useMemo(() => results.some((r) => r.section), [results]);
  const groups = useMemo<(Group & { sub?: string })[]>(() => {
    if (entityMode) {
      const buckets = new Map<string, Signal[]>();
      for (const r of results) {
        const k = r.section || "analysis";
        (buckets.get(k) ?? buckets.set(k, []).get(k)!).push(r);
      }
      return SECTION_ORDER
        .filter((s) => buckets.has(s.key))
        .map((s) => ({ key: s.key, label: s.label, sub: s.sub, Icon: s.Icon, items: buckets.get(s.key)! }));
    }
    return groupResults(results);
  }, [entityMode, results]);
  const maxSourceCount = useMemo(
    () => Math.max(1, ...sources.map((s) => parseInt(s.count.replace(/[^0-9]/g, ""), 10) || 1)),
    [sources],
  );
  // Per-group "See All" expansion.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = useCallback((key: string) => {
    setExpanded((prev) => { const n = new Set(prev); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }, []);

  // ── STICKY HEADER: search bar + category chips ────────────────────────────
  const header = (
    <div className="bg-[linear-gradient(to_bottom,hsl(0_0%_2.5%/0.98)_82%,transparent)] px-[22px] pb-3 pt-[52px]">
      <div className="mx-auto w-full max-w-[920px]">
        {/* Brand line */}
        <div className="mb-3 flex items-center gap-2">
          <span className="relative flex h-[7px] w-[7px] shrink-0">
            <span className="absolute inset-0 animate-[pulse-dot_2.2s_ease-in-out_infinite] rounded-full bg-green shadow-[0_0_8px_hsl(152_72%_52%)]" />
          </span>
          <span className="text-[11.5px] font-semibold tracking-[0.02em] text-muted-foreground">Signal Radar · Live</span>
        </div>

        {/* Floating glass search bar */}
        <fm.div
          animate={reduce ? undefined : { scale: focused ? 1.02 : 1 }}
          transition={{ type: "spring", stiffness: 320, damping: 26 }}
          className={[
            "relative flex h-[58px] items-center gap-2 rounded-[20px] border px-3 sm:h-16 sm:px-4",
            "bg-white/[0.04] backdrop-blur-xl transition-[border-color,box-shadow] duration-200",
            focused
              ? "border-green/70 shadow-[0_0_0_3px_hsl(152_72%_48%/0.10),0_8px_30px_hsl(152_72%_48%/0.12)]"
              : "border-white/[0.08]",
          ].join(" ")}
        >
          <SearchIcon className={`h-5 w-5 shrink-0 transition-colors ${focused ? "text-green" : "text-muted-foreground"}`} />
          <input
            ref={inputRef}
            type="search"
            role="searchbox"
            aria-label="Search Signal"
            value={query}
            placeholder={placeholderText}
            onChange={(e) => onQueryChange?.(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && hasQuery) submit(query.trim());
              if (e.key === "Escape") { onQueryChange?.(""); (e.target as HTMLInputElement).blur(); }
            }}
            className="min-w-0 flex-1 bg-transparent text-[15px] font-medium text-foreground caret-green outline-none placeholder:font-normal placeholder:text-muted-foreground/55"
          />
          <div className="flex shrink-0 items-center gap-1">
            <AnimatePresence initial={false}>
              {hasQuery && (
                <fm.button
                  key="clear"
                  type="button"
                  aria-label="Clear search"
                  onClick={() => { onQueryChange?.(""); inputRef.current?.focus(); }}
                  initial={reduce ? undefined : { opacity: 0, scale: 0.6 }}
                  animate={reduce ? undefined : { opacity: 1, scale: 1 }}
                  exit={reduce ? undefined : { opacity: 0, scale: 0.6 }}
                  whileTap={reduce ? undefined : { scale: 0.85 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground hover:bg-white/[0.12] hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </fm.button>
              )}
            </AnimatePresence>
            <button
              type="button"
              aria-label="Voice search"
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.035] text-muted-foreground transition-colors hover:border-green/25 hover:text-green active:scale-90"
            >
              <Mic className="h-4 w-4" />
            </button>
          </div>
        </fm.div>

        {/* Quick category chips */}
        <div className="no-scrollbar -mx-[22px] mt-2.5 flex gap-2.5 overflow-x-auto px-[22px]" role="group" aria-label="Quick categories">
          {CATEGORIES.map((c) => (
            <CategoryChip
              key={c.label}
              label={c.label}
              Icon={c.Icon}
              active={activeCategory === c.label}
              reduce={!!reduce}
              onClick={() => submit(c.label)}
            />
          ))}
        </div>

        {/* Match count */}
        <AnimatePresence>
          {hasQuery && typeof matchCount === "number" && !isSearching && (
            <fm.div
              key="mc"
              initial={reduce ? { opacity: 1 } : { opacity: 0, height: 0 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, height: "auto" }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: EASE }}
              className="mt-2.5 flex items-center gap-2 overflow-hidden pl-0.5"
            >
              <span className="text-[12.5px] text-muted-foreground">
                <CountUp value={matchCount} duration={500} className="font-mono-tight font-bold text-green" />
                {" "}results for "<span className="font-medium text-foreground/80">{query}</span>"
              </span>
            </fm.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  // ── Loading skeleton (shimmer + phases) ───────────────────────────────────
  const skeleton = (
    <div className="flex flex-col gap-3" role="status" aria-live="polite">
      <div className="flex items-center gap-2 pb-1">
        <span className="h-2 w-2 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-green" />
        <span className="text-[12.5px] font-medium text-muted-foreground">{PHASES[phase]}…</span>
      </div>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="mb-3 flex items-center gap-2">
            <div className="motion-wave-shimmer h-5 w-5 rounded-md" />
            <div className="motion-wave-shimmer h-3 w-24 rounded" />
          </div>
          <div className="motion-wave-shimmer mb-2 h-4 w-[85%] rounded" />
          <div className="motion-wave-shimmer h-4 w-[55%] rounded" />
        </div>
      ))}
    </div>
  );

  // ── BODY ──────────────────────────────────────────────────────────────────
  return (
    <ScreenShell
      header={header}
      footer={<BottomNav active="search" bookmarkCount={bookmarkCount} onNavigate={onNavigate} />}
      bodyClassName="px-[22px] pb-28 pt-3"
      data-search-scroll
    >
      <div className="mx-auto w-full max-w-[920px]">
        <AnimatePresence mode="wait" initial={false}>
          {hasQuery ? (
            /* ═══ RESULTS ═══ */
            <fm.div
              key="results"
              initial={reduce ? undefined : { opacity: 0, y: 8 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -8 }}
              transition={{ duration: 0.22, ease: EASE }}
            >
              {isSearching ? (
                skeleton
              ) : groups.length > 0 ? (
                <div className="flex flex-col gap-8">
                  {/* ── Fallback banner: honest label when showing trending ── */}
                  {fallback === "trending" && (
                    <fm.div
                      initial={reduce ? undefined : { opacity: 0, y: 6 }}
                      animate={reduce ? undefined : { opacity: 1, y: 0 }}
                      transition={{ duration: 0.22, ease: EASE }}
                      className="flex items-center gap-2.5 rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3"
                    >
                      <Sparkles className="h-4 w-4 shrink-0 text-amber-400" />
                      <p className="text-[13px] leading-snug text-muted-foreground">
                        <span className="font-semibold text-foreground">No exact matches.</span>{" "}
                        Showing trending AI articles instead.
                      </p>
                    </fm.div>
                  )}

                  {/* ── Did you mean suggestions ── */}
                  {suggestions.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap">
                      <HelpCircle className="h-3.5 w-3.5 text-muted-foreground/70" />
                      <span className="text-[12px] text-muted-foreground">Did you mean:</span>
                      {suggestions.map((s) => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => onSubmitTerm?.(s)}
                          className="rounded-full border border-green/20 bg-green/[0.06] px-2.5 py-1 text-[12px] font-semibold text-green transition-colors hover:bg-green/[0.12] active:scale-95"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* ── Related Topics ── */}
                  {relatedTopics.length > 0 && (
                    <div className="flex flex-col gap-2">
                      <span className="text-[12.5px] font-semibold text-muted-foreground">Related Topics</span>
                      <div className="flex flex-wrap gap-2">
                        {relatedTopics.slice(0, 8).map((t) => (
                          <button
                            key={t}
                            type="button"
                            onClick={() => onSubmitTerm?.(t)}
                            className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-foreground/80 transition-colors hover:border-green/25 hover:text-green active:scale-95"
                          >
                            {t}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {groups.map((g, gi) => {
                    // Official Company News shows the FULL timeline by default
                    // (up to 12, then See all); every other section collapses to 3.
                    const isOfficial = g.key === "official";
                    const initial = isOfficial ? 12 : 3;
                    const isOpen = expanded.has(g.key);
                    const shown = isOpen ? g.items : g.items.slice(0, initial);
                    const GIcon = g.Icon;
                    const sub = (g as { sub?: string }).sub;
                    const isSecondary = entityMode && !isOfficial;
                    // A single divider separates Official Company News from everything below.
                    const firstSecondary = entityMode && isSecondary && groups.findIndex((x) => x.key !== "official") === gi;
                    return (
                      <section key={g.key}>
                        {firstSecondary && (
                          <div className="mb-6 flex items-center gap-3">
                            <div className="h-px flex-1 bg-white/[0.08]" />
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">Beyond company news</span>
                            <div className="h-px flex-1 bg-white/[0.08]" />
                          </div>
                        )}
                        <div className="mb-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <GIcon className={`h-[15px] w-[15px] ${isSecondary ? "text-muted-foreground" : "text-green"}`} strokeWidth={2.2} />
                              <h2 className="text-[15px] font-bold text-foreground">{g.label}</h2>
                              <span className="rounded-full bg-white/[0.06] px-1.5 py-0.5 text-[10.5px] font-bold text-muted-foreground">
                                {g.items.length}
                              </span>
                            </div>
                            {g.items.length > initial && (
                              <button
                                type="button"
                                onClick={() => toggleExpand(g.key)}
                                className="flex items-center gap-0.5 text-[12px] font-semibold text-green transition-opacity hover:opacity-80 active:scale-95"
                              >
                                {isOpen ? "Show less" : "See all"}
                                <ChevronRight className={`h-3.5 w-3.5 transition-transform ${isOpen ? "rotate-90" : ""}`} />
                              </button>
                            )}
                          </div>
                          {sub && <p className="mt-0.5 text-[12px] text-muted-foreground">{sub}</p>}
                        </div>
                        <fm.div variants={reduce ? undefined : gridContainer} {...anim} className="flex flex-col gap-2.5">
                          {shown.map((s) => (
                            <fm.div key={s.id} variants={reduce ? undefined : cardItem} layout>
                              <FeedCard signal={s} onOpen={onOpenSignal} onToggleSave={onToggleSave} />
                            </fm.div>
                          ))}
                        </fm.div>
                      </section>
                    );
                  })}
                </div>
              ) : (
                /* No results */
                <fm.div
                  initial={reduce ? undefined : { opacity: 0, y: 10 }}
                  animate={reduce ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: EASE }}
                  className="flex flex-col items-center px-4 py-16 text-center"
                >
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green/[0.08] text-green">
                    <SearchIcon className="h-6 w-6" />
                  </div>
                  <p className="text-[15px] font-bold text-foreground">{error ? "Search is temporarily unavailable" : "No archive matches yet"}</p>
                  <p className="mt-1.5 max-w-[260px] text-[13px] leading-relaxed text-muted-foreground">
                    {error ? "Signal could not reach the archive. The reason is available in the browser console." : "Try a different term or explore a trending topic below."}
                  </p>
                  <div className="mt-5 flex flex-wrap justify-center gap-2">
                    {trending.slice(0, 4).map((t) => (
                      <button
                        key={t.rank}
                        type="button"
                        onClick={() => submit(t.term)}
                        className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3.5 py-2 text-[12px] font-semibold text-foreground transition-colors hover:border-green/25 hover:text-green active:scale-95"
                      >
                        {t.term}
                      </button>
                    ))}
                  </div>
                </fm.div>
              )}
            </fm.div>
          ) : (
            /* ═══ DISCOVERY ═══ */
            <fm.div
              key="discovery"
              variants={reduce ? undefined : gridContainer}
              {...anim}
              exit={reduce ? undefined : { opacity: 0, y: -6 }}
              className="flex flex-col gap-9"
            >
              {/* Empty hero */}
              <fm.div variants={reduce ? undefined : cardItem} className="flex flex-col items-center pt-2 text-center">
                <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-[22px] border border-green/20 bg-green/[0.08] text-green">
                  <SearchIcon className="h-7 w-7" strokeWidth={1.8} />
                </div>
                <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-foreground">Search across everything</h1>
                <p className="mt-1.5 max-w-[300px] text-[13.5px] leading-relaxed text-muted-foreground">
                  News, videos, research, AI answers and more.
                </p>
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {QUICK_SUGGESTIONS.map((s) => (
                    <fm.button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      whileHover={reduce ? undefined : { scale: 1.04 }}
                      whileTap={reduce ? undefined : { scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 380, damping: 24 }}
                      className="rounded-full border border-white/[0.08] bg-white/[0.035] px-3 py-1.5 text-[12px] font-semibold text-foreground/80 hover:border-green/25 hover:text-green"
                    >
                      {s}
                    </fm.button>
                  ))}
                </div>
              </fm.div>

              {/* Recent searches — collapses when empty */}
              <AnimatePresence initial={false}>
                {recent.length > 0 && (
                  <fm.section
                    key="recent"
                    initial={reduce ? undefined : { opacity: 0, height: 0 }}
                    animate={reduce ? undefined : { opacity: 1, height: "auto" }}
                    exit={reduce ? undefined : { opacity: 0, height: 0 }}
                    transition={{ duration: 0.22, ease: EASE }}
                    className="overflow-hidden"
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <h2 className="text-[15px] font-bold text-foreground">Recent</h2>
                      <button
                        type="button"
                        onClick={() => setRecent([])}
                        className="text-[12px] font-semibold text-muted-foreground transition-colors hover:text-foreground active:scale-95"
                      >
                        Clear all
                      </button>
                    </div>
                    <fm.div variants={reduce ? undefined : gridContainer} {...anim} className="flex flex-col gap-2">
                      {recent.map((r) => (
                        <RecentCard
                          key={r.term}
                          term={r.term}
                          t={r.t}
                          reduce={!!reduce}
                          onSearch={() => submit(r.term)}
                          onDelete={() => deleteRecent(r.term)}
                        />
                      ))}
                    </fm.div>
                  </fm.section>
                )}
              </AnimatePresence>

              {/* Trending — 2-col grid */}
              {trending.length > 0 && (
                <fm.section variants={reduce ? undefined : cardItem}>
                  <SectionHeader
                    title="Trending Searches"
                    action={
                      <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
                        <span className="relative flex h-[5px] w-[5px]">
                          <span className="absolute inset-0 animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full bg-green" />
                        </span>
                        Live
                      </span>
                    }
                  />
                  <fm.div variants={reduce ? undefined : gridContainer} {...anim} className="grid grid-cols-2 gap-2.5">
                    {trending.map((t) => (
                      <TrendingCard key={t.rank} term={t} reduce={!!reduce} onClick={() => submit(t.term)} />
                    ))}
                  </fm.div>
                </fm.section>
              )}

              {/* Suggested topics — premium cards */}
              <fm.section variants={reduce ? undefined : cardItem}>
                <SectionHeader title="Suggested Topics" description="Explore what's moving in AI" />
                <fm.div variants={reduce ? undefined : gridContainer} {...anim} className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {TOPICS.map((t) => (
                    <TopicCard key={t.title} {...t} reduce={!!reduce} onClick={() => submit(t.title)} />
                  ))}
                </fm.div>
              </fm.section>

              {/* Explore by goal — preserved (onSelectIntent) */}
              <fm.section variants={reduce ? undefined : cardItem}>
                <SectionHeader title="Explore by Goal" description="Choose what you want to do" />
                <fm.div variants={reduce ? undefined : gridContainer} {...anim} className="grid grid-cols-2 gap-3">
                  {intents.map((it) => (
                    <fm.button
                      key={it.id}
                      type="button"
                      variants={reduce ? undefined : cardItem}
                      onClick={() => onSelectIntent?.(it.id)}
                      whileHover={reduce ? undefined : { y: -4, scale: 1.02 }}
                      whileTap={reduce ? undefined : { scale: 0.97 }}
                      transition={{ type: "spring", stiffness: 320, damping: 24 }}
                      className="mission-card flex min-h-[110px] flex-col items-start gap-2.5 p-4 text-left"
                    >
                      <span className="glow-orb">{it.icon}</span>
                      <div>
                        <div className="text-[13.5px] font-bold leading-snug text-foreground">{it.label}</div>
                        <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground">{it.sub}</div>
                      </div>
                    </fm.button>
                  ))}
                </fm.div>
              </fm.section>

              {/* Featured collections — preserved (onOpenCollection) */}
              {collections.length > 0 && (
                <fm.section variants={reduce ? undefined : cardItem}>
                  <SectionHeader title="Featured Collections" />
                  <div className="no-scrollbar -mx-[22px] flex snap-x snap-mandatory gap-3.5 overflow-x-auto px-[22px] pb-2">
                    {collections.map((c) => (
                      <fm.div
                        key={c.id}
                        whileHover={reduce ? undefined : { y: -5 }}
                        whileTap={reduce ? undefined : { scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 320, damping: 24 }}
                        className="rounded-2xl"
                      >
                        <CollectionCard collection={c} onClick={onOpenCollection} className="snap-start" />
                      </fm.div>
                    ))}
                  </div>
                </fm.section>
              )}

              {/* Browse sources — preserved (onOpenSource) */}
              {sources.length > 0 && (
                <fm.section variants={reduce ? undefined : cardItem}>
                  <SectionHeader title="Browse Sources" description="Trusted AI news and communities" />
                  <fm.div variants={reduce ? undefined : gridContainer} {...anim} className="flex flex-col gap-2">
                    {sources.map((s, i) => (
                      <fm.div
                        key={s.key}
                        variants={reduce ? undefined : cardItem}
                        whileHover={reduce ? undefined : { x: 3 }}
                        whileTap={reduce ? undefined : { scale: 0.985 }}
                        transition={{ type: "spring", stiffness: 340, damping: 26 }}
                      >
                        <SourceRow source={s} onClick={onOpenSource} maxCount={maxSourceCount} index={i} />
                      </fm.div>
                    ))}
                  </fm.div>
                </fm.section>
              )}
            </fm.div>
          )}
        </AnimatePresence>
      </div>
    </ScreenShell>
  );
}
