// signal-ui-v2 · components/SettingsCard.tsx
// ---------------------------------------------------------------------------
// Settings container with fade entrance and accordion-ready rows.
// ---------------------------------------------------------------------------
import { ChevronRight } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { motionTokens, accordionVariants } from "../animations/motion";

interface RowProps {
  label: string;
  sub?: string;
  icon?: React.ReactNode;
  /** Right-side control (a <SignalToggle/>, value text, badge, etc.). */
  trailing?: React.ReactNode;
  /** When set, the whole row is a button with a chevron. */
  onClick?: () => void;
  danger?: boolean;
}

/** A grouped settings container with fade entrance. Compose <SettingsRow/> children inside. */
export function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <fm.div
      initial={reduce ? undefined : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={reduce ? undefined : { duration: 0.36, ease: motionTokens.ease.premium }}
      className={cn("overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.028]", className)}
    >
      {children}
    </fm.div>
  );
}

/** A single row inside a SettingsCard with hover animation. Divider handled by the parent's flow. */
export function SettingsRow({ label, sub, icon, trailing, onClick, danger }: RowProps) {
  const reduce = useReducedMotion();

  const inner = (
    <>
      {icon && (
        <span className="flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-[10px] border border-white/[0.08] bg-white/[0.05] text-muted-foreground">
          {icon}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("text-sm font-semibold", danger ? "text-[hsl(0_75%_66%)]" : "text-foreground")}>{label}</div>
        {sub && <div className="text-[11.5px] leading-snug text-muted-foreground">{sub}</div>}
      </div>
      {trailing}
      {onClick && !trailing && <ChevronRight className="h-[17px] w-[17px] text-white/35" />}
    </>
  );

  const cls = "flex w-full items-center gap-[13px] border-b border-white/[0.05] px-4 py-[15px] text-left last:border-b-0";

  if (onClick) {
    return (
      <fm.button
        type="button"
        onClick={onClick}
        whileHover={reduce ? undefined : { x: 3, backgroundColor: "hsl(0 0% 100% / 0.03)" }}
        whileTap={reduce ? undefined : { scale: 0.99 }}
        transition={{ type: "spring", stiffness: 400, damping: 30 }}
        className={cn(cls, "transition-colors active:bg-white/[0.05]")}
      >
        {inner}
      </fm.button>
    );
  }
  return <div className={cls}>{inner}</div>;
}

/**
 * Accordion body wrapper for expandable settings sections.
 * Animates height from 0 → auto with spring physics.
 *
 * Usage:
 *   <SettingsAccordionBody expanded={isOpen}>
 *     <SettingsRow ... />
 *   </SettingsAccordionBody>
 */
export function SettingsAccordionBody({
  expanded,
  children,
  className,
}: {
  expanded: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  const reduce = useReducedMotion();

  return (
    <fm.div
      initial="collapsed"
      animate={expanded ? "expanded" : "collapsed"}
      variants={reduce ? undefined : accordionVariants}
      className={cn("overflow-hidden", className)}
    >
      {children}
    </fm.div>
  );
}
