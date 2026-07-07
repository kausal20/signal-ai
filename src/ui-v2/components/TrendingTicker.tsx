// signal-ui-v2 · components/TrendingTicker.tsx
// ---------------------------------------------------------------------------
// Horizontal scroll ticker cards — replaces the boring vertical TrendingRow
// list with a premium, auto-scrolling carousel of glowing glassmorphism tiles.
//
// Key features:
//   • #1 card is visually larger (~30%) with a crown badge & brighter glow
//   • Each card shows: rank, topic, momentum %, mini sparkline, signal count
//   • Auto-scrolls (marquee) when idle; pauses on hover/touch
//   • Green glow intensity scales with momentum
//   • Drag/swipe support for manual browsing
//   • Reduced-motion safe
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { Flame, ArrowUp, ArrowDown, Crown, Zap } from "lucide-react";
import { cn, prefersReducedMotion } from "@/lib/utils";
import type { TrendingTerm } from "../shared/types";

interface Props {
  trending: TrendingTerm[];
  onSelect?: (term: string) => void;
}

// ── Tiny sparkline generator ─────────────────────────────────────────────────
// Generates a deterministic pseudo-random sparkline from the term string
function generateSparkline(term: string, momentum: number): number[] {
  let seed = 0;
  for (let i = 0; i < term.length; i++) seed = ((seed << 5) - seed + term.charCodeAt(i)) | 0;
  const rand = () => { seed = (seed * 16807) % 2147483647; return (seed & 0x7fffffff) / 2147483647; };
  const points: number[] = [];
  let val = 30 + rand() * 20;
  for (let i = 0; i < 12; i++) {
    val += (rand() - 0.4) * 15; // slight upward bias
    val = Math.max(5, Math.min(95, val));
    points.push(val);
  }
  // Ensure the last 3 points trend upward if rising (momentum > 0)
  if (momentum > 0) {
    const boost = momentum / 100;
    points[points.length - 3] = Math.min(90, points[points.length - 3] + 5 * boost);
    points[points.length - 2] = Math.min(93, points[points.length - 2] + 8 * boost);
    points[points.length - 1] = Math.min(95, points[points.length - 1] + 12 * boost);
  }
  return points;
}

function MiniSparkline({ values, rising, className }: { values: number[]; rising: boolean; className?: string }) {
  const w = 64, h = 28;
  const max = Math.max(...values), min = Math.min(...values);
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w;
    const y = h - ((v - min) / (max - min || 1)) * (h - 6) - 3;
    return [x, y] as const;
  });
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const area = `${d} L ${w} ${h} L 0 ${h} Z`;
  const last = pts[pts.length - 1];
  const color = rising ? "hsl(152 72% 48%)" : "hsl(38 92% 55%)";

  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} className={cn("overflow-visible", className)} aria-hidden>
      <defs>
        <linearGradient id={`tickerFill-${rising}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#tickerFill-${rising})`} />
      <path
        d={d}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: prefersReducedMotion() ? "none" : `drop-shadow(0 0 3px ${color.replace(")", " / 0.5)")})` }}
      />
      <circle cx={last[0]} cy={last[1]} r={2} fill={color}>
        {!prefersReducedMotion() && (
          <animate attributeName="r" values="2;3;2" dur="2s" repeatCount="indefinite" />
        )}
      </circle>
    </svg>
  );
}

// ── Single Ticker Card ───────────────────────────────────────────────────────
function TickerCard({ term, isHero, onClick }: { term: TrendingTerm; isHero: boolean; onClick?: (t: string) => void }) {
  const momentumNum = parseInt(term.momentum.replace(/[^0-9]/g, ""), 10) || 0;
  const sparkline = useMemo(() => generateSparkline(term.term, momentumNum), [term.term, momentumNum]);
  const glowIntensity = Math.min(0.35, 0.08 + momentumNum / 800);

  return (
    <button
      type="button"
      onClick={() => onClick?.(term.term)}
      className={cn(
        "ticker-card group relative flex shrink-0 flex-col justify-between overflow-hidden text-left transition-all duration-300",
        "border border-white/[0.07] backdrop-blur-sm",
        "hover:border-green/20 active:scale-[0.97]",
        isHero
          ? "w-[168px] min-h-[164px] rounded-[20px] p-4"
          : "w-[138px] min-h-[144px] rounded-[18px] p-3.5"
      )}
      style={{
        background: `linear-gradient(160deg, hsl(0 0% 100% / 0.045), hsl(152 72% 48% / ${glowIntensity * 0.3}) 50%, hsl(0 0% 100% / 0.015) 100%)`,
      }}
    >
      {/* Ambient glow — intensity based on momentum */}
      <div
        className="pointer-events-none absolute -right-6 -top-6 rounded-full blur-2xl transition-opacity duration-500 group-hover:opacity-100"
        style={{
          width: isHero ? 100 : 80,
          height: isHero ? 100 : 80,
          background: `radial-gradient(circle, hsl(152 72% 48% / ${glowIntensity}), transparent 70%)`,
          opacity: 0.6,
        }}
      />

      {/* Top row: rank badge + rising flame */}
      <div className="relative flex items-center justify-between">
        <span
          className={cn(
            "flex items-center justify-center rounded-lg font-mono-tight text-[11px] font-bold",
            isHero ? "h-8 w-8 text-[13px]" : "h-6 w-6",
            term.rank <= 3
              ? "bg-green/15 text-green shadow-[0_0_12px_hsl(152_72%_48%/0.15)]"
              : "bg-white/[0.06] text-white/30"
          )}
        >
          {isHero && <Crown className="absolute -top-2.5 -right-1.5 h-3.5 w-3.5 text-green/80 rotate-12" />}
          {term.rank}
        </span>
        {term.rising && (
          <span className="flex items-center gap-0.5">
            <Flame className={cn("text-green", isHero ? "h-4 w-4" : "h-3 w-3")} />
            {isHero && (
              <span className="relative flex h-[5px] w-[5px]">
                <span className="absolute inset-0 animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full bg-green" />
              </span>
            )}
          </span>
        )}
      </div>

      {/* Topic name */}
      <div className="relative mt-2.5">
        <p className={cn(
          "font-bold text-foreground leading-snug line-clamp-2",
          isHero ? "text-[15px]" : "text-[13px]"
        )}>
          {term.term}
        </p>
      </div>

      {/* Sparkline chart */}
      <div className="relative mt-2">
        <MiniSparkline values={sparkline} rising={term.rising} />
      </div>

      {/* Bottom row: signal count + momentum */}
      <div className="relative mt-2 flex items-center justify-between">
        <span className={cn(
          "font-mono-tight text-muted-foreground/70",
          isHero ? "text-[11px]" : "text-[10px]"
        )}>
          {term.signals} signals
        </span>
        <span
          className={cn(
            "flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-mono-tight font-bold",
            isHero ? "text-[10px]" : "text-[9px]",
            term.rising
              ? "bg-green/10 text-green"
              : "bg-[hsl(38_92%_55%/0.08)] text-[hsl(38_92%_58%)]"
          )}
        >
          {term.rising ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
          {term.momentum}
        </span>
      </div>

      {/* Hover shine sweep */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/[0.04] to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
      </div>

      {/* Border glow on hover */}
      <div className="pointer-events-none absolute inset-0 rounded-[inherit] border border-green/0 transition-all duration-300 group-hover:border-green/15 group-hover:shadow-[0_0_20px_hsl(152_72%_48%/0.08)]" />
    </button>
  );
}

// ── Main TrendingTicker Component ────────────────────────────────────────────
export function TrendingTicker({ trending, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isPaused, setIsPaused] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartX = useRef(0);
  const scrollStartX = useRef(0);
  const reduce = prefersReducedMotion();

  // Auto-scroll (marquee) — smooth and continuous
  useEffect(() => {
    if (reduce || isPaused || isDragging) return;
    const el = scrollRef.current;
    if (!el) return;
    let raf: number;
    const speed = 0.35; // px per frame

    const tick = () => {
      if (!el) return;
      el.scrollLeft += speed;
      // Loop back smoothly when reaching the end
      if (el.scrollLeft >= el.scrollWidth - el.clientWidth - 2) {
        el.scrollLeft = 0;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [reduce, isPaused, isDragging]);

  // Drag-to-scroll (desktop)
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (reduce) return;
    setIsDragging(true);
    dragStartX.current = e.clientX;
    scrollStartX.current = scrollRef.current?.scrollLeft ?? 0;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  }, [reduce]);

  const handlePointerMove = useCallback((e: React.PointerEvent) => {
    if (!isDragging || !scrollRef.current) return;
    const dx = e.clientX - dragStartX.current;
    scrollRef.current.scrollLeft = scrollStartX.current - dx;
  }, [isDragging]);

  const handlePointerUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  if (trending.length === 0) return null;

  return (
    <div
      className="relative"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => { setIsPaused(false); setIsDragging(false); }}
      onTouchStart={() => setIsPaused(true)}
      onTouchEnd={() => setIsPaused(false)}
    >
      {/* Fade edges */}
      <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-5 z-10 bg-gradient-to-r from-background to-transparent" />
      <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-5 z-10 bg-gradient-to-l from-background to-transparent" />

      {/* Scrollable rail */}
      <div
        ref={scrollRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={cn(
          "no-scrollbar -mx-[22px] flex gap-3 overflow-x-auto px-[22px] pb-2 pt-1",
          isDragging ? "cursor-grabbing" : "cursor-grab",
          !reduce && "scroll-smooth"
        )}
        style={{ scrollBehavior: isDragging ? "auto" : undefined }}
      >
        {trending.map((t, i) => (
          <TickerCard
            key={t.rank}
            term={t}
            isHero={i === 0}
            onClick={onSelect}
          />
        ))}
      </div>
    </div>
  );
}
