// signal-onboarding-ui · steps/LoadingStep.tsx
// Premium loading interstitial between Notifications → Success.
// Multi-phase messages, orbital rings, ambient glow, and polished progress bar.
import { useEffect, useState, useMemo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Check } from "lucide-react";
import signalLogo from "@/assets/signal-logo.png";

/* ── Phase messages ──────────────────────────────────────────────────── */
const PHASES = [
  { label: "Scanning your interests…",     icon: "scan"  },
  { label: "Personalizing your feed…",      icon: "feed"  },
  { label: "Curating high-signal updates…", icon: "signal" },
  { label: "Preparing your AI briefing…",   icon: "brief" },
  { label: "Almost ready…",                 icon: "done"  },
];

interface Props {
  onComplete: () => void;
}

export function LoadingStep({ onComplete }: Props) {
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [progress, setProgress] = useState(0);

  /* ── Progress engine ─────────────────────────────────────────────── */
  useEffect(() => {
    let completed = false;

    const progressTimer = window.setInterval(() => {
      setProgress((cur) => {
        if (cur >= 100) {
          if (!completed) {
            completed = true;
            window.setTimeout(onComplete, 500);
          }
          window.clearInterval(progressTimer);
          return 100;
        }
        return Math.min(100, cur + Math.max(0.65, (100 - cur) / 20));
      });
    }, 55);

    const messageTimer = window.setInterval(() => {
      setPhaseIndex((cur) => Math.min(cur + 1, PHASES.length - 1));
    }, 1000);

    return () => {
      window.clearInterval(progressTimer);
      window.clearInterval(messageTimer);
    };
  }, [onComplete]);

  /* ── Floating particles (memo'd so they don't re-randomise) ────── */
  const particles = useMemo(
    () =>
      Array.from({ length: 14 }, (_, i) => ({
        id: i,
        x: Math.random() * 100,
        y: Math.random() * 100,
        size: 2 + Math.random() * 3,
        dur: 3 + Math.random() * 4,
        delay: Math.random() * 3,
      })),
    [],
  );

  return (
    <div className="relative flex h-full flex-col items-center justify-center overflow-hidden px-8 py-8 text-center">

      {/* ── Ambient background layers ────────────────────────────────── */}
      {/* Large soft radial glow */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-[480px] w-[480px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-green/[0.07] blur-[120px]" />
      {/* Secondary warm accent glow */}
      <div className="pointer-events-none absolute left-[35%] top-[38%] h-[220px] w-[220px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-green/[0.04] blur-[80px]" />

      {/* ── Floating particles ───────────────────────────────────────── */}
      {particles.map((p) => (
        <motion.div
          key={p.id}
          className="pointer-events-none absolute rounded-full bg-green/30"
          style={{
            width: p.size,
            height: p.size,
            left: `${p.x}%`,
            top: `${p.y}%`,
          }}
          animate={{
            y: [0, -30, 0],
            opacity: [0, 0.7, 0],
          }}
          transition={{
            duration: p.dur,
            repeat: Infinity,
            delay: p.delay,
            ease: "easeInOut",
          }}
        />
      ))}

      {/* ── Main content card ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 18 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 160, damping: 18 }}
        className="relative z-10 flex w-full max-w-sm flex-col items-center"
      >
        {/* ── Orb + orbital rings ───────────────────────────────────── */}
        <div className="relative mb-10 flex h-[130px] w-[130px] items-center justify-center">
          {/* Outer orbit ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0 rounded-full border border-green/[0.12]"
            style={{
              borderTopColor: "hsl(152 72% 48% / 0.50)",
              borderRightColor: "hsl(152 72% 48% / 0.25)",
            }}
          />
          {/* Middle orbit ring (counter-rotating) */}
          <motion.div
            animate={{ rotate: -360 }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[12px] rounded-full border border-green/[0.08]"
            style={{
              borderBottomColor: "hsl(152 72% 48% / 0.40)",
              borderLeftColor: "hsl(152 72% 48% / 0.18)",
            }}
          />
          {/* Inner orbit ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 3.5, repeat: Infinity, ease: "linear" }}
            className="absolute inset-[24px] rounded-full border border-green/[0.06]"
            style={{
              borderTopColor: "hsl(152 72% 48% / 0.30)",
            }}
          />

          {/* Orbiting dot on outer ring */}
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
            className="absolute inset-0"
          >
            <div
              className="absolute h-[6px] w-[6px] rounded-full bg-green shadow-[0_0_8px_hsl(152_72%_48%/0.6)]"
              style={{ top: "-3px", left: "50%", transform: "translateX(-50%)" }}
            />
          </motion.div>

          {/* Center icon container */}
          <motion.div
            animate={{
              boxShadow: [
                "0 0 30px hsl(152 72% 48% / 0.15), 0 0 60px hsl(152 72% 48% / 0.08)",
                "0 0 40px hsl(152 72% 48% / 0.25), 0 0 80px hsl(152 72% 48% / 0.12)",
                "0 0 30px hsl(152 72% 48% / 0.15), 0 0 60px hsl(152 72% 48% / 0.08)",
              ],
            }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
            className="relative flex h-[68px] w-[68px] items-center justify-center rounded-[20px] border border-green/30 bg-[radial-gradient(circle_at_35%_30%,hsl(152_72%_58%/0.22),hsl(152_72%_48%/0.08)_50%,hsl(0_0%_5%/0.95)_80%)]"
          >
            <motion.div
              animate={{ rotate: [0, 8, -8, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 }}
            >
              <img
                src={signalLogo}
                alt="Signal"
                className="h-9 w-9 object-contain drop-shadow-[0_0_12px_hsl(152_72%_48%/0.5)]"
              />
            </motion.div>
          </motion.div>
        </div>

        {/* ── Phase message carousel ────────────────────────────────── */}
        <div className="relative mb-4 flex h-8 w-full items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.p
              key={phaseIndex}
              initial={{ opacity: 0, y: 10, filter: "blur(4px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -10, filter: "blur(4px)" }}
              transition={{ duration: 0.3 }}
              className="absolute text-[15px] font-semibold tracking-[-0.01em] text-foreground/90"
            >
              {PHASES[phaseIndex].label}
            </motion.p>
          </AnimatePresence>
        </div>

        {/* ── Phase checklist (completed steps) ──────────────────────── */}
        <div className="mb-8 flex flex-col items-center gap-1.5">
          {PHASES.map((phase, i) => {
            const isDone = i < phaseIndex;
            const isCurrent = i === phaseIndex;
            if (i > phaseIndex) return null;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, delay: 0.05 }}
                className="flex items-center gap-2"
              >
                {isDone ? (
                  <div className="flex h-[16px] w-[16px] items-center justify-center rounded-full bg-green/20">
                    <Check className="h-[10px] w-[10px] text-green" strokeWidth={3} />
                  </div>
                ) : (
                  <motion.div
                    animate={{ opacity: [0.4, 1, 0.4] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "easeInOut" }}
                    className="h-[6px] w-[6px] rounded-full bg-green shadow-[0_0_6px_hsl(152_72%_48%/0.5)]"
                  />
                )}
                <span
                  className={`text-[11px] tracking-wide ${
                    isDone
                      ? "text-green/60 line-through"
                      : isCurrent
                        ? "font-semibold text-foreground/70"
                        : "text-muted-foreground"
                  }`}
                >
                  {phase.label.replace("…", "")}
                </span>
              </motion.div>
            );
          })}
        </div>

        {/* ── Progress bar ───────────────────────────────────────────── */}
        <div className="w-full">
          <div className="relative h-[6px] w-full overflow-hidden rounded-full bg-white/[0.06]">
            {/* Glow behind the bar */}
            <motion.div
              className="absolute inset-y-0 left-0 rounded-full blur-[6px]"
              style={{
                width: `${progress}%`,
                background: "hsl(152 72% 48% / 0.4)",
              }}
            />
            {/* Actual bar */}
            <motion.div
              className="relative h-full rounded-full"
              style={{
                width: `${progress}%`,
                background:
                  "linear-gradient(90deg, hsl(152 72% 42%) 0%, hsl(152 72% 52%) 60%, hsl(148 80% 58%) 100%)",
              }}
              transition={{ duration: 0.1 }}
            >
              {/* Shimmer overlay on bar */}
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background:
                    "linear-gradient(90deg, transparent 0%, hsl(152 72% 78% / 0.25) 50%, transparent 100%)",
                  animation: "shimmer 2s ease-in-out infinite",
                }}
              />
            </motion.div>
          </div>

          {/* Percentage label */}
          <motion.p
            className="mt-3 text-[11px] font-mono tracking-widest text-green/50"
            animate={{ opacity: [0.5, 0.9, 0.5] }}
            transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
          >
            {Math.round(progress)}%
          </motion.p>
        </div>
      </motion.div>

      {/* ── Scoped keyframes ──────────────────────────────────────────── */}
      <style>{`
        @keyframes shimmer {
          0%   { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
      `}</style>
    </div>
  );
}
