// signal-onboarding-ui · OnboardingFlow.tsx
// ---------------------------------------------------------------------------
// Orchestrator that stitches the 9 steps together. It owns ONLY view state:
// the current step index and the in-progress answers, plus back/next
// navigation. It has NO persistence, NO API calls, NO routing.
//
// The production app supplies:
//   • initialData          (optional, to resume)
//   • onRequestNotifications(enabled) — perform the real OS permission request
//   • onComplete(data)      — persist answers + route into the app
//
// Auto-advance: Role/Goal call next() shortly after a pick, matching the mock.
// Everything else is prop-driven and stateless per step.
//
// You can also drive the flow fully externally: pass `stepIndex` +
// `onStepChange` to lift navigation out (then this holds only answers).
// ---------------------------------------------------------------------------
import { useState, useCallback, useRef, useEffect } from "react";
import { OnboardingShell } from "./components/OnboardingShell";
import { WelcomeStep } from "./steps/WelcomeStep";
import { NameStep } from "./steps/NameStep";
import { RoleStep } from "./steps/RoleStep";
import { GoalStep } from "./steps/GoalStep";
import { InterestsStep } from "./steps/InterestsStep";
import { TimeStep } from "./steps/TimeStep";
import { ExperienceStep } from "./steps/ExperienceStep";
import { NotificationsStep } from "./steps/NotificationsStep";
import { LoadingStep } from "./steps/LoadingStep";
import { SuccessStep } from "./steps/SuccessStep";
import { STEP_ORDER, EMPTY_ONBOARDING, type OnboardingData } from "./shared/types";
import type { Signal } from "./shared/peek";

interface Props {
  /** Resume with existing answers (optional). */
  initialData?: Partial<OnboardingData>;
  /** Preview signals for the welcome + success screens (optional). */
  welcomePeek?: Signal[];
  successSignals?: Signal[];
  /** Perform the real OS notification request; return/resolve is ignored. */
  onRequestNotifications?: (enabled: boolean) => void;
  /** Called with the final answers when the user enters the app. */
  onComplete?: (data: OnboardingData) => void;
  onSignIn?: () => void;
}

const TOTAL = STEP_ORDER.length; // 9
const AUTO_ADVANCE_MS = 320;

export function OnboardingFlow({
  initialData, welcomePeek, successSignals,
  onRequestNotifications, onComplete, onSignIn,
}: Props) {
  const [index, setIndex] = useState(0);
  const [data, setData] = useState<OnboardingData>({ ...EMPTY_ONBOARDING, ...initialData });
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  const next = useCallback(() => setIndex((i) => Math.min(i + 1, TOTAL - 1)), []);
  const back = useCallback(() => setIndex((i) => Math.max(i - 1, 0)), []);
  const patch = useCallback((p: Partial<OnboardingData>) => setData((d) => ({ ...d, ...p })), []);

  /** Set a value then auto-advance (Role / Goal). */
  const pickAndAdvance = useCallback((p: Partial<OnboardingData>) => {
    patch(p);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(next, AUTO_ADVANCE_MS);
  }, [patch, next]);

  const toggleInterest = useCallback((label: string) => {
    setData((d) => ({
      ...d,
      interests: d.interests.includes(label)
        ? d.interests.filter((x) => x !== label)
        : [...d.interests, label],
    }));
  }, []);

  const chooseNotifications = useCallback((enabled: boolean) => {
    patch({ notificationsEnabled: enabled });
    onRequestNotifications?.(enabled);
    next();
  }, [patch, next, onRequestNotifications]);

  const key = STEP_ORDER[index];
  const step = index + 1;
  const showBack = key !== "welcome" && key !== "success";

  return (
    <OnboardingShell step={step} total={TOTAL} showBack={showBack} onBack={back}>
      {key === "welcome" && (
        <WelcomeStep peek={welcomePeek} onGetStarted={next} onSignIn={onSignIn} />
      )}
      {key === "name" && (
        <NameStep value={data.name} onChange={(name) => patch({ name })} onContinue={next} />
      )}
      {key === "role" && (
        <RoleStep value={data.role} onSelect={(id) => pickAndAdvance({ role: id })} />
      )}
      {key === "goal" && (
        <GoalStep value={data.goal} onSelect={(id) => pickAndAdvance({ goal: id })} />
      )}
      {key === "interests" && (
        <InterestsStep selected={data.interests} onToggle={toggleInterest} onContinue={next} />
      )}
      {key === "time" && (
        <TimeStep value={data.time} onSelect={(id) => patch({ time: id })} onContinue={next} />
      )}
      {key === "experience" && (
        <ExperienceStep value={data.experience} onSelect={(id) => patch({ experience: id })} onContinue={next} />
      )}
      {key === "notifications" && (
        <NotificationsStep onChoose={chooseNotifications} />
      )}
      {key === "loading" && (
        <LoadingStep onComplete={next} />
      )}
      {key === "success" && (
        <SuccessStep
          firstName={data.name.trim().split(" ")[0] || undefined}
          topics={data.interests}
          signals={successSignals}
          onEnter={() => onComplete?.(data)}
        />
      )}
    </OnboardingShell>
  );
}
