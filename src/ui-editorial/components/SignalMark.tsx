import { cn } from "@/lib/utils";

/** The broadcast "signal" glyph — a source dot radiating three arcs. Echoes the
 *  arcs of the Signal logo without needing the heavy raster asset. */
export function SignalGlyph({ className, strokeWidth = 2 }: { className?: string; strokeWidth?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" className={cn("h-5 w-5", className)}>
      <circle cx="5" cy="12" r="1.9" fill="currentColor" />
      <path d="M9.2 8.6a5.4 5.4 0 0 1 0 6.8" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M12.9 5.9a9.4 9.4 0 0 1 0 12.2" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
      <path d="M16.6 3.2a13.4 13.4 0 0 1 0 17.6" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" />
    </svg>
  );
}

export function SignalWordmark({ className }: { className?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2 text-ed-text", className)}>
      <SignalGlyph className="h-[22px] w-[22px] text-ed-accent" strokeWidth={2.2} />
      <span className="text-[19px] font-semibold tracking-[-0.02em]">Signal</span>
    </span>
  );
}
