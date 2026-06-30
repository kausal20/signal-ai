import { ArrowRight } from "lucide-react";
import type { FeedItem } from "@/data/feed";
import { shortRecommendation, ctaForOpportunity } from "@/lib/recommend";

interface Props {
  item: FeedItem;
  onAct: (id: string) => void;
}

// Signal's signature: ONE small line directly below the greeting. The 30-second
// version of today's advice — "if you only do one thing, do this".
export function SignalRecommendation({ item, onAct }: Props) {
  const rec = shortRecommendation(item);
  const cta = ctaForOpportunity(item);

  return (
    <section className="mb-7 animate-fade-up">
      <article className="premium-card p-4">
        <div className="flex items-center gap-1.5 mb-2">
          <span className="text-[13px]">🧠</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-green/80">Signal Recommendation</span>
        </div>
        <p className="text-[13px] text-muted-foreground leading-snug">
          If you only spend 30 minutes today —
        </p>
        <p className="text-[16px] font-bold text-foreground leading-snug mt-0.5">
          {rec}.
        </p>
        <p className="text-[12px] text-muted-foreground mt-1">
          That's your highest-ROI move based on your goals.
        </p>
        <button
          onClick={() => onAct(item.id)}
          className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-bold text-green pressable"
        >
          {cta} <ArrowRight className="w-3.5 h-3.5" />
        </button>
      </article>
    </section>
  );
}
