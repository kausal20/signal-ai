import { Link } from "react-router-dom";
import { Sparkles, Rocket, Wrench, TrendingUp, ArrowRight, Zap } from "lucide-react";
import type { FeedItem } from "@/data/feed";

interface Advisor {
  best_opportunity_today?: { id: string; headline: string; opportunity?: { type?: string; title?: string; explanation?: string } } | null;
  tool_worth_trying?: { id: string; headline: string; action?: string } | null;
  one_action_to_take?: string | null;
  one_trend_to_watch?: string | null;
  one_skill_to_learn?: string | null;
}

interface Props { advisor: Advisor | null; items: FeedItem[]; personalized: boolean; }

interface Highlight { icon: React.ReactNode; tag: string; title: string; body: string; }

export function DailyBrief({ advisor, items, personalized }: Props) {
  const highlights: Highlight[] = [];

  if (advisor?.best_opportunity_today?.opportunity) {
    const o = advisor.best_opportunity_today.opportunity;
    highlights.push({ icon: <Rocket className="w-4 h-4" />, tag: o.type ?? "Opportunity", title: o.title ?? "Today's opportunity", body: o.explanation ?? advisor.best_opportunity_today.headline });
  }
  if (advisor?.tool_worth_trying) {
    highlights.push({ icon: <Wrench className="w-4 h-4" />, tag: "Tool of the day", title: advisor.tool_worth_trying.headline, body: advisor.tool_worth_trying.action ?? "Worth trying today." });
  }
  if (advisor?.one_trend_to_watch) {
    highlights.push({ icon: <TrendingUp className="w-4 h-4" />, tag: "Market shift", title: "Trend to watch", body: advisor.one_trend_to_watch });
  }
  // Fallback highlights for new users (no personalization yet).
  if (highlights.length === 0) {
    const top = [...items].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 3);
    for (const it of top) highlights.push({ icon: <Zap className="w-4 h-4" />, tag: it.tag, title: it.title, body: it.whyItMatters || it.summary });
  }

  const action = advisor?.one_action_to_take;

  return (
    <section className="mb-7 animate-scale-in">
      {/* Signature hero → Daily Advisor */}
      <Link to="/advisor" className="block green-halo p-4 mb-4 pressable">
        <div className="flex items-center justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-green flex items-center gap-1.5">
              <Sparkles className="w-3 h-3" /> Today's AI Brief
            </p>
            <p className="text-[15px] font-bold text-foreground mt-1 leading-snug">
              {action ?? "Your personalized intelligence is ready"}
            </p>
            <p className="text-[12px] text-muted-foreground mt-0.5">
              {personalized ? "Tuned to your interests" : "Personalizing as you read"} · Open Daily Advisor
            </p>
          </div>
          <div className="w-9 h-9 shrink-0 rounded-full bg-green/15 border border-green/25 flex items-center justify-center ml-3">
            <ArrowRight className="w-4 h-4 text-green" />
          </div>
        </div>
      </Link>

      {/* Horizontal highlights rail */}
      <div className="flex gap-3 overflow-x-auto no-scrollbar snap-rail -mx-4 px-4 sm:mx-0 sm:px-0">
        {highlights.slice(0, 4).map((h, i) => (
          <article key={i} className="premium-card is-lift p-4 w-[78%] sm:w-[260px] shrink-0">
            <div className="flex items-center gap-1.5 text-green mb-2">
              {h.icon}
              <span className="text-[10px] font-bold uppercase tracking-[0.14em]">{h.tag}</span>
            </div>
            <h3 className="text-sm font-bold text-foreground leading-snug mb-1.5 line-clamp-2">{h.title}</h3>
            <p className="text-[12px] text-muted-foreground leading-relaxed line-clamp-3">{h.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
