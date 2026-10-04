// signal-onboarding-ui · steps/InterestsStep.tsx  (Step 5 of 9)
// Multi-select chips with a live counter + gated CTA (min 3). Controlled.
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { INTERESTS, MIN_INTERESTS } from "../data/onboarding-options";

interface Props {
  options?: string[];
  selected: string[];
  onToggle: (label: string) => void;
  onContinue: () => void;
  min?: number;
}

export function InterestsStep({ options = INTERESTS, selected, onToggle, onContinue, min = MIN_INTERESTS }: Props) {
  const valid = selected.length >= min;
  return (
    <div className="relative flex h-full flex-col px-[22px] pt-24">
      <div className="mb-[18px] animate-fade-up">
        <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-ed-accent-ink">ABOUT YOU · 3 / 3</div>
        <h2 className="ed-serif mb-1.5 text-[25px] font-semibold tracking-[-0.02em] text-ed-text">What should your feed cover?</h2>
        <p className="text-[13px] text-ed-text-2">Pick at least {min}. Your feed builds as you tap.</p>
      </div>

      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-[120px]">
        <div className="flex flex-wrap gap-[9px]">
          {options.map((label) => {
            const on = selected.includes(label);
            return (
              <button
                key={label}
                type="button"
                aria-pressed={on}
                onClick={() => onToggle(label)}
                className={cn(
                  "rounded-full border px-[15px] py-2.5 text-[12.5px] font-semibold transition-all active:scale-[0.93]",
                  on
                    ? "border-ed-accent bg-ed-accent-ink text-ed-on-accent "
                    : "border-ed-border-strong bg-ed-surface text-ed-text-2"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-ed-bg px-[22px] pb-[22px] pt-[18px]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-ed-text-2">Topics selected</span>
          <span className={cn("ed-numeral text-[13px] font-semibold", valid ? "text-ed-accent-ink" : "text-ed-text-2")}>
            {selected.length}{valid ? "" : ` / ${min} min`}
          </span>
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={onContinue}
          className={cn(
            "flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold transition-all active:scale-[0.98]",
            valid ? "bg-ed-accent-ink text-ed-on-accent " : "cursor-not-allowed bg-ed-surface text-ed-text-3"
          )}
        >
          Build my feed {valid && <ArrowRight className="h-[17px] w-[17px]" />}
        </button>
      </div>
    </div>
  );
}
