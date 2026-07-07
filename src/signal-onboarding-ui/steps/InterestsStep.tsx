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
        <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-green">ABOUT YOU · 3 / 3</div>
        <h2 className="mb-1.5 text-[25px] font-extrabold tracking-[-0.02em] text-foreground">What should your feed cover?</h2>
        <p className="text-[13px] text-muted-foreground">Pick at least {min}. Your feed builds as you tap.</p>
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
                    ? "border-green bg-green text-black shadow-[0_0_18px_hsl(152_72%_48%/0.3)]"
                    : "border-white/[0.07] bg-white/[0.04] text-muted-foreground"
                )}
              >
                {label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,#070707_60%,transparent)] px-[22px] pb-[22px] pt-[18px]">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-xs text-muted-foreground">Topics selected</span>
          <span className={cn("font-mono-tight text-[13px] font-semibold", valid ? "text-green" : "text-muted-foreground")}>
            {selected.length}{valid ? "" : ` / ${min} min`}
          </span>
        </div>
        <button
          type="button"
          disabled={!valid}
          onClick={onContinue}
          className={cn(
            "flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold transition-all active:scale-[0.98]",
            valid ? "bg-green text-black shadow-[0_8px_30px_hsl(152_72%_48%/0.3)]" : "cursor-not-allowed bg-white/[0.05] text-white/20"
          )}
        >
          Build my feed {valid && <ArrowRight className="h-[17px] w-[17px]" />}
        </button>
      </div>
    </div>
  );
}
