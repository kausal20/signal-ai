// signal-ui-v2 · components/CountUp.tsx
// ---------------------------------------------------------------------------
// Reusable count-up number with viewport trigger and subtle scale pulse at
// completion. Respects prefers-reduced-motion. Zero deps beyond framer-motion.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { motion as fm, useInView, useReducedMotion } from "framer-motion";

interface Props {
  value: number;
  duration?: number;       // ms
  className?: string;
  format?: (n: number) => string;
}

export function CountUp({ value, duration = 900, className, format }: Props) {
  const reduce = useReducedMotion();
  const ref = useRef<HTMLSpanElement>(null);
  const isInView = useInView(ref, { once: true, amount: 0.5 });
  const [shown, setShown] = useState(reduce ? value : 0);
  const [complete, setComplete] = useState(false);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) { setShown(value); setComplete(true); return; }
    // Wait for viewport
    if (!isInView) return;

    const start = performance.now();
    const from = 0;
    const delta = value - from;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);         // easeOutCubic
      setShown(Math.round(from + delta * eased));
      if (p < 1) {
        raf.current = requestAnimationFrame(tick);
      } else {
        setComplete(true);
      }
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduce, isInView]);

  return (
    <fm.span
      ref={ref}
      className={className}
      animate={
        complete && !reduce
          ? { scale: [1, 1.06, 1] }
          : undefined
      }
      transition={
        complete && !reduce
          ? { duration: 0.3, ease: [0.22, 1, 0.36, 1] }
          : undefined
      }
    >
      {format ? format(shown) : shown}
    </fm.span>
  );
}
