// signal-bottom-nav · LiquidGlassBar.tsx
// ---------------------------------------------------------------------------
// Premium Apple-inspired liquid glass bottom navigation bar.
// Shared by both ui-v2 and legacy BottomNav wrappers.
//
// Architecture:
//   - LayoutGroup + layoutId for shared capsule animation across remounts
//   - useSpring + useTransform + useVelocity for liquid morphing
//   - useMotionTemplate for dynamic gradient/shadow interpolation
//   - whileHover / whileTap for micro-interactions
//   - Multi-wave ripple effect on press (liquid feel)
//   - Reduced motion support
//   - Keyboard navigation (arrow keys)
//   - Window resize / orientation handling
//   - Memoized for 60 FPS performance
// ---------------------------------------------------------------------------
import { useEffect, useRef, useCallback, useState, memo, type ReactNode } from "react";
import {
  LayoutGroup,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  useMotionTemplate,
  useReducedMotion,
  AnimatePresence,
} from "framer-motion";
import { cn } from "@/lib/utils";

// ── Tab definition (generic — caller provides the list) ──────────────────
export interface Tab {
  key: string;
  label: string;
  icon: ReactNode;
  /** If provided, renders a <Link>-like element instead of <button>. */
  href?: string;
}

interface LiquidGlassBarProps {
  tabs: Tab[];
  activeKey: string;
  onSelect: (key: string) => void;
  className?: string;
}

const EASE = [0.22, 1, 0.36, 1] as const;

// ── Spring configs (Apple-spec precision) ────────────────────────────────
// Core capsule spring: responsive, snappy, no lag — the signature feel.
// Kept for the velocity pipeline (stretch/squash/skew below) — that liquid
// warp is driven continuously off this spring's velocity regardless of what
// transition the capsule's own position glide uses.
const CAPSULE_SPRING = {
  type: "spring" as const,
  mass: 0.5,
  stiffness: 320,
  damping: 24,
  restDelta: 0.001,
};

// Capsule position glide: the shared-layout move between tabs. Tween, not
// spring — deliberate duration/ease so it reads as a smooth glide, never a
// jump or a bounce.
const GLIDE_TWEEN = { duration: 0.45, ease: EASE };

// Icon spring: lighter mass for instant response. Small delay so the capsule
// visibly leads and the icon follows — indicator first, then icon.
const ICON_SPRING = {
  type: "spring" as const,
  mass: 0.4,
  stiffness: 400,
  damping: 26,
  restDelta: 0.001,
  delay: 0.05,
};

// Label spring: minimal mass for fluid feel.
const LABEL_SPRING = {
  type: "spring" as const,
  mass: 0.3,
  stiffness: 380,
  damping: 28,
  restDelta: 0.001,
};

// Press spring: ultra-responsive for tactile feedback.
const PRESS_SPRING = {
  type: "spring" as const,
  mass: 0.3,
  stiffness: 500,
  damping: 30,
  restDelta: 0.001,
};

// ── Ripple (multi-wave, liquid feel) ─────────────────────────────────────
const Ripple = memo(function Ripple({
  x, y, onDone, delay = 0,
}: {
  x: number; y: number; onDone: () => void; delay?: number;
}) {
  useEffect(() => {
    const t = setTimeout(onDone, 700 + delay);
    return () => clearTimeout(t);
  }, [onDone, delay]);

  return (
    <motion.span
      className="pointer-events-none absolute rounded-full"
      style={{
        left: x,
        top: y,
        x: "-50%",
        y: "-50%",
        background:
          "radial-gradient(circle, hsla(152, 72%, 48%, 0.25) 0%, hsla(152, 72%, 48%, 0.10) 40%, transparent 70%)",
      }}
      initial={{ width: 0, height: 0, opacity: 0.45 }}
      animate={{ width: 160, height: 160, opacity: 0 }}
      transition={{
        duration: 0.7,
        delay: delay / 1000,
        ease: [0.22, 1, 0.36, 1], // Apple ease-out
      }}
    />
  );
});

// ── Tab button (memoized for perf) ──────────────────────────────────────
const TabButton = memo(function TabButton({
  tab,
  isActive,
  handlePress,
  reduceMotion,
}: {
  tab: Tab;
  isActive: boolean;
  handlePress: (key: string, e: React.MouseEvent<HTMLButtonElement>) => void;
  reduceMotion: boolean | null;
}) {
  const reduced = reduceMotion === true;

  return (
    <motion.button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={tab.label}
      aria-current={isActive ? "page" : undefined}
      tabIndex={isActive ? 0 : -1}
      onClick={(e) => handlePress(tab.key, e)}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
          e.preventDefault();
          const btn = e.currentTarget.parentElement?.querySelectorAll<HTMLElement>("[role='tab']");
          if (!btn) return;
          const idx = Array.from(btn).indexOf(e.currentTarget);
          const next =
            e.key === "ArrowRight"
              ? (idx + 1) % btn.length
              : (idx - 1 + btn.length) % btn.length;
          btn[next].focus();
          btn[next].click();
        }
      }}
      className={cn(
        "group relative z-10 flex h-[60px] min-w-0 touch-manipulation flex-col items-center justify-center rounded-[22px] px-1 outline-none cursor-pointer",
        "focus-visible:ring-2 focus-visible:ring-green/60 focus-visible:ring-offset-2 focus-visible:ring-offset-transparent",
        !isActive && "hover:bg-white/[0.04]",
      )}
      whileHover={
        reduced
          ? undefined
          : {
              y: -3,
              transition: { type: "spring", stiffness: 400, damping: 25 },
            }
      }
      whileTap={
        reduced
          ? undefined
          : { scale: 0.96, transition: PRESS_SPRING }
      }
    >
      {/* ── Icon ──────────────────────────────────────────────────── */}
      <motion.span
        className="relative z-10 flex h-7 items-center justify-center"
        animate={
          reduced
            ? undefined
            : {
                y: isActive ? -4 : 0,
                scale: isActive ? 1.12 : 1,
                opacity: isActive ? 1 : 0.65,
              }
        }
        transition={reduced ? undefined : ICON_SPRING}
        style={{
          filter: isActive
            ? "drop-shadow(0 0 10px hsla(152, 85%, 55%, 0.45)) drop-shadow(0 0 20px hsla(152, 85%, 55%, 0.20))"
            : "none",
        }}
      >
        <span
          className={cn(
            "flex h-[22px] w-[22px] items-center justify-center transition-colors duration-300",
            isActive
              ? "text-green"
              : "text-zinc-500 group-hover:text-zinc-300",
          )}
        >
          {tab.icon}
        </span>
      </motion.span>

      {/* ── Label ─────────────────────────────────────────────────── */}
      <motion.span
        className={cn(
          "relative z-10 mt-0.5 truncate text-[10.5px] font-semibold leading-none tracking-wide",
          isActive
            ? "text-green"
            : "text-zinc-500 group-hover:text-zinc-300",
        )}
        animate={
          reduced
            ? undefined
            : {
                y: isActive ? -1 : 0,
                opacity: isActive ? 1 : 0.70,
                scale: isActive ? 1.03 : 1,
              }
        }
        transition={reduced ? undefined : LABEL_SPRING}
      >
        {tab.label}
      </motion.span>
    </motion.button>
  );
});

// ── The Bar ──────────────────────────────────────────────────────────────
export function LiquidGlassBar({ tabs, activeKey, onSelect, className }: LiquidGlassBarProps) {
  const reduceMotion = useReducedMotion();
  const [ripples, setRipples] = useState<
    Array<{ id: number; x: number; y: number; delay: number }>
  >([]);
  const rippleId = useRef(0);
  const navRef = useRef<HTMLElement>(null);

  const activeIndex = Math.max(0, tabs.findIndex((t) => t.key === activeKey));
  const cellPct = 100 / tabs.length;

  // ── Velocity-driven liquid morphing ─────────────────────────────────
  const mvIndex = useMotionValue(activeIndex);
  const springIndex = useSpring(mvIndex, CAPSULE_SPRING);
  const velocity = useVelocity(springIndex);

  // Stretch: pill elongates in the direction of travel (Apple liquid feel)
  const scaleX = useTransform(velocity, (v) => {
    const abs = Math.abs(v);
    return 1 + Math.min(abs * 0.22, 0.55);
  });
  // Squash: conserve volume (Poisson-like)
  const scaleY = useTransform(velocity, (v) => {
    const abs = Math.abs(v);
    return 1 - Math.min(abs * 0.08, 0.18);
  });
  // Organic warp skew
  const skewX = useTransform(velocity, (v) => {
    return Math.max(-5, Math.min(5, v * 1.0));
  });
  // Slight vertical bounce during travel (liquid pull)
  const translateY = useTransform(velocity, (v) => {
    const abs = Math.abs(v);
    return -Math.min(abs * 0.5, 3.0);
  });

  // Dynamic glow intensity tied to velocity
  const glowOpacity = useTransform(velocity, [0, 5], [0.20, 0.55]);
  const glowSpread = useTransform(velocity, [0, 5], [16, 32]);
  const glowShadow = useMotionTemplate`
    0 ${glowSpread}px ${glowSpread}px -4px hsla(152, 85%, 55%, ${glowOpacity}),
    0 8px 32px -6px hsla(152, 72%, 48%, 0.14),
    inset 0 1px 0 0 hsla(0, 0%, 100%, 0.22),
    inset 0 -1px 0 0 hsla(152, 72%, 48%, 0.15)
  `;

  useEffect(() => {
    mvIndex.set(activeIndex);
  }, [activeIndex, mvIndex]);

  // ── Handle window resize / orientation change ───────────────────────
  useEffect(() => {
    const onResize = () => {
      // Force layout recalc for capsule positioning
      navRef.current?.getBoundingClientRect();
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handlePress = useCallback(
    (key: string, e: React.MouseEvent<HTMLButtonElement>) => {
      onSelect(key);
      if (reduceMotion) return;
      const rect = e.currentTarget.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      // Multi-wave ripple: three waves staggered for liquid feel
      rippleId.current += 1;
      const id1 = rippleId.current;
      rippleId.current += 1;
      const id2 = rippleId.current;
      rippleId.current += 1;
      const id3 = rippleId.current;
      setRipples((prev) => [
        ...prev,
        { id: id1, x, y, delay: 0 },
        { id: id2, x, y, delay: 60 },
        { id: id3, x, y, delay: 120 },
      ]);
    },
    [onSelect, reduceMotion],
  );

  const removeRipple = useCallback((id: number) => {
    setRipples((prev) => prev.filter((r) => r.id !== id));
  }, []);

  return (
    <nav
      ref={navRef}
      aria-label="Primary navigation"
      role="navigation"
      className={cn(
        "fixed inset-x-0 bottom-0 z-50",
        "pb-[max(0.55rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <LayoutGroup id="signal-nav">
        <div className="liquid-glass-shell mx-auto max-w-[440px] h-[72px] rounded-[28px] px-1.5">
          {/* Bottom edge reflection */}
          <div className="liquid-glass-reflection" aria-hidden />
          {/* Inner noise texture */}
          <div
            className="liquid-glass-inner relative grid h-full grid-cols-5 items-center"
            role="tablist"
          >
            {/* ── The liquid capsule (single element, layout-animated) ─── */}
            <motion.div
              layout
              className="pointer-events-none absolute z-0"
              initial={false}
              style={{
                width: `${cellPct}%`,
                left: `${activeIndex * cellPct}%`,
                top: "6px",
                bottom: "6px",
              }}
              transition={reduceMotion ? { duration: 0 } : GLIDE_TWEEN}
            >
              <motion.span
                className="liquid-glass-pill absolute inset-x-[4px] inset-y-0"
                style={{
                  scaleX: reduceMotion ? 1 : scaleX,
                  scaleY: reduceMotion ? 1 : scaleY,
                  skewX: reduceMotion ? 0 : skewX,
                  y: reduceMotion ? 0 : translateY,
                  boxShadow: reduceMotion
                    ? "0 4px 18px -2px hsla(152, 85%, 55%, 0.18), inset 0 1px 0 0 hsla(0, 0%, 100%, 0.22)"
                    : glowShadow,
                }}
                transition={reduceMotion ? { duration: 0 } : CAPSULE_SPRING}
              />
            </motion.div>

            {/* ── Ripple layer (above all tabs, below capsule) ──────── */}
            <span
              className="absolute inset-0 z-[5] overflow-hidden rounded-[28px] pointer-events-none"
              aria-hidden
            >
              <AnimatePresence>
                {ripples.map((r) => (
                  <Ripple
                    key={r.id}
                    x={r.x}
                    y={r.y}
                    delay={r.delay}
                    onDone={() => removeRipple(r.id)}
                  />
                ))}
              </AnimatePresence>
            </span>

            {/* ── Tab items ──────────────────────────────────────────── */}
            {tabs.map((tab) => (
              <TabButton
                key={tab.key}
                tab={tab}
                isActive={tab.key === activeKey}
                handlePress={handlePress}
                reduceMotion={reduceMotion}
              />
            ))}
          </div>
        </div>
      </LayoutGroup>
    </nav>
  );
}
