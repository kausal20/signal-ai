// signal-ui-v2 · components/CollectionCard.tsx
// ---------------------------------------------------------------------------
// Featured collection card — large title, short description, signal count badge,
// subtle glass effect, hover animation, and better typography hierarchy.
// ---------------------------------------------------------------------------
import { useRef, useState, useCallback } from "react";
import { Layers } from "lucide-react";
import { cn, prefersReducedMotion } from "@/lib/utils";
import type { Collection } from "../shared/types";

interface Props {
  collection: Collection;
  onClick?: (id: string) => void;
  className?: string;
}

/** Featured collection card with glass effect, sparkline, and hover lift. */
export function CollectionCard({ collection, onClick, className }: Props) {
  const { id, title, subtitle, stat, statLabel, sparkline } = collection;
  const cardRef = useRef<HTMLButtonElement>(null);
  const [tilt, setTilt] = useState({ x: 0, y: 0 });

  const handleMove = useCallback((e: React.PointerEvent) => {
    if (prefersReducedMotion()) return;
    const card = cardRef.current;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width - 0.5) * 8;
    const y = ((e.clientY - rect.top) / rect.height - 0.5) * -8;
    setTilt({ x, y });
  }, []);

  const handleLeave = useCallback(() => setTilt({ x: 0, y: 0 }), []);

  return (
    <button
      ref={cardRef}
      type="button"
      onClick={() => onClick?.(id)}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={cn(
        "group relative flex min-h-[170px] w-[220px] shrink-0 flex-col overflow-hidden rounded-[20px] border border-white/[0.08] p-5 text-left transition-all duration-300 active:scale-[0.98]",
        "bg-[linear-gradient(160deg,hsl(0_0%_100%/0.04),hsl(0_0%_100%/0.015)_60%)]",
        "backdrop-blur-sm",
        className
      )}
      style={{
        transform: `perspective(600px) rotateY(${tilt.x}deg) rotateX(${tilt.y}deg) translateY(${tilt.x !== 0 ? '-2px' : '0'})`,
        transformStyle: 'preserve-3d',
        boxShadow: tilt.x !== 0
          ? '0 16px 40px -12px hsl(152 72% 48% / 0.1), 0 8px 20px -8px hsl(0 0% 0% / 0.4)'
          : 'none',
      }}
    >
      {/* Ambient glow */}
      <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-green/[0.08] blur-[36px] transition-opacity duration-500 group-hover:opacity-100 opacity-60" />

      {/* Sparkline */}
      <div className="relative mb-auto">
        {sparkline && sparkline.length > 1 && <MiniSparkline values={sparkline} />}
      </div>

      {/* Content */}
      <div className="relative mt-3">
        <h3 className="mb-1.5 text-[15px] font-bold tracking-[-0.01em] text-foreground leading-snug">{title}</h3>
        {subtitle && (
          <p className="mb-3 text-[11.5px] leading-relaxed text-muted-foreground line-clamp-2">{subtitle}</p>
        )}
        <div className="flex items-center gap-1.5">
          <Layers className="h-3 w-3 text-green/70" />
          <span className="font-mono-tight text-[11px] font-bold text-green">{stat}</span>
          {statLabel && <span className="text-[11px] text-muted-foreground">{statLabel}</span>}
        </div>
      </div>

      {/* Subtle hover border glow */}
      <div className="pointer-events-none absolute inset-0 rounded-[20px] border border-green/0 transition-all duration-300 group-hover:border-green/15" />
    </button>
  );
}

/** Clean mini sparkline without excessive glow. */
function MiniSparkline({ values }: { values: number[] }) {
  const w = 90, h = 26;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 4) - 2;
    return [x, y] as const;
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" aria-hidden>
      <defs>
        <linearGradient id="sparkFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="hsl(152 72% 48%)" stopOpacity="0.15" />
          <stop offset="100%" stopColor="hsl(152 72% 48%)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#sparkFill)" />
      <path
        d={d}
        fill="none"
        stroke="hsl(152 72% 48%)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: prefersReducedMotion() ? "none" : "drop-shadow(0 0 3px hsl(152 72% 48% / 0.4))" }}
      />
      <circle cx={last[0]} cy={last[1]} r={2.5} fill="hsl(152 72% 48%)" />
    </svg>
  );
}
