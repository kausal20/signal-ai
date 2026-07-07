// signal-ui-v2 · shared/utils.ts
// ---------------------------------------------------------------------------
// Class-name merge helper. This mirrors the production app's `@/lib/utils`.
//
// ON MERGE: delete this file and change imports from `../shared/utils`
// to `@/lib/utils` — the app already exports an identical `cn`.
// ---------------------------------------------------------------------------
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Clamp a number into [min, max]. */
export function clamp(n: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, n));
}

/** True when the user has requested reduced motion. Safe on the server. */
export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
