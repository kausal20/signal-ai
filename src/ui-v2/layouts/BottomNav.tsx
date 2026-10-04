import { Bookmark, Home, Search, Sparkles, UserRound } from "lucide-react";
import { LiquidGlassBar, type Tab } from "@/components/LiquidGlassBar";
import type { SectionKey } from "../shared/types";

interface Props {
  active: SectionKey;
  bookmarkCount?: number;
  onNavigate?: (section: SectionKey) => void;
}

const TABS: Tab[] = [
  { key: "home", label: "Home", icon: <Home strokeWidth={2} /> },
  { key: "search", label: "Search", icon: <Search strokeWidth={2} /> },
  { key: "advisor", label: "Signal", icon: <Sparkles strokeWidth={2} /> },
  { key: "saved", label: "Saved", icon: <Bookmark strokeWidth={2} /> },
  { key: "settings", label: "Profile", icon: <UserRound strokeWidth={2} /> },
];

export function BottomNav({ active, bookmarkCount, onNavigate }: Props) {
  return (
    <LiquidGlassBar
      tabs={TABS}
      activeKey={active}
      onSelect={(key) => onNavigate?.(key as SectionKey)}
    />
  );
}
