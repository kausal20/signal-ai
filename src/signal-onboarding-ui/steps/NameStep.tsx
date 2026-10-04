// signal-onboarding-ui · steps/NameStep.tsx  (Step 2 of 9)
// Conversational name capture with a live echo. Controlled by props.
import { PrimaryButton } from "../components/PrimaryButton";
import { cn } from "@/lib/utils";

interface Props {
  value: string;
  onChange: (name: string) => void;
  onContinue: () => void;
}

export function NameStep({ value, onChange, onContinue }: Props) {
  const valid = value.trim().length > 0;
  const firstName = value.trim().split(" ")[0];

  return (
    <div className="flex h-full flex-col px-7 pb-7 pt-[104px]">
      <div className="animate-fade-up">

        <h2 className="ed-serif mb-2.5 text-[30px] font-semibold leading-tight tracking-[-0.02em] text-ed-text">
          First — what should<br />we call you?
        </h2>
        <p className="mb-10 text-sm leading-relaxed text-ed-text-2">
          So your briefings feel like they're written for you, not everyone.
        </p>

        <div className={cn("flex items-baseline border-b-2 pb-3 transition-colors", valid ? "border-ed-accent" : "border-ed-border-strong")}>
          <input
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-label="Your name"
            placeholder="Type your name"
            autoComplete="given-name"
            className="ed-onboarding-input w-full bg-transparent text-[30px] font-bold tracking-[-0.01em] text-ed-text caret-ed-accent outline-none focus-visible:outline-none placeholder:text-ed-text-2"
          />
        </div>

        {valid && (
          <p className="mt-[18px] animate-fade-up text-sm font-semibold text-ed-accent-ink">Nice to meet you, {firstName}.</p>
        )}
      </div>

      <div className="mt-auto pt-5">
        <PrimaryButton disabled={!valid} onClick={onContinue}>Continue</PrimaryButton>
      </div>
    </div>
  );
}
