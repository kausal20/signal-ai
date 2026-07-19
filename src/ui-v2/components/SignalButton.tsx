// signal-ui-v2 · components/SignalButton.tsx
// ---------------------------------------------------------------------------
// Premium button with ripple effect, glow ramp on hover, and spring press.
// GPU-friendly: only transforms, opacity, and box-shadow animate.
// ---------------------------------------------------------------------------
import { forwardRef, useCallback, useRef } from "react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { motionTokens } from "../animations/motion";

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

/** Glow intensities per variant on hover */
const GLOW_HOVER: Record<Variant, string> = {
  primary: "0 4px 20px hsl(152 72% 48% / 0.35), 0 12px 40px hsl(152 72% 48% / 0.15)",
  secondary: "0 4px 16px hsl(0 0% 100% / 0.06), 0 8px 30px hsl(0 0% 0% / 0.3)",
  ghost: "none",
  danger: "0 4px 20px hsl(0 55% 50% / 0.2), 0 8px 30px hsl(0 0% 0% / 0.3)",
};

/** The one Signal button. Accessible, keyboard-focusable, reduced-motion safe. */
export const SignalButton = forwardRef<HTMLButtonElement, Props>(function SignalButton(
  { variant = "primary", size = "md", iconLeft, iconRight, fullWidth, className, children, onClick, ...rest },
  ref
) {
  const reduce = useReducedMotion();
  const rippleContainerRef = useRef<HTMLSpanElement>(null);

  /** Spawn a ripple element at the click coordinates. */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      // Trigger the ripple
      if (!reduce && rippleContainerRef.current) {
        const rect = e.currentTarget.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const size = Math.max(rect.width, rect.height) * 0.6;

        const ripple = document.createElement("span");
        ripple.className = "motion-ripple";
        ripple.style.width = `${size}px`;
        ripple.style.height = `${size}px`;
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;

        rippleContainerRef.current.appendChild(ripple);
        ripple.addEventListener("animationend", () => ripple.remove());
      }

      onClick?.(e);
    },
    [onClick, reduce]
  );

  return (
    <fm.button
      ref={ref}
      whileHover={
        reduce
          ? undefined
          : {
              y: -1,
              boxShadow: GLOW_HOVER[variant],
              transition: { duration: motionTokens.duration.micro, ease: motionTokens.ease.soft },
            }
      }
      whileTap={
        reduce
          ? undefined
          : {
              scale: 0.97,
              transition: motionTokens.spring.press,
            }
      }
      className={cn(
        "relative inline-flex items-center justify-center overflow-hidden font-bold transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:pointer-events-none disabled:opacity-40",
        VARIANTS[variant],
        SIZES[size],
        fullWidth && "w-full",
        className
      )}
      onClick={handleClick}
      {...rest}
    >
      {/* Ripple container */}
      <span ref={rippleContainerRef} className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]" aria-hidden />
      {/* Content */}
      <span className="relative z-10 inline-flex items-center justify-center gap-[inherit]">
        {iconLeft}
        {children}
        {iconRight}
      </span>
    </fm.button>
  );
});
