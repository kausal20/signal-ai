// signal-ui-v2 · animations/motion.ts
// ---------------------------------------------------------------------------
// Named animation class constants so pages don't sprinkle magic strings.
// Every one maps to a keyframe already defined in the app's index.css
// (and mirrored in ../styles/tokens.css for standalone preview).
//
// All are wrapped by the app's `@media (prefers-reduced-motion: reduce)` rule,
// so honoring reduced motion is automatic — no JS branching required here.
// ---------------------------------------------------------------------------

export const motion = {
  /** Section / card entrance. */
  fadeUp: "animate-fade-up",
  /** Toast / banner drop-in from the top. */
  slideDown: "animate-slide-down",
  /** Modal / dialog / sheet entrance. */
  scaleIn: "animate-scale-in",
  /** Bookmark tap feedback (add to the icon on save). */
  bookmarkPop: "animate-bookmark",
  /** Press feedback on any tappable surface. */
  pressable: "pressable",
} as const;

/**
 * Small helper to stagger a list's entrance. Returns an inline style with an
 * animation-delay; pair with `motion.fadeUp`. Delays cap out so long lists
 * don't feel sluggish.
 */
export function stagger(index: number, step = 60, max = 480): { animationDelay: string } {
  return { animationDelay: `${Math.min(index * step, max)}ms` };
}
