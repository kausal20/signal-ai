// signal-ui-v2 · components/InterestChip.tsx
import { cn } from "@/lib/utils";

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
  if (readOnly) {
    return (
      <span
        className={cn(
          "inline-flex items-center gap-1.5 rounded-xl border border-green/[0.14] bg-green/[0.055] px-3 py-2 text-[12.5px] font-semibold text-[#cfe8d8]",
          className
        )}
      >
        {icon}
        {label}
      </span>
    );
  }
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={!!selected}
      onClick={onToggle}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-2 text-[12.5px] font-semibold transition-all active:scale-[0.93]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        selected
          ? "border-green bg-green text-black"
          : "border-white/10 bg-white/[0.04] text-muted-foreground hover:text-foreground",
        className
      )}
    >
      {icon}
      {label}
    </button>
  );
}
