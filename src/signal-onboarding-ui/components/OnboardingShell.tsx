// signal-onboarding-ui · components/OnboardingShell.tsx
// ---------------------------------------------------------------------------
// Shared scaffold for every step: ambient glow, a top dot progress indicator,
// a back button, and the step body. Progress + back are UI navigation only.
// ---------------------------------------------------------------------------
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  /** 1-based current step. */
  step: number;
  /** Total steps (default 10). */
  total?: number;
  /** Show the back button (hidden on welcome + success). */
  showBack?: boolean;
  /** Hide the progress dots entirely (welcome, loading, success). */
  hideDots?: boolean;
  onBack?: () => void;
  children: React.ReactNode;
  className?: string;
}

export function OnboardingShell({ step, total = 10, showBack = true, hideDots = false, onBack, children, className }: Props) {
  // Steps visible in the dot indicator: name(2) through notifications(8) = steps 2–8
  // We show dots only for the "form" steps, not welcome/loading/success.
  const DOT_START = 2;  // first step that gets a dot (name)
  const DOT_END = 8;    // last step that gets a dot (notifications)
  const dotCount = DOT_END - DOT_START + 1; // 7 dots
  const activeDotIndex = step - DOT_START;   // which dot is current (-1 means before dots)

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#070707] text-foreground", className)}>
      {/* Ambient atmosphere */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -left-16 -top-24 h-72 w-72 rounded-full bg-green/[0.10] blur-[90px]" />
        <div className="absolute -right-20 bottom-20 h-64 w-64 rounded-full bg-green/[0.06] blur-[90px]" />
      </div>

      {/* Dot progress + back */}
      <div className="absolute inset-x-0 top-0 z-50">
        {/* Dot progress indicator — only shown for form steps */}
        {!hideDots && (
          <div className="flex items-center justify-center gap-[10px] pt-[52px] pb-2">
            {Array.from({ length: dotCount }).map((_, i) => {
              const isActive = i === activeDotIndex;
              const isCompleted = i < activeDotIndex;
              return (
                <div
                  key={i}
                  className="transition-all duration-300 ease-out rounded-full"
                  style={{
                    width: isActive ? "8px" : "6px",
                    height: isActive ? "8px" : "6px",
                    background: isActive
                      ? "hsl(152, 72%, 48%)"
                      : isCompleted
                        ? "hsl(152, 72%, 48%)"
                        : "rgba(255, 255, 255, 0.18)",
                    boxShadow: isActive
                      ? "0 0 8px hsl(152, 72%, 48%, 0.5)"
                      : "none",
                  }}
                />
              );
            })}
          </div>
        )}

        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className={cn(
              "absolute left-[18px] flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.07] bg-white/[0.05] text-foreground/80 transition-transform active:scale-90",
              hideDots ? "top-[52px]" : "top-[46px]"
            )}
          >
            <ChevronLeft className="h-[19px] w-[19px]" />
          </button>
        )}
      </div>

      {/* Step body */}
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
