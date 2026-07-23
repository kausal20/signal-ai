// Premium pull-to-refresh — Signal's flagship refresh interaction.
// ---------------------------------------------------------------------------
// Feels like Apple Mail / X / ChatGPT mobile: rubber-band pull, a glowing Signal
// mark with a circular progress ring that fills as you pull, a threshold pulse
// (with light haptic), rotating status messages while refreshing, and a green
// checkmark on success (or a warning on error). No CSS spinner, no default
// browser refresh. Incremental data fetch only (`onRefresh`) — the page and its
// scroll position never reload.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion as fm, useReducedMotion } from "framer-motion";
import { Check, AlertTriangle, Sparkles } from "lucide-react";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
  /** CSS selector for the actual scroll container (Home uses `[data-home-scroll]`). */
  scrollSelector?: string;
}

const THRESHOLD = 80;
const MAX_PULL = 120;
const INDICATOR_HEIGHT = 64;
const SUCCESS_MS = 900;
const ERROR_MS = 2000;

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

const STATUS_MESSAGES = [
  "Checking official company blogs...",
  "Scanning trusted media...",
  "Discovering breaking AI news...",
  "Updating market intelligence...",
  "Ranking today's signals...",
] as const;

/** Circular progress ring (0..1). Pure SVG so it's crisp on every DPR. */
function ProgressRing({ progress, spinning, reduce }: { progress: number; spinning: boolean; reduce: boolean }) {
  const R = 20;
  const C = 2 * Math.PI * R;
  const clamped = Math.max(0, Math.min(1, progress));
  return (
    <fm.svg
      width="52" height="52" viewBox="0 0 52 52"
      animate={spinning && !reduce ? { rotate: 360 } : undefined}
      transition={spinning && !reduce ? { duration: 1.6, ease: "linear", repeat: Infinity } : undefined}
    >
      <circle cx="26" cy="26" r={R} fill="none" stroke="hsl(0 0% 100% / 0.08)" strokeWidth="3" />
      <circle
        cx="26" cy="26" r={R} fill="none" stroke="hsl(152 72% 48%)" strokeWidth="3"
        strokeLinecap="round" strokeDasharray={C}
        strokeDashoffset={C * (1 - clamped)}
        transform="rotate(-90 26 26)"
        style={{ filter: "drop-shadow(0 0 6px hsl(152 72% 48% / 0.5))", transition: spinning ? "stroke-dashoffset 0.2s ease" : "none" }}
      />
    </fm.svg>
  );
}

export function PullToRefresh({ onRefresh, children, scrollSelector = "[data-home-scroll]" }: Props) {
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const armedRef = useRef(false);
  const scrollElRef = useRef<HTMLElement | null>(null);
  const [pull, setPull] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusIdx, setStatusIdx] = useState(0);
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
      setStatusIdx(0);
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

  // Rotate status messages while refreshing.
  useEffect(() => {
    if (phase !== "refreshing") return;
    const id = window.setInterval(() => setStatusIdx((i) => (i + 1) % STATUS_MESSAGES.length), 1700);
    return () => window.clearInterval(id);
  }, [phase]);

  const progress = phase === "refreshing" || phase === "success" || phase === "error"
    ? 1 : Math.min(pull / THRESHOLD, 1);
  const armed = pull >= THRESHOLD;
  const height = phase === "refreshing" || phase === "success" || phase === "error"
    ? INDICATOR_HEIGHT : phase === "dragging" ? pull : 0;

  // Screen-reader announcement per phase.
  const sr =
    phase === "refreshing" ? "Refreshing content"
    : phase === "success" ? "Content updated"
    : phase === "error" ? "Refresh failed, pull again to retry" : "";

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd} onTouchCancel={onTouchEnd}>
      <fm.div
        className="relative flex items-center justify-center overflow-hidden"
        animate={{ height }}
        transition={phase === "dragging" || reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 32, mass: 0.7 }}
      >
        {/* Ambient glow ring behind the indicator (fades in with progress). */}
        <fm.div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 mx-auto h-24 w-24 rounded-full bg-green/20 blur-2xl"
          animate={{ opacity: progress * 0.9, scale: 0.6 + progress * 0.5 }}
          transition={{ duration: 0.15 }}
        />

        <div className="relative flex flex-col items-center gap-1.5">
          <div className="relative flex h-[52px] w-[52px] items-center justify-center">
            <ProgressRing progress={progress} spinning={phase === "refreshing"} reduce={!!reduce} />

            {/* Signal mark / phase icon in the center */}
            <AnimatePresence mode="wait" initial={false}>
              {phase === "success" ? (
                <fm.span key="ok" className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-green text-black"
                  initial={reduce ? undefined : { scale: 0.4, opacity: 0 }}
                  animate={reduce ? undefined : { scale: [0.4, 1.15, 1], opacity: 1 }}
                  exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                >
                  <Check className="h-4 w-4 stroke-[3]" />
                </fm.span>
              ) : phase === "error" ? (
                <fm.span key="err" className="absolute flex h-6 w-6 items-center justify-center rounded-full bg-amber-400/90 text-black"
                  initial={reduce ? undefined : { scale: 0.4, opacity: 0 }}
                  animate={reduce ? undefined : { scale: 1, opacity: 1 }}
                  exit={reduce ? undefined : { scale: 0.6, opacity: 0 }}
                  transition={{ duration: 0.25 }}
                >
                  <AlertTriangle className="h-4 w-4" />
                </fm.span>
              ) : (
                <fm.span key="mark" className="absolute flex items-center justify-center text-green"
                  animate={reduce ? undefined : armed && phase === "dragging"
                    ? { scale: [1, 1.18, 1] }
                    : { scale: 1 }}
                  transition={armed && phase === "dragging" ? { duration: 0.4, ease: "easeOut" } : { duration: 0.2 }}
                  style={{ opacity: 0.35 + progress * 0.65 }}
                >
                  <Sparkles className="h-[18px] w-[18px]" />
                </fm.span>
              )}
            </AnimatePresence>
          </div>

          {/* Status line */}
          <AnimatePresence mode="wait" initial={false}>
            <fm.span
              key={`${phase}-${statusIdx}`}
              initial={reduce ? undefined : { opacity: 0, y: 4 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              exit={reduce ? undefined : { opacity: 0, y: -4 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              className={`whitespace-nowrap text-[11.5px] font-semibold tracking-[-0.01em] ${phase === "error" ? "text-amber-300" : phase === "success" ? "text-green" : "text-foreground/75"}`}
            >
              {phase === "refreshing" ? STATUS_MESSAGES[statusIdx]
                : phase === "success" ? "Updated just now"
                : phase === "error" ? "Couldn't refresh. Pull again to retry."
                : armed ? "Release to refresh"
                : phase === "dragging" ? "Pull to refresh"
                : ""}
            </fm.span>
          </AnimatePresence>
        </div>

        <span role="status" aria-live="polite" className="sr-only">{sr}</span>
      </fm.div>
      {children}
    </div>
  );
}
