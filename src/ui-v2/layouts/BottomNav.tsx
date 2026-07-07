// signal-ui-v2 · layouts/BottomNav.tsx
// ---------------------------------------------------------------------------
// Fixed 5-tab bottom navigation. This is a DROP-IN REPLACEMENT for your
// production `components/BottomNav.tsx` — same section keys, same active
// styling. It is navigation-agnostic: it emits `onNavigate(section)` and does
// NOT import react-router. On merge, wire `onNavigate` to <Link>/navigate().
// ---------------------------------------------------------------------------
import { Home, Search, Compass, Bookmark, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SectionKey } from "../shared/types";

interface Props {
  active: SectionKey;
  bookmarkCount?: number;
  onNavigate?: (section: SectionKey) => void;
}

const TABS: { key: SectionKey; label: string; icon: React.ReactNode }[] = [
  { key: "home", label: "Home", icon: <Home className="h-[21px] w-[21px]" strokeWidth={1.85} /> },
  { key: "search", label: "Search", icon: <Search className="h-[21px] w-[21px]" strokeWidth={1.95} /> },
  { key: "advisor", label: "Advisor", icon: <Compass className="h-[21px] w-[21px]" strokeWidth={1.85} /> },
  { key: "saved", label: "Saved", icon: <Bookmark className="h-[21px] w-[21px]" strokeWidth={1.85} /> },
  { key: "settings", label: "Settings", icon: <SlidersHorizontal className="h-[21px] w-[21px]" strokeWidth={1.85} /> },
];

export function BottomNav({ active, onNavigate }: Props) {
  return (
    <nav
      aria-label="Primary"
      className="absolute inset-x-0 bottom-0 z-50 px-1.5 pb-safe"
    >
      <div className="mx-auto h-[72px] rounded-t-[28px] border border-b-0 border-white/[0.05] bg-[#020403]/95 px-3 pt-2.5 shadow-[0_-18px_42px_hsl(0_0%_0%/0.55)] backdrop-blur-xl">
      <div className="grid h-full grid-cols-5 items-start">
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          return (
            <button
              key={tab.key}
              type="button"
              aria-current={isActive ? "page" : undefined}
              onClick={() => onNavigate?.(tab.key)}
              className={cn(
                "flex min-w-0 flex-col items-center justify-start gap-1 rounded-2xl px-1 py-1 text-[10px] font-medium transition-all active:scale-95",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-[#020403]",
                isActive
                  ? "text-green"
                  : "text-zinc-500 hover:text-foreground"
              )}
            >
              <span className="flex h-6 items-center justify-center">
                {tab.key === "saved" ? (
                  <Bookmark className={cn("h-[21px] w-[21px]", isActive && "fill-current")} strokeWidth={1.85} />
                ) : (
                  tab.icon
                )}
              </span>
              <span className="truncate leading-none">{tab.label}</span>
            </button>
          );
        })}
      </div>
      </div>
    </nav>
  );
}
