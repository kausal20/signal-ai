// signal-ui-v2 · pages/SavedPage.tsx
// ---------------------------------------------------------------------------
// Saved: bookmarked signals with staggered entrance, animated tab indicator,
// floating empty state, and smooth transitions.
// ---------------------------------------------------------------------------
import { Bookmark } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { ScreenShell } from "../layouts/ScreenShell";
import { BottomNav } from "../layouts/BottomNav";
import { SectionHeader } from "../components/SectionHeader";
import { FeedCard } from "../components/FeedCard";
import { SignalEmptyState } from "../components/SignalEmptyState";
import { SignalButton } from "../components/SignalButton";
import { staggerContainer as container, fadeInUp as item, motionTokens } from "../animations/motion";
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

// Feed-card stagger uses the shared motion system (imported as container/item).

export function SavedPage({
  items, tabs = [], activeTab, bookmarkCount,
  onNavigate, onSelectTab, onOpenSignal, onToggleSave, onBrowse,
}: Props) {
  const reduce = useReducedMotion();
  const V = reduce ? undefined : item;
  const anim = reduce
    ? { initial: undefined, animate: undefined }
    : { initial: "hidden" as const, animate: "show" as const };

  const header = (
    <fm.div
      initial={reduce ? undefined : { opacity: 0, y: -8 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={reduce ? undefined : { duration: motionTokens.duration.section, ease: motionTokens.ease.premium }}
      className="px-[22px] pb-3 pt-[52px]"
    >
      <h1 className="text-[25px] font-extrabold tracking-[-0.025em] text-foreground">Saved</h1>
      <p className="mt-1 text-[13px] text-muted-foreground">
        {items.length > 0 ? `${items.length} signal${items.length === 1 ? "" : "s"} you're keeping` : "Your bookmarks live here"}
      </p>
    </fm.div>
  );

  return (
    <ScreenShell header={header} footer={<BottomNav active="saved" bookmarkCount={bookmarkCount ?? items.length} onNavigate={onNavigate} />} bodyClassName="px-[22px] pb-28 pt-1" data-saved-scroll>
      {tabs.length > 0 && (
        <div className="no-scrollbar -mx-[22px] mb-4 flex gap-2 overflow-x-auto px-[22px]">
          {tabs.map((t) => {
            const on = t.id === activeTab;
            return (
              <fm.button
                key={t.id}
                type="button"
                onClick={() => onSelectTab?.(t.id)}
                whileTap={reduce ? undefined : { scale: 0.92 }}
                className={`relative flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-4 py-2 text-[12.5px] font-semibold transition-colors ${
                  on ? "border-green text-black" : "border-white/[0.08] bg-white/[0.035] text-muted-foreground"
                }`}
              >
                {/* Sliding pill indicator */}
                {on && (
                  <fm.span
                    layoutId="saved-tab-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-green shadow-[0_0_18px_hsl(152_72%_48%/0.28)]"
                    transition={reduce ? { duration: 0 } : motionTokens.spring.navIndicator}
                  />
                )}
                {t.label}
                {typeof t.count === "number" && (
                  <span className={`font-mono-tight text-[10px] ${on ? "text-black/70" : "text-white/40"}`}>{t.count}</span>
                )}
              </fm.button>
            );
          })}
        </div>
      )}

      {items.length === 0 ? (
        <fm.div
          initial={reduce ? undefined : { opacity: 0, y: 12 }}
          animate={reduce ? undefined : { opacity: 1, y: 0 }}
          transition={reduce ? undefined : { duration: motionTokens.duration.section, ease: motionTokens.ease.premium }}
        >
          <SignalEmptyState
            icon={
              <fm.span
                animate={reduce ? undefined : { y: [0, -6, 0] }}
                transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <Bookmark className="h-6 w-6" />
              </fm.span>
            }
            title="Nothing saved yet"
            description="Bookmark signals from your feed and they'll gather here, grouped into collections."
            action={<SignalButton variant="secondary" onClick={onBrowse}>Browse the feed</SignalButton>}
          />
        </fm.div>
      ) : (
        <>
          <SectionHeader title="All saved" />
          <fm.div variants={reduce ? undefined : container} {...anim} className="flex flex-col gap-2.5">
            {items.map((s) => (
              <fm.div key={s.id} variants={V}>
                <FeedCard signal={{ ...s, saved: true }} onOpen={onOpenSignal} onToggleSave={onToggleSave} />
              </fm.div>
            ))}
          </fm.div>
        </>
      )}
    </ScreenShell>
  );
}
