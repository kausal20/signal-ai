// signal-ui-v2 · components/TrendingRow.tsx
// ---------------------------------------------------------------------------
// Compact premium trending card — ~30% shorter than the previous version.
// Includes rank number, topic name, momentum bar, live indicator, trend arrow,
// and signal count. Easy to scan, breathable but dense.
// ---------------------------------------------------------------------------
import { ArrowUp, ArrowDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TrendingTerm } from "../shared/types";

interface Props {
  term: TrendingTerm;
  onClick?: (term: string) => void;
}

/** Compact trending card for the Search page leaderboard. */
export function TrendingRow({ term, onClick }: Props) {
  const top3 = term.rank <= 3;

  // Heat bar width based on momentum percentage
  const momentumNum = parseInt(term.momentum.replace(/[^0-9]/g, ""), 10) || 0;
  const heatPct = Math.min(100, Math.max(12, momentumNum / 4));

  return (
    <button
      type="button"
      onClick={() => onClick?.(term.term)}
      className="group flex w-full items-center gap-3 rounded-[14px] border border-white/[0.06] bg-white/[0.025] px-3.5 py-2.5 text-left transition-all duration-200 hover:border-green/15 hover:bg-white/[0.045] active:scale-[0.985]"
    >
      {/* Rank */}
      <span
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-mono-tight text-[12px] font-bold",
          top3
            ? "bg-green/12 text-green"
            : "bg-white/[0.04] text-white/25"
        )}
      >
        {term.rank}
      </span>

      {/* Name + heat bar */}
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-semibold text-foreground">{term.term}</span>
          {term.rising && (
            <span className="relative flex h-[5px] w-[5px] shrink-0">
              <span className="absolute inset-0 animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full bg-green" />
            </span>
          )}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <span className="font-mono-tight text-[10px] text-muted-foreground/70">{term.signals}</span>
          <span className="relative h-[2.5px] w-16 overflow-hidden rounded-full bg-white/[0.05]">
            <span
              className="absolute inset-y-0 left-0 rounded-full"
              style={{
                width: `${heatPct}%`,
                background: term.rising
                  ? 'linear-gradient(90deg, hsl(152 72% 48% / 0.25), hsl(152 72% 48%))'
                  : 'linear-gradient(90deg, hsl(38 92% 55% / 0.25), hsl(38 92% 55%))',
                animation: 'heat-fill 0.8s cubic-bezier(0.2, 0, 0, 1) forwards',
              }}
            />
          </span>
        </div>
      </div>

      {/* Momentum badge */}
      <span
        className={cn(
          "flex shrink-0 items-center gap-0.5 rounded-full px-2 py-1 font-mono-tight text-[10px] font-bold",
          term.rising
            ? "bg-green/10 text-green"
            : "bg-[hsl(38_92%_55%/0.08)] text-[hsl(38_92%_58%)]"
        )}
      >
        {term.rising ? <ArrowUp className="h-2.5 w-2.5" /> : <ArrowDown className="h-2.5 w-2.5" />}
        {term.momentum}
      </span>
    </button>
  );
}
