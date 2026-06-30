import { FeedCard } from "@/components/FeedCard";
import type { FeedItem } from "@/data/feed";
import { recommendedBecause } from "@/lib/recommend";

interface Props {
  items: FeedItem[];          // exactly the top 3 (already deduped vs hero)
  bookmarks: string[];
  onToggleBookmark: (id: string) => void;
}

// Section "Don't Miss Today" — the 3 stories that answer "what happened?".
// Ranked, smaller than the hero. Each leads with one "recommended because" line
// so the relevance is obvious before the card itself.
export function TopSignals({ items, bookmarks, onToggleBookmark }: Props) {
  if (items.length === 0) return null;
  return (
    <section className="mb-8">
      <p className="section-label mb-4">Don't Miss Today</p>
      <div className="space-y-4">
        {items.slice(0, 3).map((item, i) => (
          <div key={item.id} id={`story-${item.id}`} className="relative">
            <span
              className="absolute -left-1 -top-1 z-10 w-7 h-7 rounded-full bg-green text-black text-[13px] font-extrabold font-mono-tight flex items-center justify-center shadow-[0_0_18px_hsl(152_72%_48%/0.35)]"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="pt-2">
              <p className="text-[11px] text-green/80 font-semibold mb-1.5 pl-1 leading-snug">
                {recommendedBecause(item)}
              </p>
              <FeedCard item={item} index={i} bookmarked={bookmarks.includes(item.id)} onToggleBookmark={onToggleBookmark} />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
