// signal-onboarding-ui · steps/RoleStep.tsx  (Step 3 of 9)
// Tactile icon grid. Selecting a card auto-advances (handled by parent via
// onSelect → the flow schedules onNext). Options come from props.
import { OptionCard } from "../components/OptionCard";
import { ROLES } from "../data/onboarding-options";
import type { Option } from "../shared/types";

interface Props {
  options?: Option[];
  value: string | null;
  onSelect: (id: string) => void;
}

export function RoleStep({ options = ROLES, value, onSelect }: Props) {
  return (
    <div className="flex h-full flex-col px-[22px] pt-24">
      <div className="mb-5 animate-fade-up">
        <div className="mb-2 text-[11px] font-bold tracking-[0.18em] text-green">ABOUT YOU · 1 / 3</div>
        <h2 className="text-[25px] font-extrabold tracking-[-0.02em] text-foreground">What best describes you?</h2>
      </div>
      <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto pb-7">
        <div className="grid grid-cols-2 gap-[11px]">
          {options.map((o) => (
            <OptionCard key={o.id} option={o} selected={value === o.id} onSelect={() => onSelect(o.id)} />
          ))}
        </div>
      </div>
    </div>
  );
}
