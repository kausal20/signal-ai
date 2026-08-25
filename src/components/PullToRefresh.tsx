// Premium pull-to-refresh — Signal's flagship refresh interaction.
// ---------------------------------------------------------------------------
// A LIQUID BLOB, not a spinner ring — same material language as the bottom nav
// (LiquidGlassBar): green glass gradient, velocity-driven squash/stretch, inner
// refraction highlight, soft glow. Rubber-band pull, haptic on threshold, a
// brief elastic settle on release, a continuous "breathing" blob while
// refreshing, and a quick morph into a checkmark (or warning) on completion.
// No CSS spinner, no default browser refresh. Incremental data fetch only
// (`onRefresh`) — the page and its scroll position never reload.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  AnimatePresence, motion as fm, useMotionValue, useSpring, useTransform,
  useVelocity, useReducedMotion,
} from "framer-motion";
import { Check, AlertTriangle, Sparkles } from "lucide-react";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** CSS selector for the actual scroll container (Home uses `[data-home-scroll]`). */
  scrollSelector?: string;
}

const THRESHOLD = 80;
const MAX_PULL = 120;
const INDICATOR_HEIGHT = 68;
const SUCCESS_MS = 900;
const ERROR_MS = 2000;

// Same spring the bottom nav's liquid capsule uses — one material, one feel.
const BLOB_SPRING = { type: "spring" as const, mass: 0.5, stiffness: 320, damping: 24 };

type Phase = "idle" | "dragging" | "refreshing" | "success" | "error";

// Rubber-band resistance: the further you pull, the more it resists, easing
// asymptotically toward MAX_PULL (native iOS feel).
function resist(delta: number): number {
  if (delta <= 0) return 0;
  return MAX_PULL * (1 - Math.exp(-delta / MAX_PULL));
}

function tryHaptic(kind: "light" | "success" | "warning" = "light") {
  const nav = navigator as Navigator & { vibrate?: (p: number | number[]) => boolean };
  if (typeof nav.vibrate !== "function") return;
  try { nav.vibrate(kind === "success" ? [10, 30, 10] : kind === "warning" ? [20, 40] : 8); } catch { /* ignore */ }
}

/**
 * The liquid blob itself — a small glass droplet that grows with pull
 * distance, stretches along the pull axis with velocity (same physics as the
 * nav's capsule), and settles with a spring. Continuous gentle breathing while
 * refreshing; morphs into a check/warning glyph on completion.
 */
function LiquidBlob({
  pull, phase, reduce,
}: { pull: number; phase: Phase; reduce: boolean }) {
  const active = phase === "refreshing" || phase === "success" || phase === "error";
  const size = active ? 48 : 20 + Math.min(pull / THRESHOLD, 1) * 28; // 20 → 48px while dragging
  const progress = Math.max(0, Math.min(1, pull / THRESHOLD));
  const armed = pull >= THRESHOLD && phase === "dragging";

  // Velocity-driven squash/stretch, same technique as LiquidGlassBar.
  const pullMV = useMotionValue(0);
  const pullSpring = useSpring(pullMV, BLOB_SPRING);
  const velocity = useVelocity(pullSpring);
  useEffect(() => { pullMV.set(pull); }, [pull, pullMV]);

  const scaleY = useTransform(velocity, (v) => reduce ? 1 : 1 + Math.min(Math.abs(v) * 0.012, 0.35));
  const scaleX = useTransform(velocity, (v) => reduce ? 1 : 1 - Math.min(Math.abs(v) * 0.005, 0.14));

  const bg = phase === "error"
    ? "linear-gradient(145deg, hsl(38 92% 55% / 0.35) 0%, hsl(30 85% 48% / 0.22) 100%)"
    : "linear-gradient(145deg, hsl(152 72% 48% / 0.32) 0%, hsl(152 65% 42% / 0.20) 35%, hsl(152 60% 36% / 0.24) 65%, hsl(152 72% 48% / 0.20) 100%)";
  const glow = phase === "error"
    ? "0 4px 20px -2px hsl(38 92% 55% / 0.35), inset 0 1px 0 0 hsl(0 0% 100% / 0.25)"
    : `0 4px ${16 + progress * 16}px -2px hsl(152 85% 55% / ${0.18 + progress * 0.3}), inset 0 1px 0 0 hsl(0 0% 100% / 0.25)`;

  return (
    <fm.div
      aria-hidden
      className="relative flex items-center justify-center rounded-full border border-white/[0.12] backdrop-blur-md"
      style={{
        width: size, height: size, background: bg, boxShadow: glow,
        scaleX: phase === "dragging" ? scaleX : 1,
        scaleY: phase === "dragging" ? scaleY : 1,
      }}
      animate={
        phase === "refreshing" && !reduce
          ? { scale: [1, 1.08, 1] }
          : armed && !reduce
            ? { scale: [1, 1.12, 1] }
            : { scale: 1 }
      }
      transition={
        phase === "refreshing"
          ? { duration: 1.1, repeat: Infinity, ease: "easeInOut" }
          : armed
            ? { duration: 0.4, ease: "easeOut" }
            : BLOB_SPRING
      }
    >
      {/* Inner top highlight — liquid refraction, matches .liquid-glass-pill::before */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-[18%] top-[8%] h-[38%] rounded-full"
        style={{ background: "linear-gradient(180deg, hsl(0 0% 100% / 0.32) 0%, hsl(0 0% 100% / 0.04) 100%)" }}
      />

      <AnimatePresence mode="wait" initial={false}>
        {phase === "success" ? (
          <fm.span key="ok" className="relative flex items-center justify-center text-black"
            initial={reduce ? undefined : { scale: 0.4, opacity: 0 }}
            animate={reduce ? undefined : { scale: [0.4, 1.15, 1], opacity: 1 }}
            exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
          >
            <Check className="h-4 w-4 stroke-[3]" />
          </fm.span>
        ) : phase === "error" ? (
          <fm.span key="err" className="relative flex items-center justify-center text-black"
            initial={reduce ? undefined : { scale: 0.4, opacity: 0 }}
            animate={reduce ? undefined : { scale: 1, opacity: 1, x: [0, -3, 3, -2, 0] }}
            exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
            transition={{ duration: 0.35 }}
          >
            <AlertTriangle className="h-4 w-4" />
          </fm.span>
        ) : (
          <fm.span key="mark" className="relative flex items-center justify-center text-white"
            style={{ opacity: 0.4 + progress * 0.6 }}
            animate={reduce ? undefined : phase === "refreshing" ? { rotate: [0, 12, -12, 0] } : {}}
            transition={phase === "refreshing" ? { duration: 1.6, repeat: Infinity, ease: "easeInOut" } : undefined}
          >
            <Sparkles className="h-[15px] w-[15px]" />
          </fm.span>
        )}
      </AnimatePresence>
    </fm.div>
  );
}

export function PullToRefresh({ onRefresh, children, scrollSelector = "[data-home-scroll]" }: Props) {
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const armedRef = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const reduce = useReducedMotion();

  // Locate the actual scroll container (Home uses an inner element; touch events
  // still land on document, but scrollTop must come from the right node).
  useEffect(() => {
    const el = scrollSelector ? document.querySelector<HTMLElement>(scrollSelector) : null;
    scrollElRef.current = el;
  }, [scrollSelector]);

  const atTop = () => {
    const el = scrollElRef.current;
    return el ? el.scrollTop <= 0 : window.scrollY <= 0;
  };

  const onTouchStart = (e: React.TouchEvent) => {
    if (phase === "refreshing" || phase === "success") return;
    if (!atTop()) return;
    startY.current = e.touches[0].clientY;
  };

  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null || phase === "refreshing") return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta <= 0) return;
    const next = resist(delta);
    pullRef.current = next;
    setPull(next);
    setPhase("dragging");
    // Haptic + arm exactly once when crossing the threshold.
    if (!armedRef.current && next >= THRESHOLD) { armedRef.current = true; tryHaptic("light"); }
    else if (armedRef.current && next < THRESHOLD) armedRef.current = false;
  };

  const onTouchEnd = async () => {
    startY.current = null;
    const wasArmed = armedRef.current;
    armedRef.current = false;
    if (wasArmed && phase !== "refreshing") {
      setPhase("refreshing");
      setPull(0);
      try {
        await onRefresh();
        tryHaptic("success");
        setPhase("success");
        window.setTimeout(() => setPhase("idle"), SUCCESS_MS);
      } catch {
        tryHaptic("warning");
        setPhase("error");
        window.setTimeout(() => setPhase("idle"), ERROR_MS);
      }
    } else {
      setPhase("idle");
      setPull(0);
    }
  };

  const armed = pull >= THRESHOLD;
  const height = phase === "refreshing" || phase === "success" || phase === "error"
    ? INDICATOR_HEIGHT : phase === "dragging" ? pull : 0;

  // Screen-reader announcement per phase.
  const sr =
    phase === "refreshing" ? "Refreshing content"
    : phase === "success" ? "Content updated"
    : phase === "error" ? "Refresh failed, pull again to retry" : "";

  const label =
    phase === "refreshing" ? "Refreshing…"
    : phase === "success" ? "Updated"
    : phase === "error" ? "Couldn't refresh — pull to retry"
    : armed ? "Release to refresh"
    : phase === "dragging" ? "Pull to refresh"
    : "";

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <fm.div
        className="relative flex items-center justify-center overflow-hidden"
        animate={{ height }}
        transition={phase === "dragging" || reduce ? { duration: 0 } : BLOB_SPRING}
      >
        <div className="relative flex flex-col items-center gap-2">
          <LiquidBlob pull={pull} phase={phase} reduce={!!reduce} />

          <AnimatePresence mode="wait" initial={false}>
            {label && (
              <fm.span
                key={label}
                initial={reduce ? undefined : { opacity: 0, y: 4 }}
                animate={reduce ? undefined : { opacity: 1, y: 0 }}
                exit={reduce ? undefined : { opacity: 0, y: -4 }}
                transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                className={`whitespace-nowrap text-[11px] font-semibold tracking-[-0.01em] ${
                  phase === "error" ? "text-amber-300" : phase === "success" ? "text-green" : "text-foreground/60"
                }`}
              >
                {label}
              </fm.span>
            )}
          </AnimatePresence>
        </div>

        <span role="status" aria-live="polite" className="sr-only">{sr}</span>
      </fm.div>
      {children}
    </div>
  );
}
