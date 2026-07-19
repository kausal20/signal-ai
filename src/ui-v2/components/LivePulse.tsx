// signal-ui-v2 · components/LivePulse.tsx
// ---------------------------------------------------------------------------
// The app's heartbeat: a gentler, never-blinking green dot with expanding
// glow ring + live status line. Feels alive without being distracting.
// ---------------------------------------------------------------------------
import { motion as fm, useReducedMotion } from "framer-motion";
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
  const reduce = useReducedMotion();

  const dot = (
    <span className="relative flex h-[7px] w-[7px] shrink-0">
      {/* Core dot — always visible, gentle opacity cycle (never blinks to 0) */}
      <fm.span
        className="absolute inset-0 rounded-full bg-green shadow-[0_0_8px_hsl(152_72%_52%)]"
        animate={reduce ? undefined : { opacity: [1, 0.7, 1], scale: [1, 1.15, 1] }}
        transition={reduce ? undefined : { duration: 2.8, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Expanding glow ring — soft and subtle */}
      {!reduce && (
        <fm.span
          className="absolute inset-0 rounded-full border border-green/40"
          animate={{ scale: [1, 2.2], opacity: [0.5, 0] }}
          transition={{ duration: 2.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
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
    <fm.div
      initial={reduce ? undefined : { opacity: 0, y: -6 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={reduce ? undefined : { duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "flex items-center gap-2.5 overflow-hidden rounded-2xl border border-green/[0.16] bg-green/[0.06] px-3.5 py-2.5",
        className
      )}
    >
      {dot}
      <span className="whitespace-nowrap text-xs font-medium text-foreground/85">{label}</span>
    </fm.div>
  );
}
