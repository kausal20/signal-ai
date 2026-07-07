// signal-ui-v2 · components/Timeline.tsx
import { Check, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanStep } from "../shared/types";

interface Props {
  steps: PlanStep[];
  onToggleStep?: (id: string) => void;
  /** Label for the completion row at the bottom. */
  doneLabel?: string;
  className?: string;
}

/**
 * Vertical check-off timeline (Advisor "today's plan"). Toggling is delegated
 * to the parent via `onToggleStep`; this component holds no state.
 */
export function Timeline({ steps, onToggleStep, doneLabel = "That's a wrap — you're done for today.", className }: Props) {
  const allDone = steps.length > 0 && steps.every((s) => s.done);

  return (
    <div className={cn("relative", className)}>
      {steps.map((step, i) => {
        const last = i === steps.length - 1;
        return (
          <div key={step.id} className="relative flex gap-[15px] pb-[18px]">
            <div className="relative flex shrink-0 flex-col items-center">
              <button
                type="button"
                aria-pressed={!!step.done}
                aria-label={`${step.done ? "Completed" : "Mark complete"}: ${step.title}`}
                onClick={() => onToggleStep?.(step.id)}
                className={cn(
                  "flex h-[34px] w-[34px] items-center justify-center rounded-full border-2 transition-all active:scale-[0.88]",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                  step.done
                    ? "border-green bg-green shadow-[0_0_14px_hsl(152_72%_48%/0.4)]"
                    : "border-white/[0.18] bg-transparent"
                )}
              >
                {step.done ? (
                  <Check className="h-[17px] w-[17px] text-black" strokeWidth={3.4} />
                ) : (
                  <span className="h-[7px] w-[7px] rounded-full bg-white/30" />
                )}
              </button>
              {!last && (
                <div
                  className={cn(
                    "mt-1 min-h-[24px] w-0.5 flex-1 rounded",
                    step.done ? "bg-green/50" : "bg-white/[0.08]"
                  )}
                />
              )}
            </div>

            <div className="flex-1 cursor-pointer pt-px" onClick={() => onToggleStep?.(step.id)}>
              <span
                className={cn(
                  "mb-1.5 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1",
                  step.done ? "border-green/[0.22] bg-green/10" : "border-white/[0.07] bg-white/[0.04]"
                )}
              >
                <Clock className={cn("h-3 w-3", step.done ? "text-green" : "text-muted-foreground")} />
                <span className={cn("font-mono-tight text-[10.5px] font-bold", step.done ? "text-green" : "text-muted-foreground")}>
                  {step.time}
                </span>
              </span>
              <div
                className={cn(
                  "text-[15px] font-semibold leading-snug",
                  step.done ? "text-muted-foreground line-through" : "text-foreground"
                )}
              >
                {step.title}
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex items-center gap-[15px]">
        <div className="flex w-[34px] shrink-0 justify-center">
          <div
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-full border-2 transition-all",
              allDone ? "border-green bg-green shadow-[0_0_16px_hsl(152_72%_48%/0.5)]" : "border-white/[0.14]"
            )}
          >
            {allDone && <Check className="h-[15px] w-[15px] text-black" strokeWidth={3.2} />}
          </div>
        </div>
        <span className={cn("text-sm font-bold", allDone ? "text-green" : "text-muted-foreground")}>
          {allDone ? doneLabel : "Done"}
        </span>
      </div>
    </div>
  );
}
