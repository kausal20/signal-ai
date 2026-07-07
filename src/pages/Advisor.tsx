import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Brain, Rocket, Wrench, Workflow, TrendingUp, ShieldAlert,
  Bookmark, Play, Clock, Zap, Check, Circle, Plus, Minus,
} from "lucide-react";
import { usePersonalizedFeed } from "@/hooks/usePersonalizedFeed";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { BottomNav } from "@/components/BottomNav";
import { SignalScoreRing } from "@/components/SignalScoreRing";
import { startProject, getProject } from "@/lib/projects";
import { track, trackOutcome } from "@/lib/signals";
import { AdvisorPage } from "@/ui-v2/pages/AdvisorPage";
import { mapRecommendation, mapProject, mapPlanSteps } from "@/adapters/homeV2";

// P2 migration flag — new ui-v2 Advisor. Old Advisor stays below until verified.
const USE_V2_ADVISOR = true;

const today = new Date().toISOString().slice(0, 10);

interface PlanAction { id: string; title: string; why: string; time: string; impact: string; }

export default function Advisor() {
  const navigate = useNavigate();
  const { items, advisor, profile, status } = usePersonalizedFeed();
  const [bookmarks, setBookmarks] = useLocalStorage<string[]>("signal:bookmarks", []);
  const [done, setDone] = useLocalStorage<string[]>(`signal:advisor-done:${today}`, []);

  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const ranked = useMemo(
    () => [...items].sort((a, b) => (b.intel?.signalScore ?? b.score) - (a.intel?.signalScore ?? a.score)),
    [items],
  );

  const hero = (advisor?.best_opportunity_today && byId.get(advisor.best_opportunity_today.id))
    ?? ranked.find((i) => i.intel?.opportunity) ?? ranked[0];
  const tool = (advisor?.tool_worth_trying && byId.get(advisor.tool_worth_trying.id)) ?? ranked.find((i) => i.tag === "tool");
  const workflow = ranked.find((i) => i.tag === "use-case") ?? ranked.find((i) => i.intel?.action);
  const trendItem = ranked.find((i) => i.intel?.trend?.name);

  // "Why Signal picked this" — backend-provided reasons; fall back to derived.
  const whyRows = useMemo(() => {
    const w = hero?.intel?.whyPicked?.filter(Boolean).slice(0, 3) ?? [];
    if (w.length > 0) return w;
    const out: string[] = [];
    if (hero?.intel?.trend?.direction === "accelerating" || hero?.intel?.trend?.direction === "emerging") out.push("Growing quickly");
    if ((profile?.top_interests?.length ?? 0) > 0) out.push("Matches your interests");
    if (hero?.intel?.roi?.money_saved || hero?.intel?.priority === "High") out.push("High business potential");
    return out.slice(0, 3);
  }, [hero, profile]);

  // Exactly 3 actions, never empty (padded from cached data).
  const actions: PlanAction[] = useMemo(() => {
    const out: PlanAction[] = [];
    const seen = new Set<string>();
    const push = (id: string, title: string, why: string, time?: string, impact?: string) => {
      if (!id || !title || seen.has(id) || out.length >= 3) return;
      seen.add(id);
      out.push({ id, title, why, time: time ?? "~30 min", impact: impact ?? "Medium" });
    };
    for (const it of ranked) if (it.intel?.action) push(it.id, it.intel.action, it.intel.recommendationReason ?? it.whyItMatters, it.intel.roi?.time_saved, it.intel.priority);
    if (hero) push(hero.id, hero.intel?.action ?? `Evaluate ${hero.title}`, hero.intel?.recommendationReason ?? hero.whyItMatters, hero.intel?.roi?.time_saved, hero.intel?.priority);
    if (tool) push(tool.id, `Try ${tool.title}`, "Recommended for your stack.", "15 min", "Medium");
    if (workflow) push(workflow.id, `Set up: ${workflow.title}`, "Automate a repeatable task.", "1 hr", "High");
    return out.slice(0, 3);
  }, [ranked, hero, tool, workflow]);

  const toggleBookmark = (id: string) =>
    setBookmarks((prev) => prev.includes(id)
      ? (track("dismissed", { feed_item_id: id }), prev.filter((p) => p !== id))
      : (track("bookmarked", { feed_item_id: id }), trackOutcome("saved", id), [...prev, id]));
  const toggleDone = (id: string) =>
    setDone((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : (trackOutcome("action_completed", id), [...prev, id]));

  const loading = status.loading && items.length === 0;
  const heroScore = hero ? (hero.intel?.signalScore ?? hero.score) : 0;

  // ── P2: ui-v2 Advisor ───────────────────────────────────────────────────
  // Presentation swap only. Same hooks, same derived data (hero/whyRows/actions
  // from usePersonalizedFeed + advisor object), same handlers + tracking. Old
  // Advisor below stays as fallback for loading/empty and while flag is on.
  if (USE_V2_ADVISOR && !loading && hero) {
    const name =
      (typeof localStorage !== "undefined" && localStorage.getItem("signal:userName")) || "there";
    const navSection = (s: string) => {
      if (s === "home") navigate("/");
      else if (s === "search") navigate("/?section=search");
      else if (s === "saved") navigate("/?section=saved");
      else if (s === "settings") navigate("/settings");
      // "advisor" → already here, no-op
    };

    return (
      <AdvisorPage
        greeting={`${name}, here's your focus.`}
        recommendation={mapRecommendation(hero, bookmarks.includes(hero.id))}
        reasons={whyRows}
        plan={mapPlanSteps(actions, done)}
        project={mapProject(getProject(), items) ?? undefined}
        bookmarkCount={bookmarks.length}
        onNavigate={navSection}
        onStart={() => { startProject(hero); trackOutcome("built", hero.id); track("opened", { feed_item_id: hero.id }); }}
        onToggleSave={(id) => toggleBookmark(id)}
        onToggleStep={(id) => toggleDone(id)}
      />
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground pb-28">
      {/* Minimal nav — Brain (top-right) → AI Strategy chat. No greeting. */}
      <header className="sticky top-0 z-30 bg-background/80 backdrop-blur-xl pt-safe">
        <div className="max-w-2xl mx-auto px-5 h-14 flex items-center justify-end">
          <Link to="/strategy" aria-label="AI Strategy chat"
            className="w-9 h-9 rounded-full bg-green/10 border border-green/20 flex items-center justify-center pressable">
            <Brain className="w-4 h-4 text-green" />
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-5 sm:px-6">
        {loading ? (
          <div className="space-y-6 pt-2">
            <div className="skeleton h-64 rounded-[1.75rem]" />
            <div className="skeleton h-20 rounded-2xl" />
          </div>
        ) : !hero ? (
          <Empty />
        ) : (
          <>
            {/* SECTION 1 — Today's Mission (subtle) */}
            <div className="pt-2 pb-7">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">What to do today</p>
              <p className="text-[15px] text-foreground/70 mt-1.5">One opportunity worth acting on today.</p>
            </div>

            {/* SECTION 2 — Hero (the only dominant element) */}
            <article className="green-halo p-6 animate-scale-in">
              <div className="flex items-start justify-between gap-4 mb-4">
                <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-green flex items-center gap-1.5 mt-1">
                  <Rocket className="w-3.5 h-3.5" /> {hero.intel?.opportunity?.type ?? "Opportunity"}
                </span>
                <SignalScoreRing score={heroScore} size={64} showLabel className="shrink-0" />
              </div>

              <h1 className="text-[22px] sm:text-[26px] font-extrabold leading-[1.15] tracking-tight">
                {hero.intel?.opportunity?.title ?? hero.title}
              </h1>
              <p className="text-[14px] text-muted-foreground leading-relaxed mt-3">
                {hero.intel?.opportunity?.explanation ?? hero.whyItMatters}
              </p>

              {/* Calm metric row — no boxes, generous spacing */}
              <div className="flex flex-wrap gap-x-7 gap-y-3 mt-6">
                <Stat label="ROI" value={hero.intel?.roi?.money_saved ?? hero.intel?.roi?.time_saved ?? "High"} />
                <Stat label="Time" value={hero.intel?.roi?.time_saved ?? hero.intel?.roi?.payback_period ?? "This week"} />
                <Stat label="Difficulty" value={hero.intel?.effort ?? hero.intel?.roi?.difficulty ?? "Medium"} />
                <Stat label="Confidence" value={typeof hero.intel?.roi?.confidence === "number" ? `${hero.intel.roi.confidence}%` : (hero.intel?.confidence ?? "—")} />
              </div>

              {hero.intel?.risk && hero.intel.risk !== "Low" && (
                <p className="mt-5 text-[12px] text-amber-400/90 flex items-center gap-1.5">
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0" /> {hero.intel.risk} risk — validate before going all-in.
                </p>
              )}

              <div className="flex items-center gap-3 mt-6">
                <button onClick={() => { startProject(hero); trackOutcome("built", hero.id); track("opened", { feed_item_id: hero.id }); }}
                  className="flex-1 h-12 rounded-2xl bg-green text-black text-[15px] font-bold flex items-center justify-center gap-2 pressable shadow-[0_0_28px_hsl(152_72%_48%/0.28)]">
                  <Play className="w-4 h-4" /> Start Now
                </button>
                <button onClick={() => toggleBookmark(hero.id)} aria-label="Save"
                  className={`h-12 px-5 rounded-2xl text-[15px] font-semibold flex items-center gap-2 pressable ${bookmarks.includes(hero.id) ? "bg-green/10 text-green" : "text-foreground/80 hover:bg-white/[0.04]"}`}>
                  <Bookmark className={`w-4 h-4 ${bookmarks.includes(hero.id) ? "fill-green" : ""}`} /> Save
                </button>
              </div>
            </article>

            {/* SECTION 3 — Why Signal recommends this (3 rows, not a card) */}
            {whyRows.length > 0 && (
              <div className="mt-7 px-1 space-y-2.5">
                {whyRows.map((w, i) => (
                  <p key={i} className="flex items-center gap-2.5 text-[13px] text-foreground/80">
                    <Check className="w-4 h-4 text-green shrink-0" /> {w}
                  </p>
                ))}
              </div>
            )}

            {/* SECTION 4 — Today's Action Plan (3 compact rows, collapse details) */}
            <div className="mt-10">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">Action plan</p>
              <div className="divide-y divide-white/[0.05]">
                {actions.map((a) => (
                  <ActionRow key={a.id} action={a} checked={done.includes(a.id)} onToggle={() => toggleDone(a.id)} />
                ))}
              </div>
            </div>

            {/* SECTION 5 — Market Insight (ONE small card, one sentence each, tap to expand) */}
            {(tool || trendItem || workflow) && (
              <div className="mt-10">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground mb-3">Market insight</p>
                <div className="premium-card divide-y divide-white/[0.05] overflow-hidden">
                  {tool && (
                    <InsightRow icon={<Wrench className="w-4 h-4" />} label="Tool of the Day"
                      summary={tool.title}
                      detail={tool.intel?.recommendationReason ?? tool.intel?.action ?? tool.whyItMatters}
                      onOpen={() => track("tool_clicked", { feed_item_id: tool.id })} />
                  )}
                  {trendItem?.intel?.trend && (
                    <InsightRow icon={<TrendingUp className="w-4 h-4" />} label="Market Trend"
                      summary={`${trendItem.intel.trend.name} is ${trendItem.intel.trend.direction}`}
                      detail={trendItem.intel.trend.prediction ?? trendItem.intel.trend.evidence ?? trendItem.whyItMatters} />
                  )}
                  {workflow && (
                    <InsightRow icon={<Workflow className="w-4 h-4" />} label="Workflow"
                      summary={workflow.title}
                      detail={workflow.intel?.action ?? "Trigger → AI → Automation → Outcome. Time saved every week."}
                      onOpen={() => track("workflow_opened", { feed_item_id: workflow.id })} />
                  )}
                </div>
              </div>
            )}
          </>
        )}
      </main>

      <BottomNav activeSection="advisor" bookmarkCount={bookmarks.length} />
    </div>
  );
}

/* ── Calm metric (label over value, no box) ── */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
      <p className="text-[15px] font-bold text-foreground mt-0.5">{value}</p>
    </div>
  );
}

/* ── Action row: checkbox · action · time · impact. Tap to reveal "why". ── */
function ActionRow({ action, checked, onToggle }: { action: PlanAction; checked: boolean; onToggle: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="py-3.5">
      <div className="flex items-center gap-3">
        <button onClick={onToggle} className="pressable shrink-0" aria-label={checked ? "Done" : "Mark done"}>
          {checked ? <Check className="w-5 h-5 text-green" /> : <Circle className="w-5 h-5 text-muted-foreground" />}
        </button>
        <button onClick={() => setOpen((v) => !v)} className="min-w-0 flex-1 text-left">
          <p className={`text-[14px] font-semibold leading-snug ${checked ? "line-through text-muted-foreground" : "text-foreground"}`}>{action.title}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 flex items-center gap-3">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {action.time}</span>
            <span className="flex items-center gap-1"><Zap className="w-3 h-3 text-green/70" /> {action.impact}</span>
          </p>
        </button>
        <button onClick={() => setOpen((v) => !v)} aria-label={open ? "Collapse" : "Expand"} className="pressable text-muted-foreground shrink-0">
          {open ? <Minus className="w-4 h-4" /> : <Plus className="w-4 h-4" />}
        </button>
      </div>
      {open && <p className="text-[12px] text-muted-foreground leading-relaxed mt-2 ml-8 animate-scale-in">{action.why}</p>}
    </div>
  );
}

/* ── Market insight row: one sentence, tap to expand. ── */
function InsightRow({ icon, label, summary, detail, onOpen }: {
  icon: React.ReactNode; label: string; summary: string; detail: string; onOpen?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const toggle = () => { setOpen((v) => { if (!v) onOpen?.(); return !v; }); };
  return (
    <button onClick={toggle} className="w-full text-left p-4 pressable">
      <div className="flex items-center gap-3">
        <span className="text-green/80 shrink-0">{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
          <p className="text-[13px] font-semibold text-foreground truncate">{summary}</p>
        </div>
        {open ? <Minus className="w-4 h-4 text-muted-foreground shrink-0" /> : <Plus className="w-4 h-4 text-muted-foreground shrink-0" />}
      </div>
      {open && <p className="text-[12px] text-muted-foreground leading-relaxed mt-2 ml-7 animate-scale-in">{detail}</p>}
    </button>
  );
}

function Empty() {
  return (
    <div className="py-24 text-center animate-fade-up">
      <div className="w-16 h-16 mx-auto mb-5 rounded-3xl green-halo flex items-center justify-center"><Brain className="w-7 h-7 text-green" /></div>
      <h3 className="text-lg font-bold mb-2">Your strategist is warming up</h3>
      <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">Read a few stories and today's opportunity appears here.</p>
    </div>
  );
}
