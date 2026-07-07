// signal-onboarding-ui · shared/utils.ts
// Mirror of the app's `@/lib/utils`. ON MERGE: delete this and import cn from
// "@/lib/utils" instead — it is identical.
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function prefersReducedMotion() {
  return (
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true
  );
}
