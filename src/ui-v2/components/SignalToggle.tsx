// signal-ui-v2 · components/SignalToggle.tsx
// ---------------------------------------------------------------------------
// Accessible toggle switch with spring physics on the thumb and a glowing
// green shadow that springs in when checked.
// ---------------------------------------------------------------------------
import { motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { motionTokens } from "../animations/motion";

interface Props {
  checked: boolean;
  onChange?: (next: boolean) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}

/** Accessible switch. Renders a real checkbox role for keyboard + SR support. */
export function SignalToggle({ checked, onChange, label, disabled, className }: Props) {
  const reduce = useReducedMotion();

  return (
    <fm.button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      whileTap={reduce ? undefined : { scale: 0.92 }}
      transition={motionTokens.spring.toggle}
      className={cn(
        "relative h-[27px] w-[46px] shrink-0 rounded-full transition-colors duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "disabled:opacity-40",
        checked ? "bg-green" : "bg-white/[0.12]",
        className
      )}
      style={{
        boxShadow: checked ? "0 0 14px hsl(152 72% 48% / 0.35)" : "none",
      }}
    >
      <fm.span
        animate={{
          x: checked ? 19 : 0,
        }}
        transition={reduce ? { duration: 0 } : motionTokens.spring.toggle}
        className={cn(
          "absolute left-[3px] top-[3px] h-[21px] w-[21px] rounded-full shadow-sm",
          checked ? "bg-black" : "bg-[#e8e8e8]"
        )}
      />
    </fm.button>
  );
}
