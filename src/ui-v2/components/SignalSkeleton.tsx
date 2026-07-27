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

/**
 * Full-page Home skeleton that MIRRORS the real HomePage layout (same paddings,
 * same section rhythm, same card dimensions) so when live data lands it swaps in
 * with ZERO layout shift — the cold-start experience instead of falling back to
 * a different (old) loading screen. Only shown on a true cold start (no cache).
 */
export function HomePageSkeleton() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden bg-[#070707]">
      {/* Header band — matches HomePage header padding (pt-[52px]) */}
      <div className="shrink-0 px-4 pb-3.5 pt-[52px] sm:px-5">
        <div className="mx-auto w-full max-w-[920px]">
          <div className="mb-3.5 flex items-center justify-between">
            <SignalSkeleton className="h-3 w-24" />
            <div className="flex items-center gap-2">
              <SignalSkeleton className="h-8 w-20 rounded-full" />
              <SignalSkeleton variant="circle" className="h-[34px] w-[34px]" />
            </div>
          </div>
          <SignalSkeleton className="h-7 w-2/3" />
          <SignalSkeleton className="mt-2 h-3 w-2/5" />
        </div>
      </div>

      {/* Body — matches ScreenShell body padding + gap-8 rhythm */}
      <div className="flex-1 overflow-hidden px-4 pt-2 sm:px-5">
        <div className="mx-auto flex w-full max-w-[920px] flex-col gap-8">
          <SignalSkeleton className="h-9 w-full rounded-full" />

          {/* Top Story */}
          <div>
            <SignalSkeleton className="mb-3 h-4 w-24" />
            <div className="min-h-[300px] rounded-[28px] border border-white/[0.08] bg-[#0a0d0a]/95 p-6">
              <SignalSkeleton className="mb-4 h-6 w-24 rounded-full" />
              <SignalSkeleton className="mb-2 h-7 w-[92%]" />
              <SignalSkeleton className="mb-5 h-7 w-[64%]" />
              <SignalSkeleton className="mb-2 h-4 w-full" />
              <SignalSkeleton className="mb-2 h-4 w-[88%]" />
              <SignalSkeleton className="h-4 w-[70%]" />
              <div className="mt-6 flex gap-2.5">
                <SignalSkeleton className="h-12 flex-1 rounded-full" />
                <SignalSkeleton className="h-12 flex-1 rounded-full" />
              </div>
            </div>
          </div>

          {/* Today's Brief — horizontal cards */}
          <div>
            <SignalSkeleton className="mb-3 h-4 w-28" />
            <div className="flex gap-3 overflow-hidden">
              {[0, 1].map((i) => (
                <div key={i} className="w-[68%] shrink-0 rounded-2xl border border-white/[0.06] bg-white/[0.028] p-4">
                  <SignalSkeleton className="mb-2 h-3 w-14" />
                  <SignalSkeleton className="mb-2 h-4 w-[90%]" />
                  <SignalSkeleton className="h-3 w-3/5" />
                </div>
              ))}
            </div>
          </div>

          {/* Latest Stories */}
          <div className="flex flex-col gap-3">
            <SignalSkeleton className="mb-1 h-4 w-28" />
            {[0, 1, 2, 3].map((i) => <FeedCardSkeleton key={i} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
