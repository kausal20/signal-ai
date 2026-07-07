// signal-ui-v2 · pages/SettingsPage.tsx
// ---------------------------------------------------------------------------
// Settings, reframed as "My AI Identity": profile hero, current goal, what
// Signal has observed (read-only), what it's learning (bars), editable
// interests with DEFERRED SAVE, daily routine toggles, a "why these
// recommendations" trust card, privacy rows, and a Reset confirmation.
//
// Replaces production: pages/Settings.tsx.
//
// NOTE ON DEFERRED SAVE: this component keeps a tiny piece of LOCAL DRAFT state
// for the interest chips only (committed vs draft) so the "Save changes" bar
// can appear. That is pure UI ergonomics, not business logic — the parent
// receives the final array via `onSaveInterests`. Everything else is stateless.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { ChevronLeft, RotateCcw, X, Check, Info } from "lucide-react";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { SectionHeader } from "../components/SectionHeader";
import { ProfileCard } from "../components/ProfileCard";
import { InterestChip } from "../components/InterestChip";
import { SignalProgress } from "../components/SignalProgress";
import { SignalToggle } from "../components/SignalToggle";
import { SettingsCard, SettingsRow } from "../components/SettingsCard";
import { SignalButton } from "../components/SignalButton";
import { SignalModal } from "../components/SignalModal";
import { SignalBadge } from "../components/SignalBadge";
import { motion } from "../animations/motion";
import type { UserProfile, LearnedTopic, SectionKey } from "../shared/types";

interface RoutineToggle {
  key: string;
  label: string;
  sub?: string;
  enabled: boolean;
}

interface Props {
  profile: UserProfile;
  confidenceLabel?: string;
  stats?: { value: string; label: string }[];

  /** Current goal card. */
  goal?: { title: string; focus?: string; weeklyTime?: string };

  /** Read-only observations Signal formed from behavior. */
  observations: string[];
  /** Learned-topic strength bars. */
  learning: LearnedTopic[];

  /** All selectable interests + the currently-committed selection. */
  allInterests: string[];
  selectedInterests: string[];

  routine: RoutineToggle[];
  /** Bullet reasons for "why am I seeing these". */
  whyReasons?: string[];
  briefTime?: string;

  bookmarkCount?: number;

  /** Production-owned inline sections (keep push.ts / save logic in the app). */
  editProfileSlot?: React.ReactNode;
  notificationsSlot?: React.ReactNode;

  onNavigate?: (s: SectionKey) => void;
  onBack?: () => void;
  onEditProfile?: () => void;
  onChangeGoal?: () => void;
  onToggleRoutine?: (key: string, next: boolean) => void;
  onSaveInterests?: (interests: string[]) => void;
  onReset?: () => void;
}

const STRENGTH_COLOR: Record<LearnedTopic["strength"], string> = {
  Strong: "hsl(152 72% 48%)",
  Growing: "hsl(152 50% 55%)",
  Emerging: "hsl(150 5% 60%)",
};

export function SettingsPage({
  profile, confidenceLabel = "Signal knows you well", stats = [],
  goal, observations, learning, allInterests, selectedInterests,
  routine, whyReasons = [], briefTime = "8:00 AM", bookmarkCount = 0,
  editProfileSlot, notificationsSlot,
  onNavigate, onBack, onEditProfile, onChangeGoal, onToggleRoutine, onSaveInterests, onReset,
}: Props) {
  // Deferred-save draft (UI-only): mirrors committed selection until saved.
  const [draft, setDraft] = useState<string[]>(selectedInterests);
  const [whyOpen, setWhyOpen] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);

  const dirty =
    draft.length !== selectedInterests.length ||
    draft.some((d) => !selectedInterests.includes(d));

  const toggleDraft = (label: string) =>
    setDraft((cur) => (cur.includes(label) ? cur.filter((x) => x !== label) : [...cur, label]));

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
      <h1 className="text-xl font-extrabold tracking-[-0.02em] text-foreground">My AI Identity</h1>
    </div>
  );

  return (
    <ScreenShell header={header} footer={<BottomNav active="settings" bookmarkCount={bookmarkCount} onNavigate={onNavigate} />} bodyClassName="px-[22px] pb-32 pt-1">
      {/* 1 · PROFILE HERO */}
      <ProfileCard profile={profile} stats={stats} confidenceLabel={confidenceLabel} onEdit={onEditProfile} className={`mb-[30px] ${motion.fadeUp}`} />

      {/* 2 · GOAL */}
      {goal && (
        <section className={`mb-[30px] ${motion.fadeUp}`}>
          <SectionHeader title="Current goal" />
          <div className="rounded-[20px] border border-white/[0.07] bg-white/[0.03] p-5">
            <div className="flex items-start justify-between gap-3.5">
              <div className="flex-1">
                <SignalBadge tone="green" className="mb-3">Primary goal</SignalBadge>
                <h2 className="text-[21px] font-extrabold leading-snug tracking-[-0.02em] text-foreground">{goal.title}</h2>
              </div>
              <SignalButton variant="secondary" size="sm" onClick={onChangeGoal} className="shrink-0">Change</SignalButton>
            </div>
            {(goal.focus || goal.weeklyTime) && (
              <div className="mt-[18px] flex gap-2.5">
                {goal.focus && <GoalStat label="CURRENT FOCUS" value={goal.focus} />}
                {goal.weeklyTime && <GoalStat label="WEEKLY TIME" value={goal.weeklyTime} />}
              </div>
            )}
          </div>
        </section>
      )}

      {/* EDIT PROFILE (production-owned inline section) */}
      {editProfileSlot && (
        <section id="edit-profile" className={`mb-[30px] ${motion.fadeUp}`}>{editProfileSlot}</section>
      )}

      {/* 3 · OBSERVATIONS (read-only) — hidden when no real data */}
      {observations.length > 0 && (
        <section className={`mb-[30px] ${motion.fadeUp}`}>
          <SectionHeader
            title="How Signal understands you"
            action={
              <button type="button" onClick={() => setInfoOpen((v) => !v)} aria-label="What is this?" className="flex h-4 w-4 items-center justify-center rounded-full border border-white/20 text-muted-foreground active:scale-90">
                <Info className="h-2.5 w-2.5" />
              </button>
            }
            description="This is what I've learned from your activity."
          />
          {infoOpen && (
            <p className="mb-3.5 rounded-xl border border-white/[0.05] bg-white/[0.025] px-3.5 py-2.5 text-xs leading-relaxed text-muted-foreground animate-fade-up">
              These are observations Signal formed from your reading, saves, and Advisor sessions. They reflect what you actually do — you can't edit them directly.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {observations.map((o) => (
              <InterestChip key={o} label={o} readOnly icon={<span className="text-[10px] text-green">◇</span>} />
            ))}
          </div>
        </section>
      )}

      {/* 4 · LEARNING BARS — hidden when no real data */}
      {learning.length > 0 && (
        <section className={`mb-[30px] ${motion.fadeUp}`}>
          <SectionHeader title="Signal is learning" action={<span className="font-mono-tight text-[10px] text-muted-foreground">updated yesterday</span>} />
          <div className="flex flex-col gap-4">
            {learning.map((l) => (
              <SignalProgress
                key={l.topic}
                value={Math.round(l.fraction * 100)}
                label={l.topic}
                valueLabel={l.strength}
                valueColor={STRENGTH_COLOR[l.strength]}
              />
            ))}
          </div>
          <p className="mt-4 pl-0.5 text-[11.5px] leading-relaxed text-muted-foreground">
            Signal adapts gradually — recommendations shift over days, not instantly.
          </p>
        </section>
      )}

      {/* 5 · INTERESTS (deferred save) */}
      <section className={`mb-[30px] ${motion.fadeUp}`}>
        <SectionHeader title="Your interests" description="Strong preferences you set. Your behavior still matters most." />
        <div className="flex flex-wrap gap-2">
          {allInterests.map((label) => (
            <InterestChip key={label} label={label} selected={draft.includes(label)} onToggle={() => toggleDraft(label)} />
          ))}
        </div>
      </section>

      {/* NOTIFICATIONS (production-owned: push.ts permission/subscribe/prefs) */}
      {notificationsSlot && (
        <section className={`mb-[30px] ${motion.fadeUp}`}>{notificationsSlot}</section>
      )}

      {/* 6 · ROUTINE — hidden when no real data */}
      {routine.length > 0 && (
        <section className={`mb-[30px] ${motion.fadeUp}`}>
          <SectionHeader title="Your daily routine" />
          <SettingsCard>
            {routine.map((r) => (
              <SettingsRow
                key={r.key}
                label={r.label}
                sub={r.sub}
                trailing={<SignalToggle checked={r.enabled} label={r.label} onChange={(next) => onToggleRoutine?.(r.key, next)} />}
              />
            ))}
            <SettingsRow label="Morning time" sub="When your brief arrives" trailing={<span className="font-mono-tight text-[13px] font-bold text-green">{briefTime}</span>} />
          </SettingsCard>
        </section>
      )}

      {/* 7 · WHY (trust) */}
      {whyReasons.length > 0 && (
        <section className={`mb-[30px] ${motion.fadeUp}`}>
          <button
            type="button"
            onClick={() => setWhyOpen((v) => !v)}
            className="green-halo relative w-full overflow-hidden p-[17px] text-left active:scale-[0.99]"
          >
            <div className="relative flex items-center gap-2.5">
              <div className="flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-lg border border-green/30 bg-green/[0.16]">
                <span className="text-[13px] font-extrabold text-green">S</span>
              </div>
              <span className="flex-1 text-sm font-bold text-foreground">Why am I seeing these?</span>
              <ChevronLeft className={`h-[18px] w-[18px] text-green transition-transform ${whyOpen ? "-rotate-90" : "rotate-180"}`} />
            </div>
            {whyOpen && (
              <div className="relative mt-3.5 flex flex-col gap-2.5 animate-fade-up">
                {whyReasons.map((r, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <span className="mt-[7px] h-[5px] w-[5px] shrink-0 rounded-full bg-green" />
                    <span className="text-[13px] leading-relaxed text-foreground/70">{r}</span>
                  </div>
                ))}
              </div>
            )}
          </button>
        </section>
      )}

      {/* 8 · RESET */}
      <section className={motion.fadeUp}>
        <SignalButton variant="danger" fullWidth size="lg" onClick={() => setResetOpen(true)} iconLeft={<RotateCcw className="h-[17px] w-[17px]" />}>
          Reset Signal
        </SignalButton>
        <p className="mt-4 text-center text-[11px] text-muted-foreground/70">Signal v2.0 · Tracking 1,240 sources</p>
      </section>

      {/* STICKY SAVE BAR — deferred interest save */}
      {dirty && (
        <div className="absolute inset-x-0 bottom-0 z-[54] bg-[linear-gradient(to_top,#070707_70%,transparent)] px-[22px] pb-[max(14px,env(safe-area-inset-bottom))] pt-3.5 animate-slide-down">
          <div className="flex items-center gap-3">
            <span className="flex-1 text-[12.5px] leading-snug text-muted-foreground">You changed your interests.</span>
            <SignalButton variant="secondary" onClick={() => setDraft(selectedInterests)}>Undo</SignalButton>
            <SignalButton onClick={() => onSaveInterests?.(draft)}>Save changes</SignalButton>
          </div>
        </div>
      )}

      {/* RESET CONFIRM */}
      <SignalModal open={resetOpen} onClose={() => setResetOpen(false)} tone="danger" labelledBy="reset-title">
        <div className="mx-auto mb-4 flex h-[52px] w-[52px] items-center justify-center rounded-2xl border border-[hsl(0_55%_50%/0.28)] bg-[hsl(0_55%_50%/0.1)]">
          <RotateCcw className="h-6 w-6 text-[hsl(0_75%_66%)]" />
        </div>
        <h2 id="reset-title" className="text-center text-xl font-extrabold tracking-[-0.01em] text-foreground">Reset Signal?</h2>
        <p className="mx-auto mt-2 max-w-[280px] text-center text-[13px] leading-relaxed text-muted-foreground">
          This wipes everything Signal has learned. It can't be undone.
        </p>
        <div className="my-5 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-3.5">
          {["Reset onboarding", "Forget learning history", "Clear personalization", "Reset recommendations"].map((item) => (
            <div key={item} className="flex items-center gap-2.5 py-1">
              <X className="h-3.5 w-3.5 shrink-0 text-[hsl(0_75%_66%)]" />
              <span className="text-[13px] text-foreground/80">{item}</span>
            </div>
          ))}
        </div>
        <SignalButton variant="secondary" fullWidth size="lg" onClick={() => setResetOpen(false)} className="mb-2.5">Keep my profile</SignalButton>
        <SignalButton fullWidth size="lg" onClick={() => { onReset?.(); setResetOpen(false); }} className="bg-[#f0564a] text-[#1a0604] shadow-none">
          Reset everything
        </SignalButton>
      </SignalModal>
    </ScreenShell>
  );
}

function GoalStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex-1 rounded-[13px] border border-white/[0.06] bg-white/[0.035] px-3.5 py-2.5">
      <div className="mb-1 text-[9px] font-bold tracking-[0.1em] text-muted-foreground">{label}</div>
      <div className="text-[13.5px] font-bold text-foreground/90">{value}</div>
    </div>
  );
}
