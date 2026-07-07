// signal-ui-v2 · components/SignalSkeleton.tsx
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  /** Shortcut for common shapes. */
  variant?: "line" | "card" | "circle";
}

/** Shimmering placeholder for loading states. Uses the `.skeleton` utility. */
export function SignalSkeleton({ className, variant = "line" }: Props) {
  const base =
    variant === "circle" ? "rounded-full" : variant === "card" ? "rounded-2xl" : "rounded-md";
  const size =
    variant === "circle" ? "h-12 w-12" : variant === "card" ? "h-28 w-full" : "h-4 w-full";
  return <div className={cn("skeleton", base, size, className)} />;
}

/** A ready-made feed-card skeleton row. */
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
