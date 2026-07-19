// signal-ui-v2 · animations/motion.ts
// ---------------------------------------------------------------------------
// The shared Signal motion language — the single source of truth for every
// animation in the app. Organised into 7 categories:
//
//   1. Micro        — button press, toggle snap, chip select
//   2. Component    — card hover/lift, input focus, badge entrance
//   3. Ambient      — aurora drift, particle float, card float, live pulse
//   4. Navigation   — bottom nav indicator slide, page fade/slide
//   5. Loading      — skeleton shimmer, wave loading, gradient sweep
//   6. Feedback     — bookmark pop+rotate+glow, ripple, success burst
//   7. Page         — stagger container, section entrance, scroll reveal
//
// CSS classes handle the ambient and tactile layer; Framer variants cover
// page, section, and component choreography.
// ---------------------------------------------------------------------------

import type { Transition, Variants } from "framer-motion";

/* ─── Easing curves ────────────────────────────────────────────────────────── */
// premiumEase is a strong decelerate (easeOut family) — the entrance curve.
const premiumEase = [0.22, 1, 0.36, 1] as const;
const softEase = [0.2, 0, 0, 1] as const;
const snappyEase = [0.16, 1, 0.3, 1] as const;

/* ─── Duration tokens ──────────────────────────────────────────────────────── */
// Premium-app timing: every user-facing entrance/transition sits in 180–320ms.
// Only ambient background loops run long. Interactions use springs (below).
export const motionTokens = {
  duration: {
    micro: 0.16,       // button press, toggle snap
    component: 0.22,   // card hover, input focus, list item
    section: 0.28,     // section entrances
    page: 0.26,        // full page transitions (~250ms)
    ambient: 14,       // ambient background loops
    float: 7,          // card floating cycle
  },
  ease: {
    premium: premiumEase,
    soft: softEase,
    snappy: snappyEase,
  },
  spring: {
    // Navigation springs
    nav: { type: "spring" as const, stiffness: 520, damping: 38, mass: 0.75 },
    navIndicator: { type: "spring" as const, stiffness: 420, damping: 34, mass: 0.65 },
    // Press / tap springs
    press: { type: "spring" as const, stiffness: 650, damping: 34, mass: 0.55 },
    // Card interaction springs
    card: { type: "spring" as const, stiffness: 280, damping: 28, mass: 0.75 },
    cardLift: { type: "spring" as const, stiffness: 320, damping: 24, mass: 0.65 },
    // Toggle switch spring
    toggle: { type: "spring" as const, stiffness: 500, damping: 30, mass: 0.6 },
    // Bookmark pop spring
    bookmark: { type: "spring" as const, stiffness: 600, damping: 22, mass: 0.5 },
    // Accordion open/close
    accordion: { type: "spring" as const, stiffness: 300, damping: 32, mass: 0.8 },
    // Celebration burst
    celebration: { type: "spring" as const, stiffness: 200, damping: 15, mass: 0.4 },
    // Chip select
    chip: { type: "spring" as const, stiffness: 500, damping: 25, mass: 0.5 },
    // Modal entrance
    modal: { type: "spring" as const, stiffness: 350, damping: 28, mass: 0.7 },
  },
} as const;

/* ─── CSS class-name references ────────────────────────────────────────────── */
export const motion = {
  // Entrances
  fadeUp: "animate-fade-up",
  slideDown: "animate-slide-down",
  scaleIn: "animate-scale-in",

  // Feedback
  bookmarkPop: "animate-bookmark",

  // Tactile
  pressable: "pressable",
  card: "motion-card",
  button: "motion-button",

  // Ambient
  float: "motion-float",
  draw: "motion-draw",
  aurora: "signal-aurora",
  radarSweep: "signal-radar-sweep",

  // New — Phase 1
  ripple: "motion-ripple",
  glowCard: "motion-glow-card",
  waveShimmer: "motion-wave-shimmer",
  noiseOverlay: "signal-noise-overlay",
  depthLight: "signal-depth-light",
  floatCard: "motion-float-card",
  accordionBody: "motion-accordion-body",
} as const;

/* ─── Page transition ──────────────────────────────────────────────────────── */
// Fade + rise 12px, ~250ms. No blur (GPU-cheap: opacity + transform only),
// no left/right slide, no zoom. Exit is a quick fade + small lift.
export const pageTransition: Transition = {
  duration: motionTokens.duration.page,
  ease: premiumEase,
};

export const pageVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: pageTransition },
  exit: { opacity: 0, y: -8, transition: { duration: 0.18, ease: softEase } },
};

/* ─── Container stagger (initial/animate keys) ─────────────────────────────── */
export const containerVariants: Variants = {
  initial: {},
  animate: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.03,
    },
  },
};

/* ─── Section entrance ─────────────────────────────────────────────────────── */
export const sectionVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: motionTokens.duration.section, ease: premiumEase },
  },
};

/* ─── Item entrance ────────────────────────────────────────────────────────── */
export const itemVariants: Variants = {
  initial: { opacity: 0, y: 12 },
  animate: {
    opacity: 1,
    y: 0,
    transition: { duration: motionTokens.duration.component, ease: premiumEase },
  },
};

/* ─── Shared stagger (hidden/show keys) ────────────────────────────────────── */
// Drop-in for pages that previously declared identical local container/item
// variants. One definition, one timing, everywhere.
export const staggerContainer: Variants = {
  hidden: {},
  show: {
    transition: {
      staggerChildren: 0.05,
      delayChildren: 0.03,
    },
  },
};

export const fadeInUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: {
    opacity: 1,
    y: 0,
    transition: { duration: motionTokens.duration.section, ease: premiumEase },
  },
};

/* ─── Scroll-triggered viewport entrance ───────────────────────────────────── */
// Opacity + rise only (no scale) so scrolling stays crisp and cheap.
export const scrollRevealVariants: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: motionTokens.duration.section,
      ease: premiumEase,
    },
  },
};

/* ─── Floating card (ambient) ──────────────────────────────────────────────── */
export const floatVariants: Variants = {
  float: {
    y: [0, -3, 0],
    transition: {
      duration: motionTokens.duration.float,
      repeat: Infinity,
      ease: "easeInOut",
    },
  },
};

/* ─── Card hover / tap ─────────────────────────────────────────────────────── */
export const cardHover = {
  y: -3,
  scale: 1.01,
  transition: motionTokens.spring.card,
} as const;

export const cardTap = {
  scale: 0.985,
  transition: motionTokens.spring.press,
} as const;

/* ─── Button hover / tap ───────────────────────────────────────────────────── */
export const buttonHover = {
  y: -1,
  transition: { duration: motionTokens.duration.micro, ease: softEase },
} as const;

export const buttonTap = {
  scale: 0.97,
  transition: motionTokens.spring.press,
} as const;

/* ─── Nav icon hover / tap ─────────────────────────────────────────────────── */
export const navIconHover = {
  y: -1,
  scale: 1.04,
  transition: motionTokens.spring.press,
} as const;

export const navIconTap = {
  scale: 0.92,
  transition: motionTokens.spring.press,
} as const;

/* ─── Accordion ────────────────────────────────────────────────────────────── */
export const accordionVariants: Variants = {
  collapsed: {
    height: 0,
    opacity: 0,
    transition: { duration: 0.28, ease: softEase },
  },
  expanded: {
    height: "auto",
    opacity: 1,
    transition: motionTokens.spring.accordion,
  },
};

/* ─── Modal entrance ───────────────────────────────────────────────────────── */
// Fade + soft scale 98%→100% + slight upward. No blur. Backdrop fades on its
// own track so the two never look welded together.
export const modalVariants: Variants = {
  initial: { opacity: 0, scale: 0.98, y: 8 },
  animate: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: motionTokens.spring.modal,
  },
  exit: {
    opacity: 0,
    scale: 0.98,
    y: 6,
    transition: { duration: 0.18, ease: softEase },
  },
};

export const backdropVariants: Variants = {
  initial: { opacity: 0 },
  animate: { opacity: 1, transition: { duration: 0.22 } },
  exit: { opacity: 0, transition: { duration: 0.16 } },
};

/* ─── Bookmark enhanced ────────────────────────────────────────────────────── */
export const bookmarkSpring = {
  scale: [1, 1.35, 0.9, 1.05, 1],
  rotate: [0, -12, 8, -4, 0],
  transition: {
    duration: 0.5,
    ease: premiumEase,
  },
} as const;

/* ─── Celebration burst ────────────────────────────────────────────────────── */
export const celebrationVariants: Variants = {
  initial: { scale: 0, opacity: 0 },
  animate: {
    scale: [0, 1.2, 1],
    opacity: [0, 1, 1],
    transition: motionTokens.spring.celebration,
  },
};

/* ─── Viewport observer config ─────────────────────────────────────────────── */
export const viewportOnce = {
  once: true,
  amount: 0.18,
} as const;

export const viewportRepeat = {
  once: false,
  amount: 0.18,
} as const;

/**
 * Small helper to stagger a list's entrance. Returns an inline style with an
 * animation-delay; pair with `motion.fadeUp`. Delays cap out so long lists
 * don't feel sluggish.
 */
export function stagger(index: number, step = 60, max = 480): { animationDelay: string } {
  return { animationDelay: `${Math.min(index * step, max)}ms` };
}

export const styleDelay = stagger;

/**
 * Triggers haptic feedback on supported mobile devices.
 * Falls back silently on unsupported devices/desktop.
 */
export function haptic(pattern: number | number[] = 10): void {
  try {
    if (navigator?.vibrate) navigator.vibrate(pattern);
  } catch {
    // Silently ignore — not supported
  }
}
