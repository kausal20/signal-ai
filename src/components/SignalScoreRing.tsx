import { useEffect, useRef, useState } from "react";

interface Props {
  score: number;             // 0–100
  size?: number;             // px diameter
  showLabel?: boolean;       // render the tier word under the number
  className?: string;
}

// Signature metric: Signal Score, visualized as an animated circular ring.
// One consistent style everywhere (hero / top-3 / expanded card / advisor / weekly).
export function tierFor(score: number): { label: string; color: string } {
  if (score >= 90) return { label: "Excellent", color: "hsl(152 72% 48%)" };
  if (score >= 75) return { label: "High", color: "hsl(152 65% 52%)" };
  if (score >= 60) return { label: "Medium", color: "hsl(38 92% 55%)" };
  return { label: "Low", color: "hsl(0 55% 55%)" };
}

const prefersReduced = () =>
  typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function SignalScoreRing({ score, size = 56, showLabel = false, className = "" }: Props) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const { label, color } = tierFor(clamped);
  const stroke = Math.max(3, Math.round(size * 0.08));
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;

  // Animate the arc + the number from 0 → score on mount.
  const [shown, setShown] = useState(prefersReduced() ? clamped : 0);
  const raf = useRef<number | null>(null);
  useEffect(() => {
    if (prefersReduced()) { setShown(clamped); return; }
    const start = performance.now();
    const dur = 750;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3); // easeOutCubic
      setShown(Math.round(eased * clamped));
      if (p < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => { if (raf.current) cancelAnimationFrame(raf.current); };
  }, [clamped]);

  const offset = circ - (shown / 100) * circ;

  return (
    <div className={`relative inline-flex items-center justify-center ${className}`} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="hsl(0 0% 100% / 0.08)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeLinecap="round" strokeDasharray={circ} strokeDashoffset={offset}
          style={{ transition: prefersReduced() ? "none" : "stroke-dashoffset 80ms linear" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="font-extrabold font-mono-tight text-foreground" style={{ fontSize: size * 0.3 }}>{shown}</span>
        {showLabel && <span className="mt-0.5 font-bold uppercase tracking-wide" style={{ fontSize: size * 0.13, color }}>{label}</span>}
      </div>
    </div>
  );
}

// Inline ⭐ Signal Score chip (compact, no ring) for tight rows.
export function SignalScoreChip({ score }: { score: number }) {
  const { label, color } = tierFor(score);
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold">
      <span className="font-mono-tight font-bold" style={{ color }}>{Math.round(score)}</span>
      <span className="text-muted-foreground">{label}</span>
    </span>
  );
}
