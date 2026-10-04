// signal-ui-v2 · pages/WeeklyPage.tsx
// ---------------------------------------------------------------------------
// Weekly Report — presentation swap only. Same data (stats/level/bookmarks/
// advisor from usePersonalizedFeed), same derived values, computed by the
// parent (pages/Weekly.tsx) and passed down as props — same split as
// AdvisorPage/SettingsPage, since this data is shared app state, not a
// page-private module (unlike Prompt Library's self-contained lib/prompts.ts).
//
// Replaces production: pages/Weekly.tsx.
// ---------------------------------------------------------------------------
import { ChevronLeft, ChevronRight, BookOpen, Clock, Flame, Bookmark, Rocket, Award, TrendingUp } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { SectionHeader } from "../components/SectionHeader";
import { SignalScoreRing } from "../components/SignalScoreRing";
import { SignalProgress } from "../components/SignalProgress";
import { InterestChip } from "../components/InterestChip";
import { SignalBadge } from "../components/SignalBadge";
import { motionTokens, viewportOnce } from "../animations/motion";
import type { SectionKey } from "../shared/types";

interface Props {
  level: number;
  levelLabel: string;
  levelPct: number;
  weekScore: number;
  weekRead: number;
  hoursSaved: string;
  streak: number;
  savedCount: number;
  topInterests: string[];
  opportunity?: { title: string; explanation?: string };
  bookmarkCount?: number;
  onNavigate?: (s: SectionKey) => void;
  onBack?: () => void;
  onOpenAdvisor?: () => void;
}

export function WeeklyPage({
  level, levelLabel, levelPct, weekScore, weekRead, hoursSaved, streak, savedCount,
  topInterests, opportunity, bookmarkCount = 0, onNavigate, onBack, onOpenAdvisor,
}: Props) {
  const reduce = useReducedMotion();
  const sectionAnim = reduce
    ? {}
    : {
        initial: { opacity: 0, y: 12 } as const,
        whileInView: { opacity: 1, y: 0 } as const,
        viewport: viewportOnce,
        transition: { duration: motionTokens.duration.section, ease: motionTokens.ease.premium },
      };

  const header = (
    <div className="flex items-center gap-3.5 bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_72%,transparent)] px-5 pb-3 pt-12">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-foreground/80 transition-transform active:scale-90"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div>
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-green">
          <Award className="h-3.5 w-3.5" /> Weekly Report
        </p>
        <h1 className="mt-0.5 text-xl font-extrabold tracking-[-0.02em] text-foreground">Your week in AI</h1>
      </div>
    </div>
  );

  return (
    <ScreenShell
      header={header}
      footer={<BottomNav active="home" bookmarkCount={bookmarkCount} onNavigate={onNavigate} />}
      bodyClassName="px-[22px] pb-28 pt-3"
    >
      <div className="mx-auto w-full max-w-2xl">
        <p className="mb-[22px] text-[13px] text-muted-foreground">Signal Level {level} · {levelLabel}</p>

        {/* Weekly Signal Score */}
        <fm.section {...sectionAnim} className="mb-[30px] rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
          <div className="flex items-center gap-5">
            <SignalScoreRing score={weekScore} size={80} showLabel className="shrink-0" />
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">Weekly Signal Score</p>
              <p className="mt-0.5 text-[12px] leading-relaxed text-muted-foreground">
                Built from stories read, items saved, and your streak. Keep showing up to level up.
              </p>
            </div>
          </div>
          <SignalProgress value={levelPct} className="mt-4" valueLabel={`${levelPct}% to Level ${level + 1}`} />
        </fm.section>

        {/* Stat grid */}
        <fm.section {...sectionAnim} className="mb-[30px] grid grid-cols-2 gap-3">
          <Stat icon={<BookOpen className="h-4 w-4" />} value={weekRead} label="Stories read this week" />
          <Stat icon={<Clock className="h-4 w-4" />} value={`${hoursSaved}h`} label="Time saved (est.)" />
          <Stat icon={<Flame className="h-4 w-4" />} value={streak} label="Day reading streak" />
          <Stat icon={<Bookmark className="h-4 w-4" />} value={savedCount} label="Saved tools & ideas" />
        </fm.section>

        {/* Top topics */}
        <fm.section {...sectionAnim} className="mb-[30px]">
          <SectionHeader title="Your top topics" />
          {topInterests.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topInterests.slice(0, 8).map((t) => (
                <InterestChip key={t} label={String(t).replace(/_/g, " ")} readOnly />
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Read a few more stories to reveal your topic profile.</p>
          )}
        </fm.section>

        {/* Most valuable opportunity */}
        <fm.section {...sectionAnim} className="mb-[30px] rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
          <SignalBadge tone="green" icon={<Rocket className="h-3 w-3" />} className="mb-3">Most valuable opportunity</SignalBadge>
          <h3 className="text-[15px] font-bold leading-snug text-foreground">
            {opportunity?.title ?? "Surfaced as you engage more"}
          </h3>
          {opportunity?.explanation && (
            <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{opportunity.explanation}</p>
          )}
        </fm.section>

        {/* Open Daily Advisor */}
        <fm.button
          {...sectionAnim}
          type="button"
          onClick={onOpenAdvisor}
          whileTap={reduce ? undefined : { scale: 0.98 }}
          className="flex w-full items-center gap-3 rounded-[18px] border border-white/[0.06] bg-white/[0.028] px-4 py-3.5 text-left"
        >
          <TrendingUp className="h-4 w-4 shrink-0 text-green" />
          <span className="flex-1 text-sm font-semibold text-foreground">Ask Signal about today</span>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </fm.button>
      </div>
    </ScreenShell>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.03] p-4">
      <div className="mb-2 text-green">{icon}</div>
      <p className="font-mono-tight text-2xl font-extrabold leading-none text-foreground">{value}</p>
      <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">{label}</p>
    </div>
  );
}
