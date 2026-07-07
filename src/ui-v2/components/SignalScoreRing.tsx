// signal-ui-v2 · components/SignalScoreRing.tsx
// ---------------------------------------------------------------------------
// Signature metric: the Signal Score as an animated circular ring. This mirrors
// your production `components/SignalScoreRing.tsx` API (score / size / showLabel)
// so it is a DROP-IN REPLACEMENT, and adds a `caption` prop for the Advisor
// "conviction" ring. Animation is pure CSS/RAF and honors reduced motion.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { clamp, prefersReducedMotion } from "@/lib/utils";

interface Props {
  score: number;             // 0–100
  size?: number;             // px diameter
  showLabel?: boolean;       // render the tier word under the number
  caption?: string;          // fixed caption under the number (e.g. "CONVICTION")
  className?: string;
}

export function tierFor(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excellent", color: "hsl(152 72% 48%)" };
  if (score >= 75) return { label: "High", color: "hsl(152 65% 52%)" };
  if (score >= 60) return { label: "Medium", color: "hsl(38 92% 55%)" };
  return { label: "Low", color: "hsl(0 55% 55%)" };
}

export function SignalScoreRing({ score, size = 56, showLabel = false, caption, className = "" }: Props) {
  const clamped = clamp(Math.round(score));
  const { label, color } = tierFor(clamped);
  const stroke = Math.max(3, Math.round(size * 0.08));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  const [shown, setShown] = useState(prefersReducedMotion() ? clamped : 0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReducedMotion()) { setShown(clamped); return; }
    const start = performance.now();
    const dur = 750;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(Math.round(eased * clamped));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [clamped]);

  const offset = circ - (shown / 100) * circ;

  return (
    <div
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`Signal score ${clamped} out of 100`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(0 0% 100% / 0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{
            transition: prefersReducedMotion() ? "none" : "stroke-dashoffset 80ms linear",
            filter: "drop-shadow(0 0 5px hsl(152 72% 48% / 0.5))",
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-mono-tight font-extrabold text-foreground" style={{ fontSize: size * 0.3 }}>{shown}</span>
        {showLabel && (
          <span className="mt-0.5 font-bold uppercase tracking-wide" style={{ fontSize: size * 0.13, color }}>{label}</span>
        )}
        {!showLabel && caption && (
          <span className="mt-0.5 font-bold uppercase tracking-wide text-muted-foreground" style={{ fontSize: size * 0.12 }}>
            {caption}
          </span>
        )}
      </div>
    </div>
  );
}

/** Inline Signal Score chip (no ring) for tight rows. */
export function SignalScoreChip({ score }: { score: number }) {
  const { label, color } = tierFor(score);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
      <span className="font-mono-tight font-bold" style={{ color }}>{Math.round(score)}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
