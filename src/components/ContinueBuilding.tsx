import { useEffect, useState } from "react";
import { Hammer, ArrowRight, Sparkles, Plus } from "lucide-react";
import type { FeedItem } from "@/data/feed";
import {
  getProject, setStage, STAGES, STAGE_COLOR, computeUpdates, type Stage,
} from "@/lib/projects";

interface Props {
  feed: FeedItem[];
  onContinue: (storyId: string) => void;
}

// Feature 1 — Continue Building. Feels like Signal remembered exactly where you
// stopped and what changed since. Never a progress tracker.
export function ContinueBuilding({ feed, onContinue }: Props) {
  const [project, setProject] = useState(() => getProject());
  useEffect(() => {
    const refresh = () => setProject(getProject());
    window.addEventListener("signal:project-changed", refresh);
    return () => window.removeEventListener("signal:project-changed", refresh);
  }, []);

  // Empty state — a gentle invitation, not a placeholder dashboard.
  if (!project) {
    return (
      <section className="mb-8">
        <div className="flex items-center gap-1.5 mb-3 text-foreground/80">
          <Sparkles className="w-3.5 h-3.5 text-green" />
          <span className="section-label !mb-0">Continue Building</span>
        </div>
        <article className="premium-card p-5 flex items-center gap-3.5">
          <div className="w-10 h-10 rounded-2xl bg-green/10 border border-green/20 flex items-center justify-center shrink-0">
            <Plus className="w-5 h-5 text-green" />
          </div>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold text-foreground leading-snug">Start your first AI project</h3>
            <p className="text-[12px] text-muted-foreground mt-0.5">We'll keep track of everything here.</p>
          </div>
        </article>
      </section>
    );
  }

  const color = STAGE_COLOR[project.stage];
  const updates = computeUpdates(project, feed);
  const hasUpdate = updates.count > 0;

  const cycleStage = () => {
    const i = STAGES.indexOf(project.stage);
    const next = STAGES[Math.min(i + 1, STAGES.length - 1)];
    setProject(setStage(next));
  };

  return (
    <section className="mb-8 animate-scale-in">
      <div className="flex items-center gap-1.5 mb-3 text-foreground/80">
        <span className="text-[13px]">🚀</span>
        <span className="section-label !mb-0">Continue Building</span>
      </div>

      <article className="premium-card is-lift p-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl flex items-center justify-center shrink-0" style={{ background: `${color}1f`, border: `1px solid ${color}40` }}>
            <Hammer className="w-5 h-5" style={{ color }} />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-bold text-foreground leading-snug line-clamp-2">{project.name}</h3>
            <button onClick={cycleStage} className="mt-1 inline-flex items-center gap-1.5 pressable" aria-label="Advance stage">
              <span className="w-1.5 h-1.5 rounded-full" style={{ background: color }} />
              <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color }}>{project.stage}</span>
            </button>
          </div>
        </div>

        {/* Signal remembers where you stopped */}
        <p className="text-[13px] text-foreground/85 leading-snug mt-3.5">
          You stopped here last session — ready when you are.
        </p>

        {/* What changed since the last session */}
        <div className="mt-3 rounded-xl bg-white/[0.03] border border-white/[0.06] p-3">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-green/80 mb-1">Since your last session</p>
          {hasUpdate ? (
            <p className="text-[13px] text-foreground/90 leading-snug">{updates.note}.</p>
          ) : (
            <p className="text-[13px] text-muted-foreground leading-snug">
              Nothing important changed. You're safe to continue where you left off.
            </p>
          )}
        </div>

        <button
          onClick={() => onContinue(project.id)}
          className="mt-5 w-full h-11 rounded-xl bg-green text-black text-sm font-bold flex items-center justify-center gap-1.5 pressable shadow-[0_0_24px_hsl(152_72%_48%/0.22)]"
        >
          Continue <ArrowRight className="w-4 h-4" />
        </button>
      </article>
    </section>
  );
}

export type { Stage };
