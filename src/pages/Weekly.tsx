import { Link } from "react-router-dom";
import { ArrowLeft, BookOpen, Clock, Flame, Bookmark, Rocket, Award, TrendingUp } from "lucide-react";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { usePersonalizedFeed } from "@/hooks/usePersonalizedFeed";
import { getStats, signalLevel } from "@/lib/stats";
import { BottomNav } from "@/components/BottomNav";
import { SignalScoreRing } from "@/components/SignalScoreRing";

export default function Weekly() {
  const stats = getStats();
  const lvl = signalLevel(stats.readCount);
  const [bookmarks] = useLocalStorage<string[]>("signal:bookmarks", []);
  const { advisor, profile } = usePersonalizedFeed();

  const hoursSaved = (stats.minutesSaved / 60).toFixed(1);
  const topInterests: string[] = profile?.top_interests ?? profile?.top_concepts ?? [];
  const weekScore = Math.min(100, stats.weekRead * 8 + bookmarks.length * 4 + lvl.level * 5);

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      <div className="green-halo rounded-none sm:rounded-b-[2rem] px-5 pt-safe pb-6 mb-4">
        <div className="max-w-2xl mx-auto pt-4">
          <Link to="/" className="inline-flex items-center gap-1.5 text-[12px] text-muted-foreground hover:text-foreground pressable mb-4">
            <ArrowLeft className="w-3.5 h-3.5" /> Feed
          </Link>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-green flex items-center gap-1.5">
            <Award className="w-3.5 h-3.5" /> Weekly Report
          </p>
          <h1 className="text-2xl font-extrabold tracking-tight mt-1.5">Your week in AI</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Signal Level {lvl.level} · {lvl.label}</p>
        </div>
      </div>

      <main className="max-w-2xl mx-auto px-4 sm:px-6 space-y-4">
        {/* Weekly score ring */}
        <div className="premium-card p-5 flex items-center gap-5 animate-scale-in">
          <SignalScoreRing score={weekScore} size={80} showLabel className="shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-bold">Weekly Signal Score</p>
            <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
              Built from stories read, items saved, and your streak. Keep showing up to level up.
            </p>
            <div className="mt-2 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
              <div className="h-full rounded-full bg-green transition-all duration-700" style={{ width: `${lvl.pct}%` }} />
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">{lvl.pct}% to Level {lvl.level + 1}</p>
          </div>
        </div>

        {/* Stat grid */}
        <div className="grid grid-cols-2 gap-3">
          <Stat icon={<BookOpen className="w-4 h-4" />} value={stats.weekRead} label="Stories read this week" />
          <Stat icon={<Clock className="w-4 h-4" />} value={`${hoursSaved}h`} label="Time saved (est.)" />
          <Stat icon={<Flame className="w-4 h-4" />} value={stats.streak} label="Day reading streak" />
          <Stat icon={<Bookmark className="w-4 h-4" />} value={bookmarks.length} label="Saved tools & ideas" />
        </div>

        {/* Top topics */}
        <div className="premium-card p-4">
          <p className="section-label mb-3">Your top topics</p>
          {topInterests.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {topInterests.slice(0, 8).map((t) => (
                <span key={t} className="pill capitalize">{String(t).replace(/_/g, " ")}</span>
              ))}
            </div>
          ) : (
            <p className="text-[13px] text-muted-foreground">Read a few more stories to reveal your topic profile.</p>
          )}
        </div>

        {/* Most valuable opportunity */}
        <div className="premium-card p-4">
          <div className="flex items-center gap-1.5 text-green mb-2">
            <Rocket className="w-4 h-4" />
            <span className="text-[10px] font-bold uppercase tracking-[0.14em]">Most valuable opportunity</span>
          </div>
          <h3 className="text-[15px] font-bold leading-snug">
            {advisor?.best_opportunity_today?.opportunity?.title ?? "Surfaced as you engage more"}
          </h3>
          {advisor?.best_opportunity_today?.opportunity?.explanation && (
            <p className="text-[13px] text-muted-foreground leading-relaxed mt-1.5">
              {advisor.best_opportunity_today.opportunity.explanation}
            </p>
          )}
        </div>

        <Link to="/advisor" className="premium-card is-lift flex items-center justify-between p-4 pressable">
          <div className="flex items-center gap-2.5">
            <TrendingUp className="w-4 h-4 text-green" />
            <span className="text-sm font-semibold">Open today's Daily Advisor</span>
          </div>
          <ArrowLeft className="w-4 h-4 text-muted-foreground rotate-180" />
        </Link>
      </main>

      <BottomNav activeSection="home" />
    </div>
  );
}

function Stat({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="premium-card is-lift p-4 animate-scale-in">
      <div className="text-green mb-2">{icon}</div>
      <p className="text-2xl font-extrabold font-mono-tight leading-none">{value}</p>
      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug">{label}</p>
    </div>
  );
}
