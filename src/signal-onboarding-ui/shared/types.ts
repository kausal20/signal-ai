// signal-onboarding-ui · shared/types.ts
// ---------------------------------------------------------------------------
// Backend-agnostic prop shapes for the onboarding flow. No logic, no storage.
// The production app owns persistence and submits `OnboardingData` on complete.
// ---------------------------------------------------------------------------

export interface Option {
  id: string;
  label: string;
  /** Icon key resolved by the step (see data/onboarding-options.ts). */
  icon?: string;
}

/** The full answer set the flow collects. Persist this in your app layer. */
export interface OnboardingData {
  name: string;
  role: string | null;
  goal: string | null;
  interests: string[];
  time: string | null;
  experience: string | null;
  notificationsEnabled: boolean;
}

export const EMPTY_ONBOARDING: OnboardingData = {
  name: "",
  role: null,
  goal: null,
  interests: [],
  time: null,
  experience: null,
  notificationsEnabled: false,
};

/** Every step key, in order. Index 0..8 → steps 1..9. */
export type StepKey =
  | "welcome"
  | "name"
  | "role"
  | "goal"
  | "interests"
  | "time"
  | "experience"
  | "notifications"
  | "loading"
  | "success";

export const STEP_ORDER: StepKey[] = [
  "welcome",
  "name",
  "role",
  "goal",
  "interests",
  "time",
  "experience",
  "notifications",
  "loading",
  "success",
];
