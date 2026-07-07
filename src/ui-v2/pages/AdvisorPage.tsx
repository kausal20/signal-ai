// signal-ui-v2 · pages/AdvisorPage.tsx
// ---------------------------------------------------------------------------
// Advisor: one opinionated daily pick, a conviction ring, the "why", a
// check-off action plan, a "skip this today" trust card, progress-as-story,
// and tomorrow's preview. Fully prop-driven.
//
// Replaces production: pages/Advisor.tsx.
// ---------------------------------------------------------------------------
import { Ban, ChevronRight } from "lucide-react";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { LivePulse } from "../components/LivePulse";
import { SectionHeader } from "../components/SectionHeader";
import { RecommendationCard } from "../components/RecommendationCard";
import { Timeline } from "../components/Timeline";
import { SignalProgress } from "../components/SignalProgress";
import { motion } from "../animations/motion";
import type { Recommendation, PlanStep, Project, SectionKey } from "../shared/types";

interface Props {
  /** Greeting line, e.g. "Alex — you've got about 45 minutes today." */
  greeting: string;
  greetingSub?: string;
  recommendation: Recommendation;
  /** Bullet reasons for the "why" section. */
  reasons: string[];
  plan: PlanStep[];
  /** What to deliberately ignore today (trust-builder). */
  skip?: { title: string; body: string };
  project?: Project;
  tomorrow?: string;
  starting?: boolean;
  bookmarkCount?: number;

  onNavigate?: (s: SectionKey) => void;
  onStart?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  onToggleStep?: (id: string) => void;
  onOpenTomorrow?: () => void;
}

export function AdvisorPage({
  greeting, greetingSub = "Here's the one thing I'd spend it on.",
  recommendation, reasons, plan, skip, project, tomorrow,
  starting, bookmarkCount = 0, onNavigate, onStart, onToggleSave, onToggleStep, onOpenTomorrow,
}: Props) {
  const header = (
    <div className="flex items-center gap-3.5 bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_72%,transparent)] px-5 pb-3 pt-12">
      <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-green/25 bg-green/[0.12]">
        <span className="text-[13px] font-extrabold text-green">S</span>
      </div>
      <div className="flex flex-col leading-none">
        <span className="text-sm font-extrabold text-foreground">Advisor</span>
        <LivePulse bare className="mt-1 text-[10px]" label="Briefed for today" />
      </div>
    </div>
  );

  return (
    <ScreenShell header={header} footer={<BottomNav active="advisor" bookmarkCount={bookmarkCount} onNavigate={onNavigate} />} bodyClassName="px-[22px] pb-24 pt-1">
      {/* GREETING */}
      <div className={`py-2.5 pb-[22px] ${motion.fadeUp}`}>
        <h1 className="text-2xl font-extrabold leading-tight tracking-[-0.025em] text-foreground">{greeting}</h1>
        <p className="mt-2.5 text-[15px] leading-snug text-muted-foreground">{greetingSub}</p>
      </div>

      {/* PICK */}
      <RecommendationCard
        recommendation={recommendation}
        onStart={onStart}
        onToggleSave={onToggleSave}
        starting={starting}
        className={`mb-[30px] ${motion.fadeUp}`}
      />

      {/* WHY */}
      <section className={`mb-[30px] ${motion.fadeUp}`}>
        <SectionHeader title="Why I'm telling you this" />
        <ul className="flex flex-col gap-2.5">
          {reasons.map((r, i) => (
            <li key={i} className="flex items-start gap-2.5">
              <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-green" />
              <span className="text-[15px] leading-relaxed text-foreground/80">{r}</span>
            </li>
          ))}
        </ul>
      </section>

      {/* PLAN */}
      <section className={`mb-[30px] ${motion.fadeUp}`}>
        <SectionHeader
          title="Today's plan"
          action={
            <span className="font-mono-tight text-[11px] font-semibold text-green">
              {plan.filter((p) => p.done).length} of {plan.length}
            </span>
          }
        />
        <Timeline steps={plan} onToggleStep={onToggleStep} />
      </section>

      {/* SKIP */}
      {skip && (
        <section className={`mb-[30px] rounded-[18px] border border-dashed border-white/10 bg-white/[0.022] p-[17px] ${motion.fadeUp}`}>
          <div className="mb-2.5 flex items-center gap-2">
            <Ban className="h-[15px] w-[15px] text-[hsl(0_75%_66%)]" />
            <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-[hsl(0_75%_66%)]">Skip this today</span>
          </div>
          <p className="text-sm leading-relaxed text-muted-foreground">
            <span className="text-foreground/80 font-semibold">{skip.title}</span> {skip.body}
          </p>
        </section>
      )}

      {/* PROGRESS AS STORY */}
      {project && (
        <section className={`mb-[18px] rounded-[18px] border border-white/[0.06] bg-white/[0.028] p-[18px] ${motion.fadeUp}`}>
          <SectionHeader
            title="Your progress"
            action={typeof project.streakDays === "number" ? (
              <span className="text-[11px] font-bold text-green">{project.streakDays}-day streak</span>
            ) : undefined}
          />
          <div className="mb-4 flex flex-col gap-2.5">
            {project.yesterday && (
              <div className="flex gap-3">
                <span className="w-[62px] shrink-0 pt-0.5 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">YESTERDAY</span>
                <span className="text-[13.5px] leading-snug text-muted-foreground">{project.yesterday}</span>
              </div>
            )}
            {project.today && (
              <div className="flex gap-3">
                <span className="w-[62px] shrink-0 pt-0.5 text-[10px] font-bold tracking-[0.1em] text-green">TODAY</span>
                <span className="text-[13.5px] font-semibold leading-snug text-foreground">{project.today}</span>
              </div>
            )}
          </div>
          {typeof project.progress === "number" && <SignalProgress value={project.progress} />}
        </section>
      )}

      {/* TOMORROW */}
      {tomorrow && (
        <button
          type="button"
          onClick={onOpenTomorrow}
          className={`flex w-full items-center gap-3 px-1 py-2 pb-2 text-left ${motion.fadeUp}`}
        >
          <span className="shrink-0 text-[10px] font-bold tracking-[0.1em] text-muted-foreground">TOMORROW</span>
          <span className="text-[13.5px] leading-snug text-muted-foreground">{tomorrow}</span>
          <ChevronRight className="ml-auto h-[15px] w-[15px] shrink-0 text-white/30" />
        </button>
      )}
    </ScreenShell>
  );
}
