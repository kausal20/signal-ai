// signal-ui-v2 · components/SignalProgress.tsx
// ---------------------------------------------------------------------------
// Progress bar with viewport-triggered fill animation and pulsing glow on the
// leading edge. Only animates when scrolled into view.
// ---------------------------------------------------------------------------
import { useRef } from "react";
import { motion as fm, useInView, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/utils";
import { motionTokens } from "../animations/motion";

interface Props {
  /** 0–100. */
  value: number;
  /** Optional label shown above the bar. */
  label?: string;
  /** Optional right-aligned value text (e.g. a strength word). */
  valueLabel?: string;
  valueColor?: string;
  className?: string;
  /** Animate the fill from 0 on mount (default: true). */
  animate?: boolean;
}

/** Thin progress / strength bar used for "Signal is learning" rows. */
export function SignalProgress({ value, label, valueLabel, valueColor, className, animate = true }: Props) {
  const pct = clamp(value);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const shouldAnimate = animate && !reduce && isInView;

  return (
    <div ref={ref} className={className}>
      {(label || valueLabel) && (
        <div className="mb-2 flex items-center justify-between">
          {label && <span className="text-[13.5px] font-semibold text-foreground/90">{label}</span>}
          {valueLabel && (
            <span className="text-[11px] font-bold" style={{ color: valueColor ?? "hsl(var(--green))" }}>
              {valueLabel}
            </span>
          )}
        </div>
      )}
      <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
        <fm.div
          initial={animate && !reduce ? { width: 0 } : undefined}
          animate={shouldAnimate ? { width: `${pct}%` } : reduce ? { width: `${pct}%` } : undefined}
          transition={
            shouldAnimate
              ? { duration: 1.1, ease: motionTokens.ease.premium }
              : undefined
          }
          className="relative h-full rounded-full bg-gradient-to-r from-[hsl(152_72%_42%)] to-[hsl(152_72%_55%)]"
          style={!animate || reduce ? { width: `${pct}%` } : undefined}
        >
          {/* Pulsing glow on the leading edge */}
          {!reduce && (
            <fm.span
              aria-hidden
              className="absolute right-0 top-1/2 h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full bg-green/60 blur-[6px]"
              animate={{ opacity: [0.4, 0.9, 0.4], scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
        </fm.div>
      </div>
    </div>
  );
}
