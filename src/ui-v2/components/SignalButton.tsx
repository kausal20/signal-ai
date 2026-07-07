// signal-ui-v2 · components/SignalButton.tsx
import { forwardRef } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

interface Props extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Optional leading icon (lucide element). */
  iconLeft?: React.ReactNode;
  /** Optional trailing icon (lucide element). */
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-green text-black shadow-[0_8px_26px_hsl(152_72%_48%/0.30)] hover:brightness-105",
  secondary:
    "bg-white/[0.06] text-foreground border border-white/10 hover:bg-white/[0.09]",
  ghost: "bg-transparent text-muted-foreground hover:text-foreground",
  danger:
    "bg-[hsl(0_55%_50%/0.09)] text-[hsl(0_75%_66%)] border border-[hsl(0_55%_50%/0.25)] hover:bg-[hsl(0_55%_50%/0.14)]",
};

const SIZES: Record<Size, string> = {
  sm: "h-9 px-4 text-[13px] rounded-xl gap-1.5",
  md: "h-11 px-5 text-sm rounded-2xl gap-2",
  lg: "h-[52px] px-6 text-base rounded-2xl gap-2",
};

/** The one Signal button. Accessible, keyboard-focusable, reduced-motion safe. */
export const SignalButton = forwardRef<HTMLButtonElement, Props>(function SignalButton(
  { variant = "primary", size = "md", iconLeft, iconRight, fullWidth, className, children, ...rest },
  ref
) {
  return (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center font-bold transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      {...rest}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
});
