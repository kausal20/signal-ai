// signal-onboarding-ui · index.ts — barrel export
export { OnboardingFlow } from "./OnboardingFlow";

// Steps (use individually if you drive navigation yourself)
export { WelcomeStep } from "./steps/WelcomeStep";
export { NameStep } from "./steps/NameStep";
export { RoleStep } from "./steps/RoleStep";
export { GoalStep } from "./steps/GoalStep";
export { InterestsStep } from "./steps/InterestsStep";
export { TimeStep } from "./steps/TimeStep";
export { ExperienceStep } from "./steps/ExperienceStep";
export { NotificationsStep } from "./steps/NotificationsStep";
export { LoadingStep } from "./steps/LoadingStep";
export { SuccessStep } from "./steps/SuccessStep";

// Shell + shared bits
export { OnboardingShell } from "./components/OnboardingShell";
export { PrimaryButton } from "./components/PrimaryButton";
export { OptionCard, OptionRow, RadioRow } from "./components/OptionCard";

// Data defaults
export {
  ROLES, GOALS, INTERESTS, TIME_OPTIONS, EXPERIENCE_OPTIONS, MIN_INTERESTS, ICONS,
} from "./data/onboarding-options";

// Types
export type { OnboardingData, Option, StepKey } from "./shared/types";
export { EMPTY_ONBOARDING, STEP_ORDER } from "./shared/types";
export type { Signal } from "./shared/peek";
