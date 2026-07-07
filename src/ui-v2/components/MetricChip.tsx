// signal-ui-v2 · components/MetricChip.tsx
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  label: string;
  className?: string;
}

/** Compact "124 articles" style stat used on profile / hero surfaces. */
export function MetricChip({ value, label, className }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.04] px-2.5 py-1.5",
        className
      )}
    >
      <span className="font-mono-tight text-xs font-bold text-green">{value}</span>
      <span className="text-[11.5px] text-muted-foreground">{label}</span>
    </span>
  );
}
