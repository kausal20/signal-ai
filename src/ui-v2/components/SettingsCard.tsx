// signal-ui-v2 · components/SettingsCard.tsx
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

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

/** A grouped settings container. Compose <SettingsRow/> children inside. */
export function SettingsCard({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[18px] border border-white/[0.06] bg-white/[0.028]", className)}>
      {children}
    </div>
  );
}

/** A single row inside a SettingsCard. Divider handled by the parent's flow. */
export function SettingsRow({ label, sub, icon, trailing, onClick, danger }: RowProps) {
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
      <button type="button" onClick={onClick} className={cn(cls, "transition-colors hover:bg-white/[0.03] active:bg-white/[0.05]")}>
        {inner}
      </button>
    );
  }
  return <div className={cls}>{inner}</div>;
}
