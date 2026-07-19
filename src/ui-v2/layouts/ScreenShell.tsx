// signal-ui-v2 · layouts/ScreenShell.tsx
// ---------------------------------------------------------------------------
// Page scaffold with ambient field (aurora + radar + particles), noise texture
// overlay, and depth lighting. The foundation for every screen's premium feel.
// ---------------------------------------------------------------------------
import { cn } from "@/lib/utils";
import { AmbientField } from "../components/MotionSystem";

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
  /** Whether to show the ambient aurora field (default: true). */
  ambient?: boolean;
  /** Whether to show the quiet version of ambient (less intense). */
  quietAmbient?: boolean;
  /** Pass-through data attributes. */
  [key: `data-${string}`]: string | undefined;
}

/**
 * Page scaffold shared by every screen: an ambient-glow canvas, noise texture,
 * depth lighting, an optional sticky header, a scrollable body, and a fixed
 * footer slot for the BottomNav.
 *
 * RESPONSIVE: fills its parent. In production render it inside your app's
 * route outlet / PhoneFrame; it does not assume a fixed device size.
 */
export function ScreenShell({
  header, children, footer, bodyClassName, className,
  ambient = true, quietAmbient = false,
  ...rest
}: Props) {
  // Extract data-* attributes
  const dataAttrs: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (key.startsWith("data-")) {
      dataAttrs[key] = value;
    }
  }

  return (
    <div className={cn("relative flex h-full min-h-0 w-full flex-col overflow-hidden bg-[#070707] text-foreground", className)}>
      {/* Ambient atmosphere layers */}
      {ambient && <AmbientField quiet={quietAmbient} />}

      {/* Noise texture overlay for depth */}
      <div className="signal-noise-overlay" aria-hidden />

      {/* Depth lighting */}
      <div className="signal-depth-light" aria-hidden />

      {header && <div className="relative z-[60] shrink-0">{header}</div>}

      <div
        className={cn("no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto", bodyClassName)}
        {...dataAttrs}
      >
        {children}
      </div>

      {footer}
    </div>
  );
}
