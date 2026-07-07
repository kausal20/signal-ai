// signal-ui-v2 · components/SignalProgress.tsx
import { cn } from "@/lib/utils";
import { clamp } from "@/lib/utils";

interface Props {
  /** 0–100. */
  value: number;
  /** Optional label shown above the bar. */
  label?: string;
  /** Optional right-aligned value text (e.g. a strength word). */
  valueLabel?: string;
  valueColor?: string;
  className?: string;
  /** Animate the fill from 0 on mount (CSS keyframe). */
  animate?: boolean;
}

/** Thin progress / strength bar used for "Signal is learning" rows. */
export function SignalProgress({ value, label, valueLabel, valueColor, className, animate = true }: Props) {
  const pct = clamp(value);
  return (
    <div className={className}>
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
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r from-[hsl(152_72%_42%)] to-[hsl(152_72%_55%)] shadow-[0_0_8px_hsl(152_72%_48%/0.4)]",
            animate && "animate-[fillBar_1.1s_cubic-bezier(0.2,0,0,1)_both]"
          )}
          style={{ width: `${pct}%`, ["--w" as string]: `${pct}%` }}
        />
      </div>
    </div>
  );
}
