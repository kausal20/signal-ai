// signal-ui-v2 · layouts/ScreenShell.tsx
import { cn } from "@/lib/utils";

interface Props {
  /** Sticky header content (title row, command bar, etc.). */
  header?: React.ReactNode;
  /** The scrolling body. */
  children: React.ReactNode;
  /** Bottom nav element (or any fixed footer). */
  footer?: React.ReactNode;
  /** Extra classes on the scroll region (e.g. padding overrides). */
  bodyClassName?: string;
  className?: string;
}

/**
 * Page scaffold shared by every screen: an ambient-glow canvas, an optional
 * sticky header, a scrollable body, and a fixed footer slot for the BottomNav.
 *
 * RESPONSIVE: fills its parent. In production render it inside your app's
 * route outlet / PhoneFrame; it does not assume a fixed device size.
 */
export function ScreenShell({ header, children, footer, bodyClassName, className }: Props) {
  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#070707] text-foreground", className)}>
      {/* Ambient atmosphere */}
      <div className="pointer-events-none absolute inset-0 z-0 overflow-hidden">
        <div className="absolute -left-16 -top-24 h-72 w-72 rounded-full bg-green/[0.09] blur-[90px]" />
        <div className="absolute -right-20 bottom-24 h-64 w-64 rounded-full bg-green/[0.05] blur-[90px]" />
      </div>

      {header && <div className="relative z-30 shrink-0">{header}</div>}

      <div className={cn("no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto", bodyClassName)}>
        {children}
      </div>

      {footer}
    </div>
  );
}
