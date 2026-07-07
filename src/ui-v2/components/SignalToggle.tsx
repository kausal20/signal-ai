// signal-ui-v2 · components/SignalToggle.tsx
import { cn } from "@/lib/utils";

interface Props {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Accessible switch. Renders a real checkbox role for keyboard + SR support. */
export function SignalToggle({ checked, onChange, label, disabled, className }: Props) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={cn(
        "relative h-[27px] w-[46px] shrink-0 rounded-full transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "active:scale-95 disabled:opacity-40",
        checked ? "bg-green shadow-[0_0_14px_hsl(152_72%_48%/0.35)]" : "bg-white/[0.12]",
        className
      )}
    >
      <span
        className={cn(
          "absolute left-[3px] top-[3px] h-[21px] w-[21px] rounded-full transition-transform",
          checked ? "translate-x-[19px] bg-black" : "translate-x-0 bg-[#e8e8e8]"
        )}
      />
    </button>
  );
}
