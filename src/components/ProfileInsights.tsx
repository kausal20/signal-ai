import { Link } from "react-router-dom";
import { Brain, Flame, BookOpen, Award, ChevronRight, Sparkles } from "lucide-react";
import { getStats, signalLevel } from "@/lib/stats";
import { getPersona } from "@/lib/clientId";
import { useLocalStorage } from "@/hooks/useLocalStorage";

const PERSONA_LABEL: Record<string, string> = {
  developer: "Developer", builder: "Indie Builder", founder: "Founder", agency: "Automation Agency",
  researcher: "Researcher", marketer: "Marketer", investor: "Investor", student: "Student", generic: "AI Explorer",
};

export function ProfileInsights() {
  const stats = getStats();
  const lvl = signalLevel(stats.readCount);
  const persona = getPersona();
  const [bookmarks] = useLocalStorage<string[]>("signal:bookmarks", []);
  let topics: string[] = [];
  try { topics = JSON.parse(localStorage.getItem("signal:topics") || localStorage.getItem("signal:interests") || "[]"); } catch { /* */ }

  return (
    <section className="space-y-3">
      {/* Persona + level hero */}
      <div className="green-halo p-5 animate-scale-in">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-green flex items-center gap-1.5">
              <Brain className="w-3 h-3" /> Your AI Persona
            </p>
            <p className="text-xl font-extrabold mt-1">{PERSONA_LABEL[persona] ?? "AI Explorer"}</p>
            <p className="text-[12px] text-muted-foreground mt-0.5">Signal Level {lvl.level} · {lvl.label}</p>
          </div>
          <div className="w-14 h-14 score-ring flex items-center justify-center shrink-0" style={{ ["--v" as any]: lvl.pct }}>
            <div className="w-[46px] h-[46px] rounded-full bg-background flex items-center justify-center">
              <Award className="w-5 h-5 text-green" />
            </div>
          </div>
        </div>
        <div className="mt-3 h-1.5 rounded-full bg-white/[0.06] overflow-hidden">
          <div className="h-full rounded-full bg-green transition-all duration-700" style={{ width: `${lvl.pct}%` }} />
        </div>
        <p className="text-[10px] text-muted-foreground mt-1.5">{lvl.pct}% to next level · Signal learns as you read</p>
      </div>

      {/* Mini stats */}
      <div className="grid grid-cols-3 gap-3">
        <Mini icon={<BookOpen className="w-4 h-4" />} value={stats.weekRead} label="Read / wk" />
        <Mini icon={<Flame className="w-4 h-4" />} value={stats.streak} label="Streak" />
        <Mini icon={<Sparkles className="w-4 h-4" />} value={bookmarks.length} label="Saved" />
      </div>

      {/* Top interests */}
      {topics.length > 0 && (
        <div className="premium-card p-4">
          <p className="section-label mb-3">Top interests</p>
          <div className="flex flex-wrap gap-2">
            {topics.slice(0, 8).map((t) => <span key={t} className="pill capitalize">{String(t).replace(/_/g, " ")}</span>)}
          </div>
        </div>
      )}

      {/* Quick links to signature screens */}
      <div className="grid grid-cols-2 gap-3">
        <Link to="/advisor" className="premium-card is-lift p-4 pressable flex items-center justify-between">
          <span className="text-sm font-semibold">Daily Advisor</span>
          <ChevronRight className="w-4 h-4 text-green" />
        </Link>
        <Link to="/weekly" className="premium-card is-lift p-4 pressable flex items-center justify-between">
          <span className="text-sm font-semibold">Weekly Report</span>
          <ChevronRight className="w-4 h-4 text-green" />
        </Link>
      </div>
    </section>
  );
}

function Mini({ icon, value, label }: { icon: React.ReactNode; value: React.ReactNode; label: string }) {
  return (
    <div className="premium-card p-3.5 text-center">
      <div className="text-green flex justify-center mb-1.5">{icon}</div>
      <p className="text-xl font-extrabold font-mono-tight leading-none">{value}</p>
      <p className="text-[10px] text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
