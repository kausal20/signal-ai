// signal-ui-v2 · components/SignalEmptyState.tsx
import { cn } from "@/lib/utils";

interface Props {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  /** Optional call to action (pass a <SignalButton />). */
  action?: React.ReactNode;
  className?: string;
}

/** Friendly empty / zero-data state. */
export function SignalEmptyState({ icon, title, description, action, className }: Props) {
  return (
    <div className={cn("flex flex-col items-center px-6 py-12 text-center", className)}>
      {icon && (
        <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full border border-green/[0.22] bg-green/10 text-green">
          {icon}
        </div>
      )}
      <p className="text-[15px] font-bold text-foreground">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-[280px] text-[12.5px] leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
