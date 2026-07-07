// signal-ui-v2 · components/SignalInput.tsx
// ---------------------------------------------------------------------------
// Premium glass search bar — animated radar icon, soft green glow on focus,
// better placeholder typography, voice waveform, floating appearance.
// ---------------------------------------------------------------------------
import { forwardRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props extends React.InputHTMLAttributes<HTMLInputElement> {
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  /** Visually emphasize the field (green ring/glow) when active. */
  active?: boolean;
}

/** Radar icon — concentric rings when idle, solid search glass when typing. */
function RadarIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg width="20" height="20" viewBox="0 0 20 20" fill="none" className="text-green transition-all duration-300">
        <circle cx="8.5" cy="8.5" r="6" stroke="currentColor" strokeWidth="2" />
        <path d="M13 13L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }

  return (
    <span className="relative flex h-5 w-5 items-center justify-center">
      <span className="absolute inset-0 rounded-full border border-green/40 animate-[radar-ring_2.8s_ease-out_infinite]" />
      <span className="absolute inset-0 rounded-full border border-green/30 animate-[radar-ring_2.8s_ease-out_0.9s_infinite]" />
      <span className="h-2 w-2 rounded-full bg-green shadow-[0_0_6px_hsl(152_72%_48%/0.5)]" />
    </span>
  );
}

/** Voice waveform — breathing bars. */
function VoiceWaveform() {
  const delays = [0, 0.15, 0.35, 0.1, 0.25];
  return (
    <span className="flex h-3.5 items-end gap-[2px]">
      {delays.map((delay, i) => (
        <span
          key={i}
          className="w-[2px] rounded-full bg-muted-foreground/50"
          style={{
            height: '100%',
            animation: `wave-breathe 2s ease-in-out ${delay}s infinite`,
            transformOrigin: 'bottom',
          }}
        />
      ))}
    </span>
  );
}

/** Premium glass search input with animated gradient border. */
export const SignalInput = forwardRef<HTMLInputElement, Props>(function SignalInput(
  { iconLeft, iconRight, active, className, onFocus, onBlur, ...rest },
  ref
) {
  const [focused, setFocused] = useState(false);

  return (
    <div
      className={cn(
        "radar-search-capsule",
        focused && "is-focused",
        className
      )}
    >
      {/* Left: radar/search icon */}
      <span className="absolute left-4 top-1/2 z-10 flex -translate-y-1/2 shrink-0">
        {iconLeft ?? <RadarIcon active={!!active} />}
      </span>

      <input
        ref={ref}
        className={cn(
          "relative z-10 h-[54px] w-full rounded-[1.5rem] bg-transparent pl-12 pr-14 text-[14.5px] font-medium text-foreground caret-green outline-none",
          "placeholder:text-[14px] placeholder:font-normal placeholder:text-muted-foreground/50"
        )}
        onFocus={(e) => {
          setFocused(true);
          onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          onBlur?.(e);
        }}
        {...rest}
      />

      {/* Right: custom icon or voice waveform */}
      <span className="absolute right-3 top-1/2 z-10 flex -translate-y-1/2 items-center gap-2 shrink-0">
        {iconRight ?? (
          <button
            type="button"
            aria-label="Voice search"
            className="flex h-8 w-8 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.035] text-muted-foreground transition-all hover:border-green/20 hover:text-green active:scale-90"
          >
            <VoiceWaveform />
          </button>
        )}
      </span>
    </div>
  );
});
