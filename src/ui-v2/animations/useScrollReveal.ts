// signal-ui-v2 · animations/useScrollReveal.ts
// ---------------------------------------------------------------------------
// Custom hook that powers viewport-triggered animations. Wraps Framer Motion's
// useInView for consistent scroll-triggered entrances across the app.
//
// Usage:
//   const { ref, controls, isInView } = useScrollReveal();
//   <motion.div ref={ref} animate={controls} initial="hidden" variants={scrollRevealVariants}>
//
// Or the simpler pattern:
//   const { ref, isInView } = useScrollReveal();
//   <motion.div ref={ref} animate={isInView ? "visible" : "hidden"} variants={scrollRevealVariants}>
// ---------------------------------------------------------------------------

import { useRef } from "react";
import { useInView, useAnimation, useReducedMotion } from "framer-motion";
import type { UseInViewOptions } from "framer-motion";

interface ScrollRevealOptions {
  /** Only trigger the animation once (default: true). */
  once?: boolean;
  /** How much of the element must be visible (0–1, default: 0.18). */
  amount?: UseInViewOptions["amount"];
  /** Delay before triggering (ms). */
  delay?: number;
}

export function useScrollReveal({
  once = true,
  amount = 0.18,
  delay = 0,
}: ScrollRevealOptions = {}) {
  const ref = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const isInView = useInView(ref, { once, amount });
  const controls = useAnimation();

  // If reduced motion, always show
  if (reduceMotion) {
    return {
      ref,
      isInView: true,
      controls,
      shouldAnimate: false,
    };
  }

  // Trigger animation when in view
  if (isInView) {
    if (delay > 0) {
      setTimeout(() => controls.start("visible"), delay);
    } else {
      controls.start("visible");
    }
  }

  return {
    ref,
    isInView,
    controls,
    shouldAnimate: true,
  };
}
