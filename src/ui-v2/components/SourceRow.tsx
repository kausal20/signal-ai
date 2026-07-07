// signal-ui-v2 · components/SourceRow.tsx
// ---------------------------------------------------------------------------
// Premium source card — brand logo with activity ring, name, signal count,
// hover glow effect. Replaces plain rows with elevated card-style layout.
// ---------------------------------------------------------------------------
import { ChevronRight } from "lucide-react";
import { BrandLogo } from "../icons/BrandLogo";
import type { SourceSummary } from "../shared/types";

interface Props {
  source: SourceSummary;
  onClick?: (key: string) => void;
  /** Max count across all sources (for computing ring fill). Defaults to 100. */
  maxCount?: number;
  /** Stagger index for entrance animation. */
  index?: number;
}

/** Premium source card with activity ring, logo, and hover glow. */
export function SourceRow({ source, onClick, maxCount = 100, index = 0 }: Props) {
  const countNum = parseInt(source.count.replace(/[^0-9]/g, ""), 10) || 0;
  const ringPct = Math.min(100, Math.max(8, (countNum / maxCount) * 100));

  return (
    <button
      type="button"
      onClick={() => onClick?.(source.key)}
      className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 py-3 text-left transition-all duration-200 hover:border-green/15 hover:bg-white/[0.045] active:scale-[0.985]"
    >
      {/* Logo with activity ring */}
      <span
        className="station-ring flex h-10 w-10 shrink-0 items-center justify-center p-[2.5px]"
        style={{
          ['--ring-target' as string]: ringPct,
          ['--ring-delay' as string]: `${150 + index * 80}ms`,
        }}
      >
        <span className="flex h-full w-full items-center justify-center rounded-full bg-[#0a0a0a] transition-shadow duration-300 group-hover:shadow-[0_0_12px_hsl(152_72%_48%/0.12)]">
          <BrandLogo source={source.key} name={source.name} size={17} />
        </span>
      </span>

      {/* Name + count */}
      <div className="min-w-0 flex-1">
        <div className="text-[13.5px] font-semibold text-foreground">{source.name}</div>
        <div className="mt-0.5 flex items-center gap-1">
          <span className="font-mono-tight text-[11px] font-bold text-green">{source.count}</span>
          <span className="text-[11px] text-muted-foreground/70">signals today</span>
        </div>
      </div>

      {/* Arrow */}
      <ChevronRight className="h-4 w-4 shrink-0 text-white/20 transition-all duration-200 group-hover:translate-x-0.5 group-hover:text-green/50" />
    </button>
  );
}
