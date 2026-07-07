// signal-ui-v2 · components/CountUp.tsx
// Reusable count-up number. Respects prefers-reduced-motion. Zero deps.
import { useEffect, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";

interface Props {
  value: number;
  duration?: number;       // ms
  className?: string;
  format?: (n: number) => string;
}

export function CountUp({ value, duration = 900, className, format }: Props) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  const raf = useRef<number | null>(null);

  useEffect(() => {
    if (reduce) { setShown(value); return; }
    const start = performance.now();
    const from = shown;
    const delta = value - from;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);         // easeOutCubic
      setShown(Math.round(from + delta * eased));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, duration, reduce]);

  return <span className={className}>{format ? format(shown) : shown}</span>;
}
