// signal-ui-v2 · components/InterestChip.tsx
// ---------------------------------------------------------------------------
// Toggleable interest chip with ripple on selection and spring scale feedback.
// ---------------------------------------------------------------------------
import { useCallback, useRef } from "react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { motionTokens, haptic } from "../animations/motion";

interface Props {
  label: string;
  selected?: boolean;
  onToggle?: () => void;
  /** Read-only chips (e.g. "observations Signal formed") aren't tappable. */
  readOnly?: boolean;
  icon?: React.ReactNode;
  className?: string;
}

/**
 * Toggleable interest / topic chip. When `readOnly`, renders as a static
 * observation pill (used on the AI-identity screen for things Signal learned).
 */
export function InterestChip({ label, selected, onToggle, readOnly, icon, className }: Props) {
  const reduce = useReducedMotion();
  const rippleRef = useRef<HTMLSpanElement>(null);

  const handleClick = useCallback(() => {
    haptic(8);
    // Spawn a ripple
    if (!reduce && rippleRef.current) {
      const el = rippleRef.current;
      const ripple = document.createElement("span");
      ripple.style.cssText = `
        position: absolute; border-radius: 50%; pointer-events: none;
        width: 40px; height: 40px; left: 50%; top: 50%;
        background: ${selected ? "hsl(0 0% 100% / 0.25)" : "hsl(152 72% 48% / 0.25)"};
        animation: chip-ripple 400ms cubic-bezier(0.2, 0, 0, 1) forwards;
      `;
      el.appendChild(ripple);
      ripple.addEventListener("animationend", () => ripple.remove());
    }
    onToggle?.();
  }, [onToggle, selected, reduce]);

  if (readOnly) {
    return (
      <fm.span
        initial={reduce ? undefined : { opacity: 0, scale: 0.9 }}
        animate={reduce ? undefined : { opacity: 1, scale: 1 }}
        transition={reduce ? undefined : { duration: 0.3, ease: motionTokens.ease.premium }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-green/[0.14] bg-green/[0.055] px-3 py-2 text-[12.5px] font-semibold text-[#cfe8d8]",
          className
        )}
      >
        {icon}
        {label}
      </fm.span>
    );
  }

  return (
    <fm.button
      type="button"
      role="checkbox"
      aria-checked={!!selected}
      onClick={handleClick}
      whileTap={
        reduce
          ? undefined
          : {
              scale: [1, 1.06, 0.97, 1],
              transition: { duration: 0.35, ease: motionTokens.ease.premium },
            }
      }
      layout
      transition={motionTokens.spring.chip}
      className={cn(
        "relative inline-flex items-center gap-1.5 overflow-hidden rounded-full border px-3.5 py-2 text-[12.5px] font-semibold",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        "transition-colors duration-200",
        selected
          ? "border-green bg-green text-black"
          : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {/* Ripple container */}
      <span ref={rippleRef} className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]" aria-hidden />
      <span className="relative z-10 inline-flex items-center gap-[inherit]">
        {icon}
        {label}
      </span>
    </fm.button>
  );
}
