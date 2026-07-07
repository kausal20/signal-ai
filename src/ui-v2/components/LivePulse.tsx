// signal-ui-v2 · components/LivePulse.tsx
import { cn } from "@/lib/utils";

interface Props {
  /** e.g. "Tracking 1,240 sources right now" or "3 critical in the last hour". */
  label: React.ReactNode;
  className?: string;
  /** Compact inline variant (just the dot + label, no card). */
  bare?: boolean;
}

/** The app's heartbeat: a breathing green dot + live status line. */
export function LivePulse({ label, className, bare }: Props) {
  const dot = (
    <span className="relative flex h-[7px] w-[7px] shrink-0">
      <span className="absolute inset-0 animate-[pulse-dot_2.2s_ease-in-out_infinite] rounded-full bg-green shadow-[0_0_8px_hsl(152_72%_52%)]" />
    </span>
  );

  if (bare) {
    return (
      <span className={cn("inline-flex items-center gap-2 text-[11px] font-medium text-muted-foreground", className)}>
        {dot}
        {label}
      </span>
    );
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2.5 overflow-hidden rounded-2xl border border-green/[0.16] bg-green/[0.06] px-3.5 py-2.5",
        className
      )}
    >
      {dot}
      <span className="whitespace-nowrap text-xs font-medium text-foreground/85">{label}</span>
    </div>
  );
}
