// signal-onboarding-ui · components/PrimaryButton.tsx
import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Show a trailing arrow (enabled/primary CTAs). */
  withArrow?: boolean;
}

/** The onboarding CTA — full-width, gated by `disabled`. */
export function PrimaryButton({ withArrow = true, disabled, className, children, ...rest }: Props) {
  return (
    <button
      className={cn(
        "flex h-[54px] w-full items-center justify-center gap-2 rounded-2xl text-base font-bold transition-all active:scale-[0.98]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ed-accent focus-visible:ring-offset-2 focus-visible:ring-offset-ed-bg",
        disabled
          ? "cursor-not-allowed bg-ed-surface text-ed-text-3"
          : "bg-ed-accent-ink text-ed-on-accent ",
        className
      )}
      disabled={disabled}
      {...rest}
    >
      {children}
      {withArrow && !disabled && <ArrowRight className="h-[17px] w-[17px]" />}
    </button>
  );
}
