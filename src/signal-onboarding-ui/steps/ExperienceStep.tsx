// signal-onboarding-ui · steps/ExperienceStep.tsx  (Step 7 of 9)
import { RadioRow } from "../components/OptionCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { EXPERIENCE_OPTIONS } from "../data/onboarding-options";
import type { Option } from "../shared/types";

interface Props {
  options?: Option[];
  value: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
}

export function ExperienceStep({ options = EXPERIENCE_OPTIONS, value, onSelect, onContinue }: Props) {
  return (
    <div className="relative flex h-full flex-col px-[22px] pt-[100px]">
      <div className="mb-5 animate-fade-up">
        <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-green">YOUR LEVEL</div>
        <h2 className="text-[25px] font-extrabold tracking-[-0.02em] text-foreground">What's your AI experience?</h2>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-[108px]" role="radiogroup" aria-label="Experience level">
        <div className="flex flex-col gap-[11px]">
          {options.map((o) => (
            <RadioRow key={o.id} option={o} selected={value === o.id} onSelect={() => onSelect(o.id)} />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-[linear-gradient(to_top,#070707_60%,transparent)] px-[22px] pb-[22px] pt-4">
        <PrimaryButton disabled={!value} onClick={onContinue}>Continue</PrimaryButton>
      </div>
    </div>
  );
}
