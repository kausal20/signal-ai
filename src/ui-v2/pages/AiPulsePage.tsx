// signal-ui-v2 · pages/AiPulsePage.tsx
// ---------------------------------------------------------------------------
// AI Pulse — the AI industry's live intelligence center. A standalone premium
// page (route /ai-pulse) opened from the Advisor hero carousel. Eight scroll-
// revealed sections, animated counters, timeline, heatmap, and AI analysis.
// Data comes from `useAiPulse` (live via edge fn, or bundled Preview sample).
// Presentation only — no existing page/route/nav is modified.
// ---------------------------------------------------------------------------
import { useNavigate } from "react-router-dom";
import { motion as fm, useReducedMotion, type Variants } from "framer-motion";
import {
  ChevronLeft, TrendingUp, TrendingDown, Minus, Rocket, DollarSign,
  Building2, FlaskConical, Package, Cpu, Plug, ArrowUpRight, Handshake,
  Sparkles, Trophy, AlertTriangle, RefreshCw,
} from "lucide-react";
import { motionTokens } from "../animations/motion";
import { BrandLogo } from "../icons/BrandLogo";
import { CountUp } from "../components/CountUp";
import { useAiPulse } from "@/hooks/useAiPulse";
import type { PulseData } from "@/data/aiPulse";

const EASE = motionTokens.ease.premium;
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.03 } } };
const rise: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } } };
const reveal = { initial: "hidden" as const, whileInView: "show" as const, viewport: { once: true, amount: 0.15 } };

function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
  if (trend === "up") return <TrendingUp className="h-3.5 w-3.5 text-green" />;
  if (trend === "down") return <TrendingDown className="h-3.5 w-3.5 text-[hsl(0_75%_64%)]" />;
  return <Minus className="h-3.5 w-3.5 text-muted-foreground" />;
}

const HEAT: Record<string, string> = {
  green: "border-green/30 bg-green/[0.12] text-green",
  yellow: "border-[hsl(45_90%_55%/0.3)] bg-[hsl(45_90%_55%/0.10)] text-[hsl(45_90%_62%)]",
  red: "border-[hsl(0_75%_60%/0.3)] bg-[hsl(0_75%_60%/0.10)] text-[hsl(0_75%_68%)]",
};

function SectionTitle({ emoji, title }: { emoji: string; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="text-[15px]" aria-hidden>{emoji}</span>
      <h2 className="text-[15px] font-extrabold tracking-[-0.01em] text-foreground">{title}</h2>
    </div>
  );
}

// ── Section blocks ──────────────────────────────────────────────────────────
function Overview({ d }: { d: PulseData }) {
  const tiles = [
    { icon: <Rocket className="h-4 w-4" />, label: "Launches", value: d.overview.launches },
    { icon: <Cpu className="h-4 w-4" />, label: "Model launches", value: d.overview.model_launches },
    { icon: <Plug className="h-4 w-4" />, label: "API releases", value: d.overview.api_releases },
    { icon: <DollarSign className="h-4 w-4" />, label: "Funding rounds", value: d.overview.funding_rounds },
    { icon: <Building2 className="h-4 w-4" />, label: "Acquisitions", value: d.overview.acquisitions },
    { icon: <FlaskConical className="h-4 w-4" />, label: "Research papers", value: d.overview.research_papers },
    { icon: <Package className="h-4 w-4" />, label: "Open-source", value: d.overview.open_source },
  ];
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="📊" title="Industry Overview" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {tiles.map((t) => (
          <fm.div key={t.label} variants={rise} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5">
            <span className="mb-2 flex h-8 w-8 items-center justify-center rounded-lg bg-green/[0.10] text-green">{t.icon}</span>
            <div className="font-mono-tight text-[22px] font-extrabold text-foreground">
              <CountUp value={t.value} duration={900} />
            </div>
            <div className="text-[11px] font-medium text-muted-foreground">{t.label}</div>
          </fm.div>
        ))}
      </div>
    </fm.section>
  );
}

function Leaderboard({ d }: { d: PulseData }) {
  const reduce = useReducedMotion();
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="🏆" title="Company Leaderboard" />
      <div className="flex flex-col gap-2.5">
        {d.companies.map((c, i) => (
          <fm.div
            key={c.name}
            variants={rise}
            whileHover={reduce ? undefined : { x: 3, borderColor: "hsl(152 72% 48% / 0.28)" }}
            whileTap={reduce ? undefined : { scale: 0.99 }}
            transition={{ type: "spring", stiffness: 340, damping: 24 }}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5"
          >
            <span className="w-5 shrink-0 font-mono-tight text-[12px] font-bold text-white/30">{String(i + 1).padStart(2, "0")}</span>
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.05]">
              {c.sourceKey ? <BrandLogo source={c.sourceKey} name={c.name} size={20} /> : <span className="text-[13px] font-bold text-foreground/70">{c.name.slice(0, 1)}</span>}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-[14px] font-bold text-foreground">{c.name}</span>
                <TrendIcon trend={c.trend} />
              </div>
              <div className="truncate text-[11.5px] text-muted-foreground">{c.latest_model} · {c.latest_release}</div>
            </div>
            <div className="shrink-0 text-right">
              <div className="font-mono-tight text-[15px] font-bold text-green">{c.activity_score}</div>
              <div className="text-[9.5px] font-semibold uppercase tracking-[0.1em] text-muted-foreground/60">activity</div>
            </div>
          </fm.div>
        ))}
      </div>
    </fm.section>
  );
}

function Trending({ d }: { d: PulseData }) {
  const reduce = useReducedMotion();
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="🔥" title="Trending Companies" />
      <div className="no-scrollbar -mx-4 flex gap-3 overflow-x-auto px-4 pb-1 sm:-mx-5 sm:px-5">
        {d.trending.map((t) => (
          <fm.div
            key={t.name}
            variants={rise}
            whileHover={reduce ? undefined : { y: -4 }}
            className="flex w-[190px] shrink-0 flex-col gap-2 rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.05]">
                {t.sourceKey ? <BrandLogo source={t.sourceKey} name={t.name} size={18} /> : <span className="text-[12px] font-bold text-foreground/70">{t.name.slice(0, 1)}</span>}
              </span>
              <span className="text-[14px] font-bold text-foreground">{t.name}</span>
            </div>
            <p className="text-[12px] leading-snug text-muted-foreground">{t.note}</p>
            <span className={`inline-flex w-fit items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-bold ${t.change >= 0 ? "bg-green/[0.12] text-green" : "bg-[hsl(0_75%_60%/0.12)] text-[hsl(0_75%_66%)]"}`}>
              {t.change >= 0 ? <ArrowUpRight className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {t.change >= 0 ? "+" : ""}{t.change}%
            </span>
          </fm.div>
        ))}
      </div>
    </fm.section>
  );
}

function Releases({ d }: { d: PulseData }) {
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="🚀" title="Latest AI Releases" />
      <div className="relative">
        <div className="pointer-events-none absolute left-[7px] top-2 bottom-2 w-px bg-gradient-to-b from-green/40 via-white/[0.06] to-transparent" />
        <div className="flex flex-col">
          {d.releases.map((r) => (
            <fm.div key={`${r.company}-${r.title}`} variants={rise} className="relative flex gap-3 pl-6 pb-4 last:pb-0">
              <span className="absolute left-[4px] top-[6px] h-[9px] w-[9px] rounded-full border border-green/50 bg-background">
                <span className="absolute inset-[2px] rounded-full bg-green/70" />
              </span>
              <div className="min-w-0 flex-1 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5">
                <div className="mb-1 flex items-center gap-1.5">
                  {r.sourceKey ? <BrandLogo source={r.sourceKey} name={r.company} size={13} /> : null}
                  <span className="text-[11px] font-bold text-green">{r.company}</span>
                  <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
                  <span className="text-[10.5px] font-semibold text-muted-foreground">{r.when}</span>
                  <span className="ml-auto rounded-full bg-white/[0.06] px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-[0.08em] text-muted-foreground">{r.kind}</span>
                </div>
                <div className="text-[13.5px] font-semibold leading-snug text-foreground/90">{r.title}</div>
              </div>
            </fm.div>
          ))}
        </div>
      </div>
    </fm.section>
  );
}

function Funding({ d }: { d: PulseData }) {
  const reduce = useReducedMotion();
  const parse = (a: string) => parseFloat(a.replace(/[^0-9.]/g, "")) || 0;
  const max = Math.max(1, ...d.funding.map((f) => parse(f.amount)));
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="💰" title="Funding Activity" />
      <div className="flex flex-col gap-3">
        {d.funding.map((f) => (
          <fm.div key={f.company} variants={rise} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[14px] font-bold text-foreground">{f.company}</span>
              <span className="font-mono-tight text-[15px] font-extrabold text-green">{f.amount}</span>
            </div>
            <div className="mb-2 h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <fm.span
                className="block h-full origin-left rounded-full bg-green"
                initial={reduce ? undefined : { scaleX: 0 }}
                whileInView={{ scaleX: Math.max(0.06, parse(f.amount) / max) }}
                viewport={{ once: true }}
                transition={reduce ? undefined : { duration: 0.7, ease: EASE }}
                style={{ display: "block" }}
              />
            </div>
            <div className="text-[11.5px] text-muted-foreground">{f.round}{f.investor ? ` · ${f.investor}` : ""}</div>
          </fm.div>
        ))}
      </div>
    </fm.section>
  );
}

function Partnerships({ d }: { d: PulseData }) {
  const reduce = useReducedMotion();
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="🤝" title="Partnerships" />
      <div className="flex flex-col gap-2.5">
        {d.partnerships.map((p) => (
          <fm.div
            key={`${p.a}-${p.b}`}
            variants={rise}
            whileHover={reduce ? undefined : { scale: 1.01 }}
            className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5"
          >
            <div className="flex items-center gap-2">
              <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-[12.5px] font-bold text-foreground">{p.a}</span>
              <Handshake className="h-4 w-4 text-green" />
              <span className="rounded-lg bg-white/[0.05] px-2.5 py-1 text-[12.5px] font-bold text-foreground">{p.b}</span>
            </div>
            <p className="mt-2 text-[12px] text-muted-foreground">{p.note}</p>
          </fm.div>
        ))}
      </div>
    </fm.section>
  );
}

function Heatmap({ d }: { d: PulseData }) {
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="🌡️" title="AI Ecosystem Heatmap" />
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {d.heatmap.map((h) => (
          <fm.div key={h.label} variants={rise} className={`rounded-2xl border p-3.5 ${HEAT[h.level]}`}>
            <div className="flex items-center justify-between">
              <span className="text-[12.5px] font-bold text-foreground/90">{h.label}</span>
              <span className="h-2.5 w-2.5 rounded-full" style={{ background: "currentColor" }} />
            </div>
            {h.note && <div className="mt-1 text-[11px] opacity-80">{h.note}</div>}
          </fm.div>
        ))}
      </div>
    </fm.section>
  );
}

function Analysis({ d }: { d: PulseData }) {
  const a = d.analysis;
  const rows = [
    { icon: <TrendingUp className="h-4 w-4" />, label: "Industry trend", value: a.industry_trend },
    { icon: <Sparkles className="h-4 w-4" />, label: "Key insight", value: a.key_insight },
    { icon: <Trophy className="h-4 w-4" />, label: "Biggest winner", value: a.biggest_winner },
    { icon: <TrendingDown className="h-4 w-4" />, label: "Biggest loser", value: a.biggest_loser },
    { icon: <Cpu className="h-4 w-4" />, label: "Developer impact", value: a.developer_impact },
    { icon: <Building2 className="h-4 w-4" />, label: "Business impact", value: a.business_impact },
  ];
  return (
    <fm.section {...reveal} variants={stagger}>
      <SectionTitle emoji="🧠" title="Signal Analysis" />
      <div className="flex flex-col gap-2.5 rounded-[22px] border border-green/15 bg-[radial-gradient(120%_120%_at_0%_0%,hsl(152_72%_48%/0.06),transparent_60%)] p-4">
        {rows.map((r) => (
          <fm.div key={r.label} variants={rise} className="flex gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-green/[0.10] text-green">{r.icon}</span>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.08em] text-muted-foreground/70">{r.label}</div>
              <div className="mt-0.5 text-[13px] leading-snug text-foreground/85">{r.value}</div>
            </div>
          </fm.div>
        ))}
      </div>
    </fm.section>
  );
}

function PulseSkeleton() {
  return (
    <div className="flex flex-col gap-4 px-4 pt-4" role="status" aria-label="Loading AI Pulse">
      <div className="grid grid-cols-3 gap-2.5">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3.5">
            <div className="motion-wave-shimmer mb-2 h-8 w-8 rounded-lg" />
            <div className="motion-wave-shimmer mb-1.5 h-5 w-12 rounded" />
            <div className="motion-wave-shimmer h-2.5 w-16 rounded" />
          </div>
        ))}
      </div>
      {[0, 1, 2].map((i) => (
        <div key={i} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-3.5">
          <div className="motion-wave-shimmer mb-2 h-4 w-40 rounded" />
          <div className="motion-wave-shimmer h-3 w-[70%] rounded" />
        </div>
      ))}
    </div>
  );
}

export default function AiPulsePage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const { status, data, preview, reload } = useAiPulse();

  return (
    <div className="relative flex h-full min-h-screen flex-col bg-[#040604] text-foreground">
      {/* Sticky hero header */}
      <header className="sticky top-0 z-20 border-b border-white/[0.06] bg-[linear-gradient(to_bottom,#060806,rgba(6,8,6,0.85))] px-4 pb-3.5 pt-[52px] backdrop-blur-xl sm:px-5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Back"
          className="mb-3 inline-flex h-9 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.04] pl-2 pr-3.5 text-[13px] font-semibold text-foreground transition-colors hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <div className="flex items-center gap-2.5">
          <span className="flex h-10 w-10 items-center justify-center rounded-2xl border border-green/25 bg-green/[0.10] text-green shadow-[0_0_18px_hsl(152_72%_48%/0.2)]">
            <TrendingUp className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-[22px] font-extrabold tracking-[-0.02em] text-foreground">AI Pulse</h1>
            <div className="flex items-center gap-1.5">
              <span className="relative flex h-[6px] w-[6px]">
                <span className="absolute inset-0 animate-[pulse-dot_2s_ease-in-out_infinite] rounded-full bg-green" />
              </span>
              <span className="text-[11.5px] font-medium text-muted-foreground">Live Industry Intelligence</span>
            </div>
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto px-4 pb-16 pt-2 sm:px-5">
        <div className="mx-auto w-full max-w-[860px]">
          {/* Preview banner (sample data until MESH_API_KEY + deploy) */}
          {status === "ready" && preview && (
            <fm.div
              initial={reduce ? undefined : { opacity: 0, y: -6 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              className="mb-4 mt-2 flex items-center gap-2.5 rounded-2xl border border-green/15 bg-green/[0.06] px-3.5 py-2.5"
            >
              <Sparkles className="h-4 w-4 shrink-0 text-green" />
              <span className="flex-1 text-[12px] leading-snug text-foreground/80">
                Preview data — connect <span className="font-semibold text-green">Signal AI</span> to go live.
              </span>
              <button
                type="button"
                onClick={reload}
                className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] px-3 py-1.5 text-[11.5px] font-bold text-foreground hover:bg-white/[0.10]"
              >
                <RefreshCw className="h-3 w-3" /> Retry
              </button>
            </fm.div>
          )}

          {status === "loading" || !data ? (
            <PulseSkeleton />
          ) : (
            <fm.div
              initial={reduce ? undefined : { opacity: 0 }}
              animate={reduce ? undefined : { opacity: 1 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col gap-8 pt-2"
            >
              <Overview d={data} />
              <Leaderboard d={data} />
              <Trending d={data} />
              <Releases d={data} />
              <Funding d={data} />
              <Partnerships d={data} />
              <Heatmap d={data} />
              <Analysis d={data} />
            </fm.div>
          )}
        </div>
      </main>
    </div>
  );
}
