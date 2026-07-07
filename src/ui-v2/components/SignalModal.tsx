// signal-ui-v2 · components/SignalModal.tsx
import { useEffect } from "react";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Danger dialogs get a red hairline instead of the default. */
  tone?: "default" | "danger";
  /** Bottom sheet (mobile default) vs centered dialog. */
  variant?: "sheet" | "center";
  labelledBy?: string;
  className?: string;
}

/**
 * Accessible modal / bottom-sheet. Closes on backdrop click and Escape;
 * traps nothing heavier than that so it stays dependency-free. Compose the
 * title/body/actions as children.
 */
export function SignalModal({
  open,
  onClose,
  children,
  tone = "default",
  variant = "sheet",
  labelledBy,
  className,
}: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={labelledBy}
      onClick={onClose}
      className={cn(
        "fixed inset-0 z-[80] flex bg-black/60 animate-fade-up",
        variant === "sheet" ? "items-end justify-center" : "items-center justify-center p-5"
      )}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "animate-scale-in bg-[#101410] shadow-[0_30px_70px_hsl(0_0%_0%/0.6)]",
          variant === "sheet"
            ? "m-3.5 w-full rounded-3xl p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]"
            : "w-full max-w-sm rounded-3xl p-6",
          tone === "danger" ? "border border-[hsl(0_55%_50%/0.25)]" : "border border-white/[0.08]",
          className
        )}
      >
        {children}
      </div>
    </div>
  );
}
