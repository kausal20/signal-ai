// signal-ui-v2 · pages/SavedPage.tsx
// ---------------------------------------------------------------------------
// Saved: bookmarked signals grouped into collections, with tabs + empty state.
// Fully prop-driven. Replaces production: components/SavedCollections.tsx.
// ---------------------------------------------------------------------------
import { Bookmark } from "lucide-react";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { SectionHeader } from "../components/SectionHeader";
import { FeedCard } from "../components/FeedCard";
import { SignalEmptyState } from "../components/SignalEmptyState";
import { SignalButton } from "../components/SignalButton";
import { motion } from "../animations/motion";
import type { Signal, SectionKey } from "../shared/types";

interface SavedTab {
  id: string;
  label: string;
  count?: number;
}

interface Props {
  items: Signal[];
  tabs?: SavedTab[];
  activeTab?: string;
  bookmarkCount?: number;

  onNavigate?: (s: SectionKey) => void;
  onSelectTab?: (id: string) => void;
  onOpenSignal?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  onBrowse?: () => void;
}

export function SavedPage({
  items, tabs = [], activeTab, bookmarkCount,
  onNavigate, onSelectTab, onOpenSignal, onToggleSave, onBrowse,
}: Props) {
  const header = (
    <div className="px-[22px] pb-3 pt-[52px]">
      <h1 className="text-[25px] font-extrabold tracking-[-0.025em] text-foreground">Saved</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {items.length > 0 ? `${items.length} signal${items.length === 1 ? "" : "s"} you're keeping` : "Your bookmarks live here"}
      </p>
    </div>
  );

  return (
    <ScreenShell header={header} footer={<BottomNav active="saved" bookmarkCount={bookmarkCount ?? items.length} onNavigate={onNavigate} />} bodyClassName="px-[22px] pb-24 pt-1">
      {tabs.length > 0 && (
        <div className="no-scrollbar -mx-[22px] mb-4 flex gap-2 overflow-x-auto px-[22px]">
          {tabs.map((t) => {
            const on = t.id === activeTab;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onSelectTab?.(t.id)}
                className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-all active:scale-95 ${
                  on ? "border-green bg-green text-black" : "border-white/[0.08] bg-white/[0.035] text-muted-foreground"
                }`}
              >
                {t.label}
                {typeof t.count === "number" && (
                  <span className={`font-mono-tight text-[10px] ${on ? "text-black/70" : "text-white/40"}`}>{t.count}</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <SignalEmptyState
          className={motion.fadeUp}
          icon={<Bookmark className="h-6 w-6" />}
          title="Nothing saved yet"
          description="Bookmark signals from your feed and they'll gather here, grouped into collections."
          action={<SignalButton variant="secondary" onClick={onBrowse}>Browse the feed</SignalButton>}
        />
      ) : (
        <>
          <SectionHeader title="All saved" />
          <div className="flex flex-col gap-2.5">
            {items.map((s) => (
              <FeedCard key={s.id} signal={{ ...s, saved: true }} onOpen={onOpenSignal} onToggleSave={onToggleSave} className={motion.fadeUp} />
            ))}
          </div>
        </>
      )}
    </ScreenShell>
  );
}
