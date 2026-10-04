import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { NAV_ITEMS } from "./nav";
import type { EdNavKey } from "../types";
import { settle } from "../motion";

/** Mobile/tablet tab bar. Solid surface + hairline (no glass, no floating pill).
 *  Active = dark icon + a short green bar on the top edge; inactive = muted. */
export function BottomNavigation({ active }: { active: EdNavKey }) {
  const reduce = useReducedMotion();
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 left-1/2 z-40 w-full max-w-[430px] -translate-x-1/2 border-t border-ed-border bg-ed-bg pb-[env(safe-area-inset-bottom)] lg:hidden"
    >
      <ul className="mx-auto grid max-w-[640px] grid-cols-5">
        {NAV_ITEMS.map((item) => {
          const isActive = item.key === active;
          return (
            <li key={item.key} className="relative">
              {isActive && (
                <motion.span
                  layoutId="ed-nav-indicator"
                  aria-hidden="true"
                  transition={reduce ? { duration: 0 } : { type: "tween", duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                  className="absolute left-[calc(50%-18px)] top-0 h-[2px] w-9 rounded-full bg-ed-accent"
                />
              )}
              <Link
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "group flex h-[58px] flex-col items-center justify-center gap-[3px] outline-offset-[-4px] transition-colors",
                  isActive ? "text-ed-text" : "text-ed-text-2",
                )}
              >
                <motion.span initial={false} animate={{ y: isActive && !reduce ? -2 : 0 }} transition={settle} className="flex">{item.icon(isActive)}</motion.span>
                <span className={cn("text-[11px] leading-none", isActive ? "font-semibold" : "font-medium")}>{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
