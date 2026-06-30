import { Link } from "react-router-dom";
import { Star, ArrowRight, Bookmark, TrendingUp, Clock, ShieldCheck } from "lucide-react";
import type { FeedItem } from "@/data/feed";
import { SignalScoreRing } from "@/components/SignalScoreRing";
import { whyThisMatters, ctaForOpportunity, confidenceVoice } from "@/lib/recommend";

interface Props {
  item: FeedItem;
  saved: boolean;
  onSave: () => void;
  onView: () => void;
}

// Effort level → a rough "time required" read so the metric stays honest.
const EFFORT_TIME: Record<string, string> = {
  Low: "< 1 day",
  Medium: "~1 week",
  High: "Multi-week",
};

// Section 2 — Today's Best Opportunity. The single most important decision today.
// Reads like advice from an expert, not a statistics card.
export function HeroOpportunity({ item, saved, onSave, onView }: Props) {
  const intel = item.intel;
  const opp = intel?.opportunity;
  const title = opp?.title ?? intel?.personalizedTakeaway ?? item.title;
  const why = whyThisMatters(item);
  const cta = ctaForOpportunity(item);

  const impact = opp?.potential_impact ?? intel?.roi?.money_saved ?? "High";
  const effort = (intel?.effort ?? intel?.roi?.difficulty ?? opp?.difficulty ?? "Medium") as string;
  const timeRequired = intel?.roi?.time_saved ?? intel?.roi?.payback_period ?? EFFORT_TIME[effort] ?? "~1 week";
  const confLine = confidenceVoice(item);

  return (
    <section className="mb-9 animate-scale-in">
      <div className="flex items-center gap-1.5 mb-3 text-green">
        <Star className="w-3.5 h-3.5 fill-green" />
        <span className="section-label !mb-0">Today's Recommendation</span>
      </div>

      <article className="green-halo p-6 sm:p-7">
        {/* Headline + score */}
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[22px] sm:text-[26px] font-extrabold leading-[1.15] tracking-tight text-foreground">
            {title}
          </h2>
          <SignalScoreRing score={intel?.signalScore ?? item.score} size={54} showLabel className="shrink-0 -mt-1" />
        </div>

        {/* Signal explains, mentor voice — one sentence */}
        <div className="mt-4">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-green/80 mb-1.5">
            Here's why I'm recommending this
          </p>
          <p className="text-[14px] sm:text-[15px] text-foreground/90 leading-relaxed font-medium">
            {why}
          </p>
        </div>

        {/* Two supporting facts — they back the recommendation, they aren't it */}
        <div className="grid grid-cols-2 gap-2.5 mt-6">
          <Metric icon={<TrendingUp className="w-3.5 h-3.5" />} label="What you'll gain" value={String(impact)} />
          <Metric icon={<Clock className="w-3.5 h-3.5" />} label="Estimated effort" value={String(timeRequired)} />
        </div>

        {/* Confidence as Signal speaking, not a number */}
        <p className="flex items-center gap-1.5 text-[13px] text-green/90 font-medium mt-3">
          <ShieldCheck className="w-3.5 h-3.5 shrink-0" /> {confLine}
        </p>

        {/* Action-oriented CTA */}
        <div className="flex items-center gap-2.5 mt-6">
          <Link
            to="/advisor"
            onClick={onView}
            className="flex-1 h-12 rounded-xl bg-green text-black text-[15px] font-bold flex items-center justify-center gap-1.5 pressable shadow-[0_0_28px_hsl(152_72%_48%/0.28)]"
          >
            {cta} <ArrowRight className="w-4 h-4" />
          </Link>
          <button
            onClick={onSave}
            aria-label={saved ? "Saved" : "Save"}
            className={`h-12 px-4 rounded-xl border text-sm font-semibold flex items-center gap-1.5 pressable transition-colors ${
              saved ? "bg-green/10 border-green/25 text-green" : "border-white/[0.08] text-foreground hover:bg-white/[0.04]"
            }`}
          >
            <Bookmark className={`w-4 h-4 ${saved ? "fill-green animate-bookmark" : ""}`} />
            {saved ? "Saved" : "Save"}
          </button>
        </div>
      </article>
    </section>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/[0.06] p-2.5">
      <div className="flex items-center gap-1 text-green/80 mb-1">{icon}
        <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</span>
      </div>
      <p className="text-[13px] font-bold text-foreground truncate">{value}</p>
    </div>
  );
}
