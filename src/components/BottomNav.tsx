import { useEffect } from "react";
import { Bookmark, Compass, Home, Search, SlidersHorizontal } from "lucide-react";
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
  { key: "search", label: "Search", icon: <Search strokeWidth={2} />, to: "/?section=search" },
  { key: "advisor", label: "Advisor", icon: <Compass strokeWidth={2} />, to: "/advisor" },
  { key: "saved", label: "Saved", icon: <Bookmark strokeWidth={2} />, to: "/?section=saved" },
  { key: "settings", label: "Settings", icon: <SlidersHorizontal strokeWidth={2} />, to: "/settings" },
];

export function BottomNav({ activeSection, onHomeClick, onSearchClick, onSavedClick }: Props) {
  const location = useLocation();
  const current: TabKey = activeSection ?? (
    location.pathname === "/settings" ? "settings" : location.pathname === "/advisor" ? "advisor" : "home"
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
