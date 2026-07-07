// signal-onboarding-ui · steps/GoalStep.tsx  (Step 4 of 9)
// Tactile rows, auto-advance on select. Options via props.
import { OptionRow } from "../components/OptionCard";
import { GOALS } from "../data/onboarding-options";
import type { Option } from "../shared/types";

interface Props {
  options?: Option[];
  value: string | null;
  onSelect: (id: string) => void;
}

export function GoalStep({ options = GOALS, value, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col px-[22px] pt-24">
      <div className="mb-5 animate-fade-up">
        <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-green">ABOUT YOU · 2 / 3</div>
        <h2 className="text-[25px] font-extrabold tracking-[-0.02em] text-foreground">What are you here to do?</h2>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-7">
        <div className="flex flex-col gap-[11px]">
          {options.map((o) => (
            <OptionRow key={o.id} option={o} selected={value === o.id} onSelect={() => onSelect(o.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
