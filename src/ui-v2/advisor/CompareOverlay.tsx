// signal-ui-v2 · advisor/CompareOverlay.tsx
// ---------------------------------------------------------------------------
// Full-screen Compare AI page. Morphs out of the hero card via shared layoutId
// "compare-surface". Search + model selectors, then a beautiful animated
// head-to-head across 14 categories (animated bars + counters, winner accent).
// Presentation only; data from src/data/compareModels.ts.
// ---------------------------------------------------------------------------
import { useMemo, useState, useEffect } from "react";
import { AnimatePresence, motion as fm, useReducedMotion, type Variants } from "framer-motion";
import { X, Search as SearchIcon, Check } from "lucide-react";
import { BrandLogo } from "../icons/BrandLogo";
import { CountUp } from "../components/CountUp";
import { SourceChip } from "../components/SourceAttribution";
import { MODELS, CATEGORIES, type CompareModel } from "@/data/compareModels";

const ENTRY = { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 };
const EASE = [0.22, 1, 0.36, 1] as const;

// Official documentation per model/tool (used for "Sources Used" attribution).
const DOCS: Record<string, string> = {
  gpt: "https://platform.openai.com/docs",
  claude: "https://docs.anthropic.com",
  gemini: "https://ai.google.dev/gemini-api/docs",
  grok: "https://docs.x.ai",
  mistral: "https://docs.mistral.ai",
  deepseek: "https://api-docs.deepseek.com",
  perplexity: "https://docs.perplexity.ai",
  cursor: "https://docs.cursor.com",
  lovable: "https://docs.lovable.dev",
  bolt: "https://support.bolt.new",
};
const rowStagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.03 } } };
const rowItem: Variants = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.24, ease: EASE } } };

function Logo({ m, size = 18 }: { m: CompareModel; size?: number }) {
  return m.sourceKey
    ? <BrandLogo source={m.sourceKey} name={m.name} size={size} />
    : <span className="font-bold text-foreground/70" style={{ fontSize: size * 0.7 }}>{m.name.slice(0, 1)}</span>;
}

export function CompareOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string[]>(["gpt", "claude"]);
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? MODELS.filter((m) => `${m.name} ${m.maker}`.toLowerCase().includes(q)) : MODELS;
  }, [query]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];   // keep the most recent two
      return [...prev, id];
    });
  };

  if (!open) return null;

  const a = MODELS.find((m) => m.id === selected[0]);
  const b = MODELS.find((m) => m.id === selected[1]);
  const ready = a && b;

  return (
    <fm.div
      layoutId="compare-surface"
      transition={ENTRY}
      role="dialog" aria-modal="true" aria-label="Compare AI"
      className="fixed inset-0 z-[95] flex flex-col overflow-hidden bg-[#040604]"
    >
      {/* Header + search */}
      <div className="relative z-10 border-b border-white/[0.06] bg-[linear-gradient(to_bottom,rgba(4,6,4,0.92),rgba(4,6,4,0.6))] px-5 pb-3.5 pt-[52px] backdrop-blur-xl">
        <div className="mx-auto w-full max-w-[760px]">
          <div className="mb-3 flex items-center gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-green">Compare</div>
              <h1 className="text-[24px] font-extrabold tracking-[-0.03em] text-foreground">Compare AI</h1>
            </div>
            <button type="button" onClick={onClose} aria-label="Close"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="flex h-11 items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-3.5">
            <SearchIcon className="h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search any AI model, tool, framework or API…"
              aria-label="Search models" className="min-w-0 flex-1 bg-transparent text-[13.5px] text-foreground caret-green outline-none placeholder:text-muted-foreground/50" />
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-16 pt-4">
        <div className="mx-auto w-full max-w-[760px]">
          {/* Selector chips */}
          <div className="no-scrollbar -mx-5 flex gap-2.5 overflow-x-auto px-5 pb-1">
            {filtered.map((m) => {
              const on = selected.includes(m.id);
              return (
                <fm.button key={m.id} type="button" onClick={() => toggle(m.id)} aria-pressed={on}
                  whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: 0.96 }}
                  className={`flex shrink-0 items-center gap-2 rounded-2xl border px-3 py-2 transition-colors ${on ? "border-green/45 bg-green/[0.10]" : "border-white/[0.08] bg-white/[0.03] hover:bg-white/[0.05]"}`}>
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/[0.06]"><Logo m={m} size={15} /></span>
                  <span className={`text-[12.5px] font-bold ${on ? "text-green" : "text-foreground/85"}`}>{m.name}</span>
                  {on && <Check className="h-3.5 w-3.5 text-green" />}
                </fm.button>
              );
            })}
          </div>

          {/* VS header */}
          {ready && (
            <fm.div layout className="mt-5 flex items-center gap-3 rounded-3xl border border-white/[0.07] bg-white/[0.025] p-4">
              <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05]"><Logo m={a} size={22} /></span>
                <span className="text-[13px] font-bold text-foreground">{a.name}</span>
              </div>
              <span className="font-mono-tight text-[13px] font-extrabold text-green">VS</span>
              <div className="flex flex-1 flex-col items-center gap-1.5 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/[0.05]"><Logo m={b} size={22} /></span>
                <span className="text-[13px] font-bold text-foreground">{b.name}</span>
              </div>
            </fm.div>
          )}

          {/* Comparison */}
          <AnimatePresence mode="wait">
            {ready ? (
              <fm.div key={`${a.id}-${b.id}`} variants={rowStagger} initial="hidden" animate="show" exit={{ opacity: 0 }}
                className="mt-4 flex flex-col gap-3">
                {CATEGORIES.map((cat) => {
                  const av = a.scores[cat], bv = b.scores[cat];
                  const aWin = av > bv, bWin = bv > av;
                  return (
                    <fm.div key={cat} variants={rowItem} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3.5">
                      <div className="mb-2 flex items-center justify-between">
                        <span className={`font-mono-tight text-[13px] font-bold ${aWin ? "text-green" : "text-foreground/70"}`}><CountUp value={av} /></span>
                        <span className="text-[11.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{cat}</span>
                        <span className={`font-mono-tight text-[13px] font-bold ${bWin ? "text-green" : "text-foreground/70"}`}><CountUp value={bv} /></span>
                      </div>
                      {/* Diverging bars from the center */}
                      <div className="flex items-center gap-1">
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                          <fm.span className={`block h-full w-full rounded-full ${aWin ? "bg-green" : "bg-white/25"}`}
                            initial={reduce ? { scaleX: av / 100 } : { scaleX: 0 }} animate={{ scaleX: av / 100 }}
                            transition={reduce ? undefined : { duration: 0.6, ease: EASE }} style={{ transformOrigin: "right" }} />
                        </div>
                        <span className="h-3 w-px shrink-0 bg-white/15" />
                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                          <fm.span className={`block h-full w-full rounded-full ${bWin ? "bg-green" : "bg-white/25"}`}
                            initial={reduce ? { scaleX: bv / 100 } : { scaleX: 0 }} animate={{ scaleX: bv / 100 }}
                            transition={reduce ? undefined : { duration: 0.6, ease: EASE }} style={{ transformOrigin: "left" }} />
                        </div>
                      </div>
                    </fm.div>
                  );
                })}

                {/* Sources Used — official documentation for the compared tools */}
                <fm.div variants={rowItem} className="mt-3 rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
                  <div className="mb-2.5 text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">Sources Used</div>
                  <div className="flex flex-wrap gap-2">
                    {[a, b].map((m) => (
                      <SourceChip key={m.id} label={`${m.maker} Docs`} url={DOCS[m.id]} />
                    ))}
                  </div>
                </fm.div>
              </fm.div>
            ) : (
              <div className="mt-10 flex flex-col items-center py-10 text-center">
                <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-green/[0.08] text-green"><SearchIcon className="h-6 w-6" /></div>
                <p className="text-[14px] font-bold text-foreground">Pick two to compare</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">Select any two models or tools above.</p>
              </div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </fm.div>
  );
}
