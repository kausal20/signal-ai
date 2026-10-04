// Motion vocabulary for the editorial UI. One easing, short durations, small
// distances: things settle into place rather than bounce or fly. Every page
// draws from these few primitives so the whole product moves the same way.
// Reduced motion is handled once, by <MotionConfig reducedMotion="user"> in
// AppShell — transforms are dropped, opacity fades remain.

import { Children, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type Transition, type Variants } from "framer-motion";

export const EASE = [0.22, 1, 0.36, 1] as const;
export const DUR = { fast: 0.14, base: 0.22, slow: 0.28 } as const;

export function useRowMotion() {
  const reduce = useReducedMotion();
  return {
    initial: reduce ? false as const : "hidden",
    whileInView: "show",
    viewport: { once: true, amount: 0.1 },
    variants: itemV,
  };
}

export const settle: Transition = { duration: DUR.base, ease: EASE };
/** Physical feel for small controls (switch knob, indicators). */
export const spring: Transition = { type: "spring", stiffness: 520, damping: 38, mass: 0.7 };

/** Parent of a staggered list. Children use `itemV`. */
export const listV: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.045, delayChildren: 0.04 } },
};

/** A list row: rises a few pixels into place; leaves by fading and sliding aside. */
export const itemV: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: settle },
  exit: { opacity: 0, x: -16, transition: { duration: DUR.fast, ease: EASE } },
};

/** Section/block entrance. */
export const revealV: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: DUR.slow, ease: EASE } },
};

type ListTag = "ul" | "ol" | "div";

/** A list whose rows enter one after another. Rows added later (e.g. "Show
 *  more") inherit the variants and animate in on their own. */
export function Stagger({ as = "ul", className, children, delay = 0 }: { as?: ListTag; className?: string; children: ReactNode; delay?: number }) {
  const Tag = motion[as];
  const reduce = useReducedMotion();
  const stagger = Math.min(0.035, 0.18 / Math.max(Children.count(children), 1));
  return (
    <Tag
      className={className}
      variants={{ hidden: {}, show: { transition: { staggerChildren: reduce ? 0 : stagger, delayChildren: reduce ? 0 : Math.min(delay, 0.1) } } }}
      initial={reduce ? false : "hidden"}
      whileInView="show"
      viewport={{ once: true, amount: 0.05 }}
    >
      {children}
    </Tag>
  );
}

/** Fades a block up into place on mount. */
export function Reveal({ children, className, delay = 0, as = "div" }: { children: ReactNode; className?: string; delay?: number; as?: "div" | "section" | "header" | "p" }) {
  const Tag = motion[as];
  const reduce = useReducedMotion();
  return (
    <Tag
      className={className}
      initial={reduce ? false : { opacity: 0, y: 6 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.1 }}
      transition={{ duration: DUR.slow, ease: EASE, delay }}
    >
      {children}
    </Tag>
  );
}

/** Crossfades between mutually exclusive states (skeleton → content → error).
 *  The outgoing state leaves first, so two layouts never stack. */
export function Swap({ id, children, className }: { id: string; children: ReactNode; className?: string }) {
  return (
    <AnimatePresence mode="wait" initial={false}>
      <motion.div
        key={id}
        className={className}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0, transition: settle }}
        exit={{ opacity: 0, transition: { duration: DUR.fast, ease: EASE } }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  );
}

/** Press feedback for buttons: a barely-there compression. */
export const press = { whileTap: { scale: 0.97 }, transition: { duration: DUR.fast, ease: EASE } } as const;
