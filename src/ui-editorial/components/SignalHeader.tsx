import { Link } from "react-router-dom";
import { Bell } from "lucide-react";
import { motion } from "framer-motion";
import { spring } from "../motion";
import { cn } from "@/lib/utils";
import { SignalWordmark } from "./SignalMark";
import { NAV_ITEMS } from "./nav";
import type { EdNavKey } from "../types";

interface Props {
  active: EdNavKey;
  /** For the avatar initial. */
  name?: string;
  /** Mobile shows the bar only on Home; desktop always shows it with the nav. */
  showOnMobile?: boolean;
  scrolled?: boolean;
}

/** Wordmark + (desktop) primary navigation + notification/profile affordances. */
export function SignalHeader({ active, name, showOnMobile = false, scrolled = false }: Props) {
  const initial = (name ?? "").trim().charAt(0).toUpperCase();
  return (
    <header
      className={cn(
        "sticky top-0 z-30 border-b bg-ed-bg transition-colors",
        scrolled ? "border-ed-border" : "border-transparent lg:border-ed-border",
        showOnMobile ? "block" : "hidden lg:block",
      )}
    >
      <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center gap-8 px-5 md:px-8 lg:h-16">
        <Link to="/" aria-label="Signal — Home" className="rounded-md">
          <SignalWordmark />
        </Link>

        <nav aria-label="Primary" className="hidden flex-1 items-center gap-1 lg:flex">
          {NAV_ITEMS.map((item) => {
            const isActive = item.key === active;
            return (
              <Link
                key={item.key}
                to={item.to}
                aria-current={isActive ? "page" : undefined}
                className={cn(
                  "relative px-3 py-2 text-[14.5px] transition-colors",
                  isActive ? "font-semibold text-ed-text" : "font-medium text-ed-text-2 hover:text-ed-text",
                )}
              >
                {item.label}
                {isActive && <motion.span layoutId="ed-desktop-nav" transition={spring} aria-hidden="true" className="absolute inset-x-3 -bottom-[17px] h-[2px] rounded-full bg-ed-accent" />}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1 lg:ml-0">
          <Link
            to="/profile#notifications"
            aria-label="Notification settings"
            className="flex h-11 w-11 items-center justify-center rounded-full text-ed-text-2 transition-colors hover:bg-ed-sunken hover:text-ed-text"
          >
            <Bell className="h-[20px] w-[20px]" strokeWidth={1.8} aria-hidden="true" />
          </Link>
          <Link
            to="/profile"
            aria-label="Profile"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-ed-border bg-ed-surface text-[14px] font-semibold text-ed-text transition-colors hover:border-ed-border-strong"
          >
            <span className="ed-serif">{initial || "S"}</span>
          </Link>
        </div>
      </div>
    </header>
  );
}
