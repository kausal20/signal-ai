import { Eye, Clock, ArrowRight } from "lucide-react";
import type { FeedItem } from "@/data/feed";

interface Props {
  items: FeedItem[];          // up to 3 important-but-unseen stories
  onSelect: (id: string) => void;
}

// Section 6 — Missed Today. Only rendered when `items` is non-empty (caller
// hides it otherwise). Important stories the user didn't act on.
export function MissedToday({ items, onSelect }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="mt-10 mb-2 animate-fade-up">
      <div className="green-halo p-4 sm:p-5">
        <p className="text-[13px] font-bold text-foreground flex items-center gap-2 mb-3">
          <Eye className="w-4 h-4 text-green" /> Before you go…
        </p>
        <p className="text-[11px] text-muted-foreground mb-3">Important stories you haven't opened yet</p>
        <div className="space-y-2">
          {items.slice(0, 3).map((it) => (
            <button
              key={it.id}
              onClick={() => onSelect(it.id)}
              className="premium-card is-lift w-full text-left flex items-center gap-3 p-3.5 pressable"
            >
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold text-foreground leading-snug line-clamp-1">{it.title}</p>
                <p className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5">
                  {it.intel?.personalizedTakeaway ?? it.whyItMatters}
                </p>
                <p className="text-[10px] text-green/80 font-semibold mt-1 flex items-center gap-1">
                  <Clock className="w-3 h-3" /> Read in 30 seconds
                </p>
              </div>
              <ArrowRight className="w-4 h-4 text-muted-foreground shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
