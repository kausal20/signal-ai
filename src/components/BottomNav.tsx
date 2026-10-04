import { useEffect } from "react";
import { Bookmark, Home, Search, Sparkles, UserRound } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import { LiquidGlassBar, type Tab } from "@/components/LiquidGlassBar";

interface Props {
  activeSection?: "home" | "search" | "advisor" | "saved" | "settings";
  onHomeClick?: () => void;
  onSearchClick?: () => void;
  onSavedClick?: () => void;
}

type TabKey = NonNullable<Props["activeSection"]>;

const TABS: Tab[] = [
  { key: "home", label: "Home", icon: <Home strokeWidth={2} />, to: "/" },
  { key: "search", label: "Search", icon: <Search strokeWidth={2} />, to: "/search" },
  { key: "advisor", label: "Signal", icon: <Sparkles strokeWidth={2} />, to: "/signal" },
  { key: "saved", label: "Saved", icon: <Bookmark strokeWidth={2} />, to: "/saved" },
  { key: "settings", label: "Profile", icon: <UserRound strokeWidth={2} />, to: "/profile" },
];

export function BottomNav({ activeSection, onHomeClick, onSearchClick, onSavedClick }: Props) {
  const location = useLocation();
  const current: TabKey = activeSection ?? (
    location.pathname === "/settings" || location.pathname === "/profile" ? "settings" : location.pathname === "/advisor" || location.pathname === "/signal" ? "advisor" : "home"
  );

  const clickHandlers: Partial<Record<TabKey, () => void>> = {
    home: onHomeClick,
    search: onSearchClick,
    saved: onSavedClick,
  };

  return (
    <LiquidGlassBar
      tabs={TABS}
      activeKey={current}
      onSelect={(key) => {
        const handler = clickHandlers[key as TabKey];
        if (handler) handler();
      }}
    />
  );
}
