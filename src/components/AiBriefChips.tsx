import { Zap } from "lucide-react";
import type { FeedItem } from "@/data/feed";

interface Props {
  items: FeedItem[];          // ranked stories to surface as quick chips
  onSelect: (id: string) => void;
}

// Section 3 — Today's AI Brief. 3–5 scannable chips, each opens its story.
function shortLabel(it: FeedItem): string {
  const t = it.title.replace(/[:–—].*$/, "").trim();
  const words = t.split(/\s+/);
  return words.length > 7 ? words.slice(0, 7).join(" ") + "…" : t;
}

export function AiBriefChips({ items, onSelect }: Props) {
  const chips = items.slice(0, 5);
  if (chips.length === 0) return null;

  return (
    <section className="mb-8 animate-fade-up">
      <p className="section-label mb-3">Here's what changed while you were away</p>
      <div className="flex flex-wrap gap-2">
        {chips.map((it) => (
          <button
            key={it.id}
            onClick={() => onSelect(it.id)}
            className="pressable inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] pl-2.5 pr-3 py-1.5 text-[12px] font-semibold text-foreground hover:border-green/25 hover:bg-green/[0.06] transition-colors max-w-full"
          >
            <span className="w-4 h-4 rounded-full bg-green/15 text-green flex items-center justify-center shrink-0">
              <Zap className="w-2.5 h-2.5" />
            </span>
            <span className="truncate">{shortLabel(it)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
