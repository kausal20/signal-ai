// signal-ui-v2 · pages/HomePage.tsx
// ---------------------------------------------------------------------------
// Home / daily briefing. Pure layout: every list comes from props. Renders a
// live pulse, a hero recommendation, a swipeable brief rail, a numbered
// top-signals list, category tabs, and the quiet feed.
//
// Replaces production: pages/Index.tsx body + HeroOpportunity + DailyBrief +
// TopSignals + FeedCard list + CategoryTabs.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { Check, ChevronRight } from "lucide-react";
import { motion as fm, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { LivePulse } from "../components/LivePulse";
import { SectionHeader } from "../components/SectionHeader";
import { RecommendationCard } from "../components/RecommendationCard";
import { ProjectCard } from "../components/ProjectCard";
import { FeedCard } from "../components/FeedCard";
import { SignalScoreChip } from "../components/SignalScoreRing";
import { CountUp } from "../components/CountUp";
import { BrandLogo } from "../icons/BrandLogo";
import type { Recommendation, Signal, SectionKey, UserProfile, Project } from "../shared/types";

interface CategoryTab {
  id: string;
  label: string;
}

// Staggered entrance — sections cascade in on mount.
const container: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.065, delayChildren: 0.04 } },
};
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.42, ease: [0.22, 1, 0.36, 1] } },
};

interface Props {
  profile: UserProfile;
  /** e.g. "4 things worth your time today · 6 min read". */
  briefSummary?: string;
  livePulseLabel?: React.ReactNode;
  hero?: Recommendation;    // omitted when a filtered category has no top pick
  emptyLabel?: string;      // shown when nothing matches the active category
  brief: Signal[];          // swipeable rail
  topSignals: Signal[];     // numbered list
  feed: Signal[];           // quiet cards
  categories?: CategoryTab[];
  activeCategory?: string;
  bookmarkCount?: number;
  /** "Continue Building" — omitted when there is no active project. */
  project?: Project | null;

  onNavigate?: (s: SectionKey) => void;
  onOpenProfile?: () => void;
  onSelectCategory?: (id: string) => void;
  onOpenSignal?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  onStartHero?: (id: string) => void;
  onToggleHeroSave?: (id: string) => void;
  onContinueProject?: (id: string) => void;
}

export function HomePage({
  profile, briefSummary, livePulseLabel = "3 critical signals in the last hour",
  hero, emptyLabel, brief, topSignals, feed, categories = [], activeCategory,
  bookmarkCount = 0, project, onNavigate, onOpenProfile, onSelectCategory,
  onOpenSignal, onToggleSave, onStartHero, onToggleHeroSave, onContinueProject,
}: Props) {
  const nothingToShow = !hero && brief.length === 0 && topSignals.length === 0 && feed.length === 0;
  const reduce = useReducedMotion();
  const anim = reduce
    ? { initial: undefined, animate: undefined, variants: undefined }
    : { initial: "hidden" as const, animate: "show" as const };
  // When reduced-motion is on, don't apply the stagger `hidden` variant to
  // children (they'd stay at opacity 0 since we skip the animate transition).
  const V = reduce ? undefined : item;

  // Scroll-driven collapse: the greeting shrinks + the profile chip snaps to
  // the top edge as the user scrolls, freeing space for the feed.
  const [scrollEl, setScrollEl] = useState<HTMLElement | null>(null);
  const { scrollY } = useScroll({ container: scrollEl ? { current: scrollEl } as any : undefined });
  const greetingScale = useTransform(scrollY, [0, 90], [1, 0.78]);
  const greetingY = useTransform(scrollY, [0, 90], [0, -8]);
  const subOpacity = useTransform(scrollY, [0, 60], [1, 0]);
  const critical =
    typeof livePulseLabel === "string"
      ? Number((livePulseLabel.match(/(\d+)/) ?? [])[1] ?? NaN)
      : NaN;

  const header = (
    <div className="relative">
      {/* Ambient glow behind the greeting — softly breathes. */}
      {!reduce && (
        <fm.div
          aria-hidden
          className="pointer-events-none absolute -top-8 left-1/2 -z-10 h-40 w-[80%] -translate-x-1/2 rounded-full bg-green/[0.10] blur-3xl"
          animate={{ opacity: [0.25, 0.55, 0.25] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
        />
      )}
      <div className="bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_60%,transparent)] px-[22px] pb-3.5 pt-[52px] backdrop-blur">
        <div className="mb-3.5 flex items-center justify-between">
          <LivePulse bare label="Updated just now" />
          <fm.button
            type="button"
            onClick={onOpenProfile}
            aria-label="Open profile"
            whileTap={{ scale: 0.9 }}
            whileHover={reduce ? undefined : { scale: 1.06 }}
            className="flex h-[34px] w-[34px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-[13px] font-bold text-green"
          >
            {profile.initials ?? profile.name.slice(0, 1).toUpperCase()}
          </fm.button>
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
  );

  // Hook the ScreenShell scroll container so scroll-linked motion fires.
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("[data-home-scroll]");
    if (el) setScrollEl(el);
  }, []);

  return (
    <ScreenShell header={header} footer={<BottomNav active="home" bookmarkCount={bookmarkCount} onNavigate={onNavigate} />} bodyClassName="px-[22px] pb-24 pt-1.5" data-home-scroll>
      <fm.div variants={reduce ? undefined : container} {...anim}>
        <fm.div variants={V}>
          <LivePulse
            className="mb-6"
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
        </fm.div>

        {/* HERO — bigger, edge-to-edge halo + slow breathing so it feels alive */}
        {hero && (
          <fm.section variants={V} className="mb-8">
            <SectionHeader title="Today's best opportunity" />
            <div className="relative -mx-[22px] px-[22px]">
              {!reduce && (
                <>
                  {/* wide green halo bleeding past the card */}
                  <fm.div
                    aria-hidden
                    className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[110%] bg-[radial-gradient(80%_60%_at_50%_30%,hsl(152_72%_48%/0.22),transparent_70%)]"
                    animate={{ opacity: [0.55, 0.85, 0.55] }}
                    transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
                  />
                  {/* subtle rotating conic sheen */}
                  <fm.div
                    aria-hidden
                    className="pointer-events-none absolute inset-4 -z-10 rounded-[28px] opacity-30 blur-2xl"
                    style={{ background: "conic-gradient(from 0deg, hsl(152 72% 48% / 0.20), transparent 40%, hsl(152 72% 48% / 0.15))" }}
                    animate={{ rotate: 360 }}
                    transition={{ duration: 22, repeat: Infinity, ease: "linear" }}
                  />
                </>
              )}
              <fm.div
                whileHover={reduce ? undefined : { y: -2 }}
                transition={{ type: "spring", stiffness: 300, damping: 22 }}
              >
                <RecommendationCard
                  recommendation={hero}
                  eyebrow="Build opportunity"
                  onStart={onStartHero}
                  onToggleSave={onToggleHeroSave}
                />
              </fm.div>
            </div>
          </fm.section>
        )}

        {/* CONTINUE BUILDING — only when there's an active project */}
        {project && (
          <fm.section variants={V} className="mb-7">
            <SectionHeader title="Continue building" />
            <ProjectCard project={project} onContinue={onContinueProject} />
          </fm.section>
        )}

        {/* BRIEF RAIL — 3D press + subtle peek of the next card so it invites swiping */}
        {brief.length > 0 && (
          <fm.section variants={V} className="mb-8">
            <SectionHeader title="Today's brief · swipe" action={<span className="text-[10px] font-semibold text-muted-foreground/70">{brief.length}</span>} />
            <div className="no-scrollbar -mx-[22px] flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-[22px] pb-1 [scroll-padding:22px]">
              {brief.map((s, i) => (
                <fm.button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSignal?.(s.id)}
                  whileTap={{ scale: 0.94, rotateX: 4 }}
                  whileHover={reduce ? undefined : { y: -4, boxShadow: "0 14px 40px hsl(152 72% 48% / 0.18)" }}
                  transition={{ type: "spring", stiffness: 320, damping: 22 }}
                  style={{ transformStyle: "preserve-3d", transformPerspective: 600 }}
                  variants={V}
                  custom={i}
                  className="w-[178px] shrink-0 snap-start rounded-2xl border border-white/[0.07] bg-white/[0.035] p-3.5 text-left"
                >
                  <div className="mb-2.5 flex items-center justify-between">
                    <span className="flex items-center gap-1.5 font-mono-tight text-[9px] font-bold tracking-[0.12em] text-green">
                      {s.sourceKey && <BrandLogo source={s.sourceKey} name={s.source} size={12} />}
                      {s.source}
                    </span>
                    <SignalScoreChip score={s.score} />
                  </div>
                  <div className="text-[13px] font-semibold leading-snug text-foreground/90 line-clamp-3">{s.title}</div>
                </fm.button>
              ))}
              {/* trailing arrow hint */}
              <div className="flex w-6 shrink-0 snap-end items-center text-muted-foreground/40">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
          </fm.section>
        )}

        {/* TOP SIGNALS — vertical NUMBERED TIMELINE connecting the ranked stories */}
        {topSignals.length > 0 && (
          <fm.section variants={V} className="mb-8">
            <SectionHeader title="Top signals" />
            <div className="relative">
              {/* the vertical spine */}
              <div className="pointer-events-none absolute left-[13px] top-2 bottom-2 w-px bg-gradient-to-b from-green/50 via-white/[0.06] to-transparent" />
              {topSignals.map((s, i) => (
                <fm.button
                  key={s.id}
                  type="button"
                  onClick={() => onOpenSignal?.(s.id)}
                  whileTap={{ scale: 0.985 }}
                  whileHover={reduce ? undefined : { x: 4 }}
                  transition={{ type: "spring", stiffness: 340, damping: 24 }}
                  className="group relative flex w-full items-start gap-3 py-[14px] pl-9 pr-1 text-left"
                >
                  {/* node dot on the spine */}
                  <fm.span
                    aria-hidden
                    className="absolute left-[6px] top-[18px] flex h-[15px] w-[15px] items-center justify-center rounded-full border border-green/40 bg-background"
                    animate={reduce ? undefined : { boxShadow: [
                      "0 0 0 0 hsl(152 72% 48% / 0.45)",
                      "0 0 0 6px hsl(152 72% 48% / 0)",
                    ] }}
                    transition={{ duration: 2.2, repeat: Infinity, ease: "easeOut", delay: i * 0.35 }}
                  >
                    <span className="h-[6px] w-[6px] rounded-full bg-green shadow-[0_0_6px_hsl(152_72%_52%)]" />
                  </fm.span>
                  {/* rank */}
                  <span className="absolute left-6 top-[10px] font-mono-tight text-[10px] font-bold text-white/25">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1 border-b border-white/[0.05] pb-[14px] pt-3 group-last:border-b-0">
                    <div className="mb-1 flex items-center gap-1.5">
                      <span className="flex items-center gap-1.5 font-mono-tight text-[9px] font-bold tracking-[0.12em] text-green">
                        {s.sourceKey && <BrandLogo source={s.sourceKey} name={s.source} size={12} />}
                        {s.source}
                      </span>
                      {s.timeAgo && (
                        <>
                          <span className="h-[2.5px] w-[2.5px] rounded-full bg-white/25" />
                          <span className="text-[9px] font-semibold text-muted-foreground">{s.timeAgo}</span>
                        </>
                      )}
                    </div>
                    <div className="text-sm font-semibold leading-snug text-foreground/95">{s.title}</div>
                  </div>
                  <span className="mt-3 shrink-0 font-mono-tight text-[13px] font-bold text-green">
                    <CountUp value={s.score} duration={800 + i * 120} />
                  </span>
                </fm.button>
              ))}
            </div>
          </fm.section>
        )}

        {/* CATEGORY TABS — animated active pill with shared layoutId */}
        {categories.length > 0 && (
          <fm.div variants={V} className="no-scrollbar -mx-[22px] mb-4 flex gap-2 overflow-x-auto px-[22px]">
            {categories.map((c) => {
              const on = c.id === activeCategory;
              return (
                <fm.button
                  key={c.id}
                  type="button"
                  onClick={() => onSelectCategory?.(c.id)}
                  whileTap={{ scale: 0.92 }}
                  className={`relative shrink-0 whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                    on ? "border-green text-black" : "border-white/[0.08] text-muted-foreground"
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

        {/* QUIET FEED — staggered cards */}
        {feed.length > 0 && (
          <fm.div variants={V}>
            <SectionHeader title="Today's feed" />
            <fm.div variants={container} className="flex flex-col gap-2.5">
              {feed.map((s) => (
                <fm.div key={s.id} variants={V}>
                  <FeedCard signal={s} onOpen={onOpenSignal} onToggleSave={onToggleSave} />
                </fm.div>
              ))}
            </fm.div>
          </fm.div>
        )}

        {nothingToShow ? (
          <fm.div variants={V} className="flex flex-col items-center px-6 py-16 text-center">
            <p className="text-[13.5px] font-bold text-foreground">{emptyLabel ?? "Nothing here yet"}</p>
            <p className="text-[11.5px] text-muted-foreground">Try another category.</p>
          </fm.div>
        ) : (
          <fm.div variants={V} className="flex flex-col items-center px-6 py-9 text-center">
            <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-green/[0.22] bg-green/10 text-green">
              <Check className="h-5 w-5" />
            </div>
            <p className="text-[13.5px] font-bold text-foreground">You're all caught up</p>
            <p className="text-[11.5px] text-muted-foreground">We'll ping you when something big breaks.</p>
          </fm.div>
        )}
      </fm.div>
    </ScreenShell>
  );
}
