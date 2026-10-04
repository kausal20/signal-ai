import type { ReactNode } from "react";
import { Bookmark, House, Search, UserRound } from "lucide-react";
import { SignalGlyph } from "./SignalMark";
import type { EdNavKey } from "../types";

export interface NavItem {
  key: EdNavKey;
  label: string;
  to: string;
  icon: (active: boolean) => ReactNode;
}

const sw = (active: boolean) => (active ? 2.3 : 1.8);

/** The five destinations. Advisor is gone — Signal is the single AI experience. */
export const NAV_ITEMS: NavItem[] = [
  { key: "home", label: "Home", to: "/", icon: (a) => <House className="h-[22px] w-[22px]" strokeWidth={sw(a)} aria-hidden="true" /> },
  { key: "search", label: "Search", to: "/search", icon: (a) => <Search className="h-[22px] w-[22px]" strokeWidth={sw(a)} aria-hidden="true" /> },
  { key: "signal", label: "Signal", to: "/signal", icon: (a) => <SignalGlyph className="h-[22px] w-[22px]" strokeWidth={sw(a)} /> },
  { key: "saved", label: "Saved", to: "/saved", icon: (a) => <Bookmark className="h-[22px] w-[22px]" strokeWidth={sw(a)} aria-hidden="true" /> },
  { key: "profile", label: "Profile", to: "/profile", icon: (a) => <UserRound className="h-[22px] w-[22px]" strokeWidth={sw(a)} aria-hidden="true" /> },
];

export function navKeyForPath(pathname: string): EdNavKey {
  if (pathname.startsWith("/search")) return "search";
  if (pathname.startsWith("/signal")) return "signal";
  if (pathname.startsWith("/saved")) return "saved";
  if (pathname.startsWith("/profile")) return "profile";
  return "home";
}
