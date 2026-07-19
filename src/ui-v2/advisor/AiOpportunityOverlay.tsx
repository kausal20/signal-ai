// signal-ui-v2 · advisor/AiOpportunityOverlay.tsx
// ---------------------------------------------------------------------------
// AI Opportunity detail — Apple-keynote, not documentation. Morphs out of the
// hero card via shared layoutId "opp-surface". ONE premium metrics card, then
// five premium-card sections: Why Now · Market Opportunity · Tech Stack ·
// Build Roadmap · Related Opportunities. Minimal text, high hierarchy.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { motion as fm, useReducedMotion, useScroll, useTransform, type Variants } from "framer-motion";
import { X, ArrowUpRight } from "lucide-react";
import { CountUp } from "../components/CountUp";
import { SourceChip } from "../components/SourceAttribution";
import { OPPORTUNITIES, type Opportunity, type OriginSource } from "@/data/opportunities";

// Fallback origins when an opportunity doesn't carry its own — every
// opportunity cites where its signal came from.
const DEFAULT_ORIGINS: OriginSource[] = [
  { label: "OpenAI Announcement", url: "https://openai.com/news" },
  { label: "Anthropic Research", url: "https://www.anthropic.com/research" },
  { label: "GitHub Repository", url: "https://github.com/trending" },
  { label: "arXiv Paper", url: "https://arxiv.org/list/cs.AI/recent" },
];

const ENTRY = { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 };
const EASE = [0.22, 1, 0.36, 1] as const;
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.02 } } };
const rise: Variants = { hidden: { opacity: 0, y: 18, filter: "blur(4px)" }, show: { opacity: 1, y: 0, filter: "blur(0px)", transition: { duration: 0.3, ease: EASE } } };
const reveal = { initial: "hidden" as const, whileInView: "show" as const, viewport: { once: true, amount: 0.25 } };

const COMP_TINT: Record<string, string> = {
  Low: "border-green/30 bg-green/[0.12] text-green",
  Medium: "border-[hsl(45_90%_55%/0.3)] bg-[hsl(45_90%_55%/0.10)] text-[hsl(45_90%_62%)]",
  High: "border-[hsl(0_75%_60%/0.3)] bg-[hsl(0_75%_60%/0.10)] text-[hsl(0_75%_68%)]",
};

// Premium card shell used by every section.
function Card({ title, children, reduce }: { title: string; children: React.ReactNode; reduce: boolean }) {
  return (
    <fm.section {...reveal} variants={stagger}
      className="overflow-hidden rounded-[24px] border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-md">
      <fm.h2 variants={rise} className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-green">{title}</fm.h2>
      {children}
    </fm.section>
  );
}

export function AiOpportunityOverlay({ open, onClose, opportunity }: {
  open: boolean; onClose: () => void; opportunity: Opportunity;
}) {
  const reduce = useReducedMotion();
  const [current, setCurrent] = useState<Opportunity>(opportunity);
  const scrollRef = useRef<HTMLDivElement>(null);
  const { scrollY } = useScroll({ container: scrollRef });
  const heroY = useTransform(scrollY, [0, 200], [0, -24]);
  const heroOpacity = useTransform(scrollY, [0, 160], [1, 0.35]);

  useEffect(() => { if (open) setCurrent(opportunity); }, [open, opportunity]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  const d = current;
  const more = OPPORTUNITIES.filter((o) => o.id !== d.id);
  const metrics = [
    { label: "Revenue", value: d.revenue },
    { label: "Difficulty", value: d.difficulty },
    { label: "Time", value: d.learnTime },
  ];

  return (
    <fm.div
      layoutId="opp-surface"
      transition={ENTRY}
      role="dialog" aria-modal="true" aria-label={`${d.name} opportunity`}
      className="fixed inset-0 z-[95] flex flex-col overflow-hidden bg-[#040604]"
    >
      {/* Minimal top bar — just a close affordance */}
      <div className="relative z-20 flex items-center justify-end px-5 pb-2 pt-[46px]">
        <button type="button" onClick={onClose} aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-muted-foreground backdrop-blur-md transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green">
          <X className="h-4 w-4" />
        </button>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-5 pb-16">
        <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4">
          {/* HERO — large title + ONE premium metrics card */}
          <fm.div style={reduce ? undefined : { y: heroY, opacity: heroOpacity }} className="pt-1">
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.16em] text-green">Opportunity</div>
            <h1 className="text-[34px] font-extrabold leading-[1.05] tracking-[-0.035em] text-foreground">{d.name}</h1>
            <p className="mt-1.5 text-[14px] text-muted-foreground">{d.tagline}</p>

            <div className="relative mt-5 overflow-hidden rounded-[28px] border border-green/15 bg-[radial-gradient(120%_130%_at_0%_0%,hsl(152_72%_48%/0.10),transparent_55%),linear-gradient(180deg,hsl(0_0%_100%/0.03),hsl(0_0%_100%/0.01))] p-6">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-mono-tight text-[52px] font-extrabold leading-none text-green">
                    <CountUp value={d.score} />
                  </div>
                  <div className="mt-1 text-[11px] font-bold uppercase tracking-[0.12em] text-muted-foreground">Opportunity Score</div>
                </div>
                <span className={`rounded-full border px-3 py-1.5 text-[12px] font-bold ${COMP_TINT[d.competition]}`}>
                  {d.competition} competition
                </span>
              </div>
              <div className="my-4 h-px bg-white/[0.07]" />
              <div className="grid grid-cols-3 gap-3">
                {metrics.map((m) => (
                  <div key={m.label}>
                    <div className="text-[15px] font-extrabold text-foreground">{m.value}</div>
                    <div className="mt-0.5 text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/70">{m.label}</div>
                  </div>
                ))}
              </div>
            </div>
          </fm.div>

          {/* 1 · WHY NOW */}
          <Card title="Why Now" reduce={!!reduce}>
            <fm.p variants={rise} className="text-[14px] leading-relaxed text-foreground/85">{d.whyExists}</fm.p>
          </Card>

          {/* 2 · MARKET OPPORTUNITY */}
          <Card title="Market Opportunity" reduce={!!reduce}>
            <fm.div variants={rise} className="mb-2 flex items-baseline justify-between">
              <span className="text-[13px] font-semibold text-foreground/85">Demand</span>
              <span className="font-mono-tight text-[18px] font-extrabold text-green">{d.demand}%</span>
            </fm.div>
            <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
              <fm.span className="block h-full w-full origin-left rounded-full bg-[linear-gradient(90deg,hsl(152_72%_40%),hsl(152_72%_54%))]"
                initial={reduce ? { scaleX: d.demand / 100 } : { scaleX: 0 }} whileInView={{ scaleX: d.demand / 100 }} viewport={{ once: true }}
                transition={reduce ? undefined : { duration: 0.8, ease: EASE }} style={{ transformOrigin: "left" }} />
            </div>
            <fm.p variants={rise} className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
              Revenue potential <span className="font-semibold text-foreground/80">{d.revenue}</span> · best for{" "}
              <span className="font-semibold text-foreground/80">{d.whoShould.join(", ")}</span>.
            </fm.p>
          </Card>

          {/* 3 · TECH STACK */}
          <Card title="Tech Stack" reduce={!!reduce}>
            <fm.div variants={stagger} className="flex flex-wrap gap-2">
              {d.stack.map((t) => (
                <fm.span key={t} variants={rise}
                  className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12.5px] font-semibold text-foreground/85">
                  {t}
                </fm.span>
              ))}
            </fm.div>
          </Card>

          {/* 4 · BUILD ROADMAP */}
          <Card title="Build Roadmap" reduce={!!reduce}>
            <div className="flex flex-col gap-3">
              {d.plan.map((p, i) => (
                <fm.div key={i} variants={rise} className="flex gap-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green/[0.12] font-mono-tight text-[13px] font-bold text-green">{i + 1}</span>
                  <div>
                    <div className="text-[14px] font-bold text-foreground">{p.title}</div>
                    <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">{p.body}</div>
                  </div>
                </fm.div>
              ))}
            </div>
          </Card>

          {/* 5 · RELATED OPPORTUNITIES */}
          <fm.section {...reveal} variants={stagger} className="mt-1">
            <fm.h2 variants={rise} className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-green">Related Opportunities</fm.h2>
            <div className="no-scrollbar -mx-5 flex gap-3 overflow-x-auto px-5 pb-1">
              {more.map((o) => (
                <fm.button key={o.id} type="button" variants={rise} onClick={() => { setCurrent(o); scrollRef.current?.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); }}
                  whileHover={reduce ? undefined : { y: -4 }} whileTap={reduce ? undefined : { scale: 0.97 }}
                  className="flex w-[176px] shrink-0 flex-col justify-between rounded-[22px] border border-white/[0.07] bg-white/[0.03] p-4 text-left backdrop-blur-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/60">
                  <div>
                    <div className="text-[14px] font-bold text-foreground">{o.name}</div>
                    <div className="mt-0.5 text-[11.5px] text-muted-foreground">{o.tagline}</div>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="font-mono-tight text-[22px] font-extrabold text-green">{o.score}</span>
                    <ArrowUpRight className="h-4 w-4 text-green/70" />
                  </div>
                </fm.button>
              ))}
            </div>
          </fm.section>

          {/* Based on — every opportunity cites its origin */}
          <fm.section {...reveal} variants={stagger} className="mt-1">
            <fm.h2 variants={rise} className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-green">Based on</fm.h2>
            <fm.div variants={rise} className="flex flex-wrap gap-2">
              {(d.sources ?? DEFAULT_ORIGINS).map((s) => (
                <SourceChip key={s.label} label={s.label} url={s.url} />
              ))}
            </fm.div>
          </fm.section>
        </div>
      </div>
    </fm.div>
  );
}
