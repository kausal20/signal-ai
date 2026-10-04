// signal-onboarding-ui · steps/TimeStep.tsx  (Step 6 of 9)
import { RadioRow } from "../components/OptionCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { TIME_OPTIONS } from "../data/onboarding-options";
import type { Option } from "../shared/types";

interface Props {
  options?: Option[];
  value: string | null;
  onSelect: (id: string) => void;
  onContinue: () => void;
}

export function TimeStep({ options = TIME_OPTIONS, value, onSelect, onContinue }: Props) {
  return (
    <div className="relative flex h-full flex-col px-[22px] pt-[100px]">
      <div className="mb-5 animate-fade-up">
        <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-ed-accent-ink">YOUR PACE</div>
        <h2 className="ed-serif text-2xl font-semibold leading-snug tracking-[-0.02em] text-ed-text">
          How much time can you invest in AI each week?
        </h2>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-[108px]" role="radiogroup" aria-label="Weekly time">
        <div className="flex flex-col gap-[11px]">
          {options.map((o) => (
            <RadioRow key={o.id} option={o} selected={value === o.id} onSelect={() => onSelect(o.id)} />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-ed-bg px-[22px] pb-[22px] pt-4">
        <PrimaryButton disabled={!value} onClick={onContinue}>Continue</PrimaryButton>
      </div>
    </div>
  );
}
