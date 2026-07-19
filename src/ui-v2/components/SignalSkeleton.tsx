// signal-ui-v2 · components/SignalSkeleton.tsx
// ---------------------------------------------------------------------------
// Premium skeleton loading with wave shimmer pattern, animated gradient, and
// smoother timing. Replaces basic shimmer with a more premium loading feel.
// ---------------------------------------------------------------------------
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Shortcut for common shapes. */
  variant?: "line" | "card" | "circle";
  /** Use the upgraded wave shimmer instead of basic shimmer. */
  wave?: boolean;
}

/** Shimmering placeholder for loading states. Uses `.skeleton` or `.motion-wave-shimmer`. */
export function SignalSkeleton({ className, variant = "line", wave = true }: Props) {
  const base =
    variant === "circle" ? "rounded-full" : variant === "card" ? "rounded-2xl" : "rounded-md";
  const size =
    variant === "circle" ? "h-12 w-12" : variant === "card" ? "h-28 w-full" : "h-4 w-full";
  return (
    <div className={cn(wave ? "motion-wave-shimmer" : "skeleton", base, size, className)} />
  );
}

/** A ready-made feed-card skeleton row with wave loading. */
export function FeedCardSkeleton() {
  return (
    <div className="rounded-2xl border border-white/[0.06] bg-white/[0.028] p-4">
      <div className="mb-2.5 flex items-center gap-2">
        <SignalSkeleton className="h-3 w-16" />
        <SignalSkeleton className="h-3 w-10" />
      </div>
      <SignalSkeleton className="mb-2 h-4 w-4/5" />
      <SignalSkeleton className="h-3 w-3/5" />
    </div>
  );
}
