// signal-onboarding-ui · components/OptionCard.tsx
// Grid tile (role step) + row variant (goal step) + radio row (time/experience).
import { Check, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICONS } from "../data/onboarding-options";
import type { Option } from "../shared/types";

interface CardProps {
  option: Option;
  selected: boolean;
  onSelect: () => void;
}

/** Icon grid tile — used on the Role step. */
export function OptionCard({ option, selected, onSelect }: CardProps) {
  const Icon = option.icon ? ICONS[option.icon] : undefined;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex min-h-[100px] flex-col justify-between rounded-[18px] border p-[15px] text-left transition-all active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-green/[0.45] bg-green/[0.08] shadow-[0_0_24px_hsl(152_72%_48%/0.12)]"
          : "border-white/[0.06] bg-white/[0.035]"
      )}
    >
      {Icon && (
        <span
          className={cn(
            "mb-3 flex h-[38px] w-[38px] items-center justify-center rounded-xl border",
            selected ? "border-green/[0.35] bg-green/[0.16] text-green" : "border-white/[0.08] bg-white/[0.035] text-green/70"
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
      )}
      <span className={cn("text-[12.5px] font-semibold leading-tight", selected ? "text-foreground" : "text-foreground/70")}>
        {option.label}
      </span>
    </button>
  );
}

/** Icon row with chevron — used on the Goal step. */
export function OptionRow({ option, selected, onSelect }: CardProps) {
  const Icon = option.icon ? ICONS[option.icon] : undefined;
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center gap-[13px] rounded-2xl border p-[15px] text-left transition-all active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-green/[0.45] bg-green/[0.08] shadow-[0_0_24px_hsl(152_72%_48%/0.12)]"
          : "border-white/[0.06] bg-white/[0.035]"
      )}
    >
      {Icon && (
        <span
          className={cn(
            "flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl border",
            selected ? "border-green/[0.35] bg-green/[0.16] text-green" : "border-white/[0.08] bg-white/[0.035] text-green/70"
          )}
        >
          <Icon className="h-[19px] w-[19px]" />
        </span>
      )}
      <span className={cn("flex-1 text-[15px] font-semibold", selected ? "text-foreground" : "text-foreground/80")}>
        {option.label}
      </span>
      <ChevronRight className={cn("h-4 w-4 shrink-0", selected ? "text-green" : "text-white/30")} />
    </button>
  );
}

/** Radio-style row with a check dot — used on Time + Experience steps. */
export function RadioRow({ option, selected, onSelect }: CardProps) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={cn(
        "flex items-center justify-between gap-3 rounded-2xl border px-[18px] py-[17px] text-left transition-all active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-green/50 bg-green/[0.08] shadow-[0_0_24px_hsl(152_72%_48%/0.12)]"
          : "border-white/[0.06] bg-white/[0.035]"
      )}
    >
      <span className={cn("text-[15px] font-semibold", selected ? "text-foreground" : "text-foreground/80")}>{option.label}</span>
      <span
        className={cn(
          "flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-full border-2",
          selected ? "border-green bg-green" : "border-white/[0.16]"
        )}
      >
        {selected && <Check className="h-3 w-3 text-black" strokeWidth={3.4} />}
      </span>
    </button>
  );
}
