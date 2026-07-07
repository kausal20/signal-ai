// signal-onboarding-ui · shared/peek.ts
// Shape of a welcome-screen preview signal (display only).
export interface Signal {
  source: string;
  tag: string;
  score: number;
  title: string;
}
