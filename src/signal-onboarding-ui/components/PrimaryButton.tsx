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
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        disabled
          ? "cursor-not-allowed bg-white/[0.05] text-white/20"
          : "bg-green text-black shadow-[0_8px_30px_hsl(152_72%_48%/0.3)]",
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
