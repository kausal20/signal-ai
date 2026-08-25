// signal-ui-v2 · components/NewsIntelligenceSheet.tsx
// ---------------------------------------------------------------------------
// "Signal Analysis" — the flagship premium bottom sheet. Slides up (spring),
// dark glass + backdrop blur, ~85% height, 32px top radius, drag / swipe /
// backdrop / Escape to close, focus trap. Renders a STRUCTURED editorial
// analysis (executive summary, why-it-matters split, who wins/loses, market
// impact, key takeaways, timeline, related companies) with a sticky Ask Signal
// action. Sections stagger in. Presentation only.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion as fm, useReducedMotion, type Variants } from "framer-motion";
import { Brain, X, RefreshCw, AlertTriangle, ArrowRight } from "lucide-react";
import { motionTokens } from "../animations/motion";
import { BrandLogo } from "../icons/BrandLogo";
import { ReadOriginalButton, VerifiedBadge, isSafeUrl, openOriginal } from "./SourceAttribution";
import type { Intelligence } from "@/hooks/useNewsIntelligence";
import type { SourceKey } from "../shared/types";

type Status = "idle" | "loading" | "ready" | "error";

interface Props {
  open: boolean;
  onClose: () => void;
  onRetry: () => void;
  status: Status;
  data: Intelligence | null;
  error: string | null;
  /** Generation phases still in flight — drives per-section skeletons. */
  pending?: Set<"core" | "deep">;
  articleTitle: string;
  source?: { name?: string; sourceKey?: SourceKey; url?: string; verified?: boolean };
}

const EASE = motionTokens.ease.premium;
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } } };
const rise: Variants = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE } } };

// Search a company (chip tap) / open Ask Signal — decoupled via window events
// so the sheet stays self-contained wherever it is dropped in.
function dispatchSearch(term: string) {
  window.dispatchEvent(new CustomEvent("signal:search", { detail: term }));
}
function dispatchAsk(title: string) {
  window.dispatchEvent(new CustomEvent("signal:ask", { detail: title }));
}

// ── Section shell with emoji label + animated divider ──────────────────────
function Section({ emoji, title, children }: { emoji: string; title: string; children: React.ReactNode }) {
  return (
    <fm.section variants={rise}>
      <div className="mb-2.5 flex items-center gap-2">
        <span className="text-[15px]" aria-hidden>{emoji}</span>
        <h3 className="text-[12.5px] font-bold uppercase tracking-[0.08em] text-foreground/90">{title}</h3>
        <fm.span
          aria-hidden
          className="ml-1 h-px flex-1 origin-left bg-gradient-to-r from-white/[0.12] to-transparent"
          initial={{ scaleX: 0 }}
          animate={{ scaleX: 1 }}
          transition={{ duration: 0.4, ease: EASE, delay: 0.1 }}
        />
      </div>
      {children}
    </fm.section>
  );
}

function ChipRow({ items, tone, reduce, onTap }: {
  items: string[]; tone: "win" | "lose" | "neutral"; reduce: boolean; onTap?: (v: string) => void;
}) {
  const cls = tone === "win"
    ? "border-green/40 bg-green/[0.12] text-green"
    : tone === "lose"
      ? "border-red-500/30 bg-red-500/[0.08] text-red-300"
      : "border-white/[0.10] bg-white/[0.04] text-foreground/80 hover:border-green/25 hover:text-green";
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((v) => {
        const Tag = onTap ? fm.button : fm.span;
        return (
          <Tag
            key={v}
            {...(onTap ? { type: "button" as const, onClick: () => onTap(v) } : {})}
            variants={reduce ? undefined : rise}
            whileHover={reduce ? undefined : { scale: 1.05, y: -1 }}
            whileTap={onTap && !reduce ? { scale: 0.95 } : undefined}
            transition={{ type: "spring", stiffness: 360, damping: 22 }}
            className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-[12px] font-semibold ${cls}`}
          >
            {v}{onTap && <ArrowRight className="h-3 w-3 opacity-60" />}
          </Tag>
        );
      })}
    </div>
  );
}

// ── Per-section shimmer (never one big spinner) ────────────────────────────
function LineSkeleton({ lines = 3 }: { lines?: number }) {
  const widths = ["92%", "78%", "64%", "85%", "70%"];
  return (
    <div className="flex flex-col gap-2" aria-hidden>
      {Array.from({ length: lines }).map((_, i) => (
        <div key={i} className="motion-wave-shimmer h-3 rounded" style={{ width: widths[i % widths.length] }} />
      ))}
    </div>
  );
}
function CardSkeleton({ count = 2 }: { count?: number }) {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5">
          <div className="motion-wave-shimmer mb-2 h-3 w-24 rounded" />
          <div className="motion-wave-shimmer h-3 w-[85%] rounded" />
        </div>
      ))}
    </div>
  );
}

// ── "Signal AI is analyzing…" with rotating, animated steps ────────────────
const ANALYZING_STEPS = [
  "Comparing related articles",
  "Checking official sources",
  "Finding historical context",
  "Evaluating market impact",
];
function AnalyzingStrip({ reduce, slow }: { reduce: boolean; slow: boolean }) {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => (s + 1) % ANALYZING_STEPS.length), 1600);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="rounded-2xl border border-green/15 bg-green/[0.05] px-4 py-3">
      <div className="flex items-center gap-2">
        <span className="h-2 w-2 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-green" />
        <span className="text-[12.5px] font-semibold text-foreground/90">
          {slow ? "Still analyzing this story…" : "Signal AI is analyzing this story…"}
        </span>
      </div>
      <div className="mt-1.5 h-4 overflow-hidden pl-4">
        <AnimatePresence mode="wait" initial={false}>
          <fm.p
            key={step}
            initial={reduce ? undefined : { opacity: 0, y: 8 }}
            animate={reduce ? undefined : { opacity: 1, y: 0 }}
            exit={reduce ? undefined : { opacity: 0, y: -8 }}
            transition={{ duration: 0.2, ease: EASE }}
            className="text-[11.5px] text-muted-foreground"
          >
            • {ANALYZING_STEPS[step]}
          </fm.p>
        </AnimatePresence>
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <fm.div variants={stagger} initial="hidden" animate="show" className="flex flex-col gap-4" role="status" aria-label="Generating analysis">
      <fm.div variants={rise} className="flex items-center gap-2">
        <span className="h-2 w-2 animate-[pulse-dot_1.2s_ease-in-out_infinite] rounded-full bg-green" />
        <span className="text-[12.5px] font-medium text-muted-foreground">Signal AI is analyzing the story…</span>
      </fm.div>
      {[0, 1, 2, 3].map((i) => (
        <fm.div key={i} variants={rise} className="rounded-2xl border border-white/[0.05] bg-white/[0.02] p-4">
          <div className="motion-wave-shimmer mb-3 h-3.5 w-28 rounded" />
          <div className="motion-wave-shimmer mb-2 h-3 w-[92%] rounded" />
          <div className="motion-wave-shimmer h-3 w-[68%] rounded" />
        </fm.div>
      ))}
    </fm.div>
  );
}

export function NewsIntelligenceSheet({ open, onClose, onRetry, status, data, error, pending, articleTitle, source }: Props) {
  const reduce = useReducedMotion();
  const sheetRef = useRef<HTMLDivElement>(null);
  const prevFocus = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) return;
    prevFocus.current = document.activeElement as HTMLElement | null;
    const el = sheetRef.current;
    requestAnimationFrame(() => el?.focus());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab" || !el) return;
      const f = el.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prevFocus.current?.focus?.(); };
  }, [open, onClose]);

  const wm = data?.why_matters;
  const whyBullets = wm && (wm.business || wm.technology || wm.market)
    ? [
        wm.business ? { label: "Business", text: wm.business } : null,
        wm.technology ? { label: "Technology", text: wm.technology } : null,
        wm.market ? { label: "Market", text: wm.market } : null,
      ].filter(Boolean) as { label: string; text: string }[]
    : [];
  const relatedCompanies = data?.related_companies?.length ? data.related_companies : (data?.related_topics ?? []);

  // Per-phase loading → per-section skeletons (never one blocking spinner).
  const corePending = pending ? pending.has("core") : status === "loading";
  const deepPending = pending ? pending.has("deep") : status === "loading";
  const anyPending = corePending || deepPending;

  // After 10s switch the copy to "Still analyzing…" — never freeze the UI.
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!open || !anyPending) { setSlow(false); return; }
    const id = setTimeout(() => setSlow(true), 10_000);
    return () => clearTimeout(id);
  }, [open, anyPending]);
  const timeline = data?.timeline;

  return (
    <AnimatePresence>
      {open && (
        <fm.div
          key="ai-backdrop"
          className="fixed inset-0 z-[90] flex items-end justify-center bg-black/65 backdrop-blur-md"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
        >
          <fm.div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-sheet-title"
            tabIndex={-1}
            onClick={(e) => e.stopPropagation()}
            initial={reduce ? { y: 0 } : { y: "100%" }}
            animate={{ y: 0 }}
            exit={reduce ? { y: 0, opacity: 0 } : { y: "100%" }}
            transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 300, damping: 32, mass: 0.9 }}
            drag={reduce ? false : "y"}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => { if (info.offset.y > 130 || info.velocity.y > 650) onClose(); }}
            className="flex h-[85vh] w-full max-w-[480px] flex-col rounded-t-[32px] border border-b-0 border-white/[0.08] bg-[#080b08]/95 shadow-[0_-30px_80px_hsl(0_0%_0%/0.7)] outline-none backdrop-blur-2xl"
          >
            {/* Grab handle */}
            <div className="flex shrink-0 cursor-grab justify-center pt-3 active:cursor-grabbing">
              <span aria-hidden className="h-1.5 w-11 rounded-full bg-white/15" />
            </div>

            {/* Header */}
            <div className="flex shrink-0 items-center gap-3 px-5 pb-3.5 pt-3">
              <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-green/25 bg-green/[0.10] text-green shadow-[0_0_18px_hsl(152_72%_48%/0.2)]">
                <Brain className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <h2 id="ai-sheet-title" className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">Signal Analysis</h2>
                <p className="text-[11.5px] font-medium text-muted-foreground">Grounded editorial intelligence</p>
              </div>
              {data && (
                <span className="mr-1 inline-flex items-center gap-1 rounded-full border border-green/25 bg-green/[0.10] px-2.5 py-1 text-[11px] font-bold text-green">
                  Impact {data.impact_score ?? data.importance_score}
                </span>
              )}
              <button
                type="button"
                aria-label="Close Signal Analysis"
                onClick={onClose}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-muted-foreground transition-colors hover:bg-white/[0.12] hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Article context + source attribution */}
            {status !== "error" && (
              <div className="mx-5 mb-1 shrink-0 rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2.5">
                <div className="flex items-center gap-2">
                  {data?.event_type && (
                    <span className="shrink-0 rounded-full border border-green/25 bg-green/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-green">
                      {data.event_type}
                    </span>
                  )}
                  <p className="line-clamp-1 text-[12px] font-semibold text-foreground/75">{articleTitle}</p>
                </div>
                {source?.name && (
                  <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-muted-foreground/60">Source</span>
                    {source.sourceKey && (
                      <span className="flex h-4 w-4 items-center justify-center rounded bg-white/[0.06]">
                        <BrandLogo source={source.sourceKey} name={source.name} size={11} />
                      </span>
                    )}
                    <span className="text-[11.5px] font-bold text-foreground">{source.name}</span>
                    {source.verified && <VerifiedBadge />}
                    {isSafeUrl(source.url) && (
                      <ReadOriginalButton url={source.url} className="ml-auto h-7 px-2.5 text-[11.5px]" />
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Body */}
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
              {status === "error" ? (
                <div className="flex h-full flex-col items-center justify-center px-2 text-center">
                  <fm.div
                    initial={reduce ? undefined : { scale: 0.7, opacity: 0 }}
                    animate={reduce ? undefined : { scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 260, damping: 18 }}
                    className="mb-5 flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/[0.06] bg-white/[0.03] text-muted-foreground"
                  >
                    <AlertTriangle className="h-9 w-9" />
                  </fm.div>
                  <h3 className="text-[16px] font-bold text-foreground">Signal Analysis unavailable</h3>
                  <p className="mt-1.5 max-w-[300px] text-[13px] leading-relaxed text-muted-foreground">
                    Unable to generate analysis right now.
                  </p>
                  <div className="mt-5 flex items-center gap-2.5">
                    <fm.button
                      type="button"
                      onClick={onRetry}
                      whileTap={reduce ? undefined : { scale: 0.96 }}
                      className="inline-flex items-center gap-2 rounded-full bg-green px-5 py-2.5 text-[13px] font-bold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-black"
                    >
                      <RefreshCw className="h-4 w-4" /> Retry
                    </fm.button>
                    <fm.button
                      type="button"
                      onClick={onClose}
                      whileTap={reduce ? undefined : { scale: 0.96 }}
                      className="rounded-full border border-white/[0.10] bg-white/[0.04] px-5 py-2.5 text-[13px] font-bold text-foreground hover:bg-white/[0.08] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
                    >
                      Close
                    </fm.button>
                  </div>
                  {error && <p className="mt-4 max-w-[300px] text-[11px] text-muted-foreground/50">{error}</p>}
                </div>
              ) : (
                <fm.div variants={reduce ? undefined : stagger} initial={reduce ? undefined : "hidden"} animate={reduce ? undefined : "show"} className="flex flex-col gap-5 pb-4">
                  {/* Live progress — replaces the old blocking spinner */}
                  {anyPending && <AnalyzingStrip reduce={!!reduce} slow={slow} />}

                  {/* 1 · Executive Summary */}
                  <Section emoji="📄" title="Executive Summary">
                    {(data?.executive_summary || data?.summary)
                      ? <p className="text-[13.5px] leading-relaxed text-foreground/85">{data.executive_summary || data.summary}</p>
                      : <LineSkeleton lines={4} />}
                  </Section>

                  {/* 2 · Why This Matters (business / technology / market) */}
                  <Section emoji="💡" title="Why This Matters">
                    {corePending && whyBullets.length === 0 ? (
                      <CardSkeleton count={3} />
                    ) : whyBullets.length > 0 ? (
                      <div className="flex flex-col gap-2.5">
                        {whyBullets.map((b) => (
                          <fm.div
                            key={b.label}
                            variants={reduce ? undefined : rise}
                            className="rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5"
                          >
                            <span className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-green">{b.label}</span>
                            <p className="mt-1 text-[13px] leading-snug text-foreground/85">{b.text}</p>
                          </fm.div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[13.5px] leading-relaxed text-foreground/85">{data?.why_it_matters}</p>
                    )}
                  </Section>

                  {/* 3 · Should You Care? (per-audience star relevance) */}
                  {((data?.relevance?.length ?? 0) > 0 || corePending) && (
                    <Section emoji="⭐" title="Should You Care?">
                      {(data?.relevance?.length ?? 0) === 0 ? <CardSkeleton count={3} /> : (
                      <div className="flex flex-col gap-1.5">
                        {data!.relevance!.map((r) => (
                          <fm.div key={r.audience} variants={reduce ? undefined : rise} className="flex items-center justify-between rounded-xl border border-white/[0.05] bg-white/[0.02] px-3 py-2">
                            <span className="text-[12.5px] font-medium text-foreground/85">{r.audience}</span>
                            <span className="flex gap-0.5" aria-label={`${r.stars} of 5 stars`}>
                              {[1, 2, 3, 4, 5].map((n) => (
                                <span key={n} className={`text-[13px] leading-none ${n <= r.stars ? "text-green" : "text-white/15"}`}>★</span>
                              ))}
                            </span>
                          </fm.div>
                        ))}
                      </div>
                      )}
                    </Section>
                  )}

                  {/* 4 · Who Wins */}
                  {((data?.who_wins?.length ?? 0) > 0 || deepPending) && (
                    <Section emoji="🏆" title="Who Wins">
                      {(data?.who_wins?.length ?? 0) === 0 ? <LineSkeleton lines={1} />
                        : <ChipRow items={data!.who_wins!} tone="win" reduce={!!reduce} />}
                    </Section>
                  )}

                  {/* 4 · Who Loses */}
                  {((data?.who_loses?.length ?? 0) > 0 || deepPending) && (
                    <Section emoji="⚠️" title="Who Loses">
                      {(data?.who_loses?.length ?? 0) === 0 ? <LineSkeleton lines={1} />
                        : <ChipRow items={data!.who_loses!} tone="lose" reduce={!!reduce} />}
                    </Section>
                  )}

                  {/* 5 · Market Impact */}
                  {(data?.market_impact || deepPending) && (
                    <Section emoji="📊" title="Market Impact">
                      {data?.market_impact
                        ? <p className="text-[13.5px] leading-relaxed text-foreground/85">{data.market_impact}</p>
                        : <LineSkeleton lines={3} />}
                    </Section>
                  )}

                  {/* 6 · Technology Breakdown */}
                  {((data?.technology_breakdown?.length ?? 0) > 0 || deepPending) && (
                    <Section emoji="⚙️" title="Technology Breakdown">
                      {(data?.technology_breakdown?.length ?? 0) === 0 ? <LineSkeleton lines={3} /> : (
                      <ul className="flex flex-col gap-2">
                        {data!.technology_breakdown!.map((t, i) => (
                          <fm.li key={i} variants={reduce ? undefined : rise} className="flex items-start gap-2.5 text-[13px] leading-snug text-foreground/85">
                            <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-green/70" />{t}
                          </fm.li>
                        ))}
                      </ul>
                      )}
                    </Section>
                  )}

                  {/* 6 · Key Takeaways */}
                  {((data?.key_takeaways?.length ?? 0) > 0 || deepPending) && (
                    <Section emoji="📌" title="Key Takeaways">
                      {(data?.key_takeaways?.length ?? 0) === 0 ? <CardSkeleton count={3} /> : (
                      <fm.div variants={reduce ? undefined : stagger} initial={reduce ? undefined : "hidden"} animate={reduce ? undefined : "show"} className="flex flex-col gap-2.5">
                        {data!.key_takeaways.slice(0, 5).map((k, i) => (
                          <fm.div
                            key={i}
                            variants={reduce ? undefined : rise}
                            whileHover={reduce ? undefined : { y: -2, borderColor: "hsl(152 72% 48% / 0.3)" }}
                            transition={{ type: "spring", stiffness: 320, damping: 24 }}
                            className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3.5"
                          >
                            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-green/[0.14] font-mono-tight text-[12px] font-bold text-green">
                              {i + 1}
                            </span>
                            <span className="text-[13px] leading-snug text-foreground/85">{k}</span>
                          </fm.div>
                        ))}
                      </fm.div>
                      )}
                    </Section>
                  )}

                  {/* 7 · Timeline (past / present / next) */}
                  {((timeline && (timeline.past || timeline.present || timeline.next)) || deepPending) && (
                    <Section emoji="🗓" title="Timeline">
                      {!timeline || !(timeline.past || timeline.present || timeline.next) ? <LineSkeleton lines={3} /> : (
                      <div className="flex flex-col gap-2.5">
                        {[
                          { k: "Past", v: timeline.past, dot: "bg-white/25" },
                          { k: "Now", v: timeline.present, dot: "bg-green" },
                          { k: "Next", v: timeline.next, dot: "bg-green/50" },
                        ].filter((r) => r.v).map((r) => (
                          <fm.div key={r.k} variants={reduce ? undefined : rise} className="flex items-start gap-3">
                            <span className="mt-1.5 flex flex-col items-center">
                              <span className={`h-2 w-2 rounded-full ${r.dot}`} />
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className="text-[10.5px] font-bold uppercase tracking-[0.10em] text-muted-foreground">{r.k}</span>
                              <p className="text-[13px] leading-snug text-foreground/85">{r.v}</p>
                            </div>
                          </fm.div>
                        ))}
                      </div>
                      )}
                    </Section>
                  )}

                  {/* 9 · Related Companies (tap → search) */}
                  {(relatedCompanies.length > 0 || deepPending) && (
                    <Section emoji="🏢" title="Related Companies">
                      {relatedCompanies.length === 0 ? <LineSkeleton lines={1} /> : (
                        <ChipRow
                          items={relatedCompanies}
                          tone="neutral"
                          reduce={!!reduce}
                          onTap={(c) => { dispatchSearch(c); onClose(); }}
                        />
                      )}
                    </Section>
                  )}

                  {/* 10 · Related Stories (arrive first — no AI needed) */}
                  {((data?.related_stories?.length ?? 0) > 0 || anyPending) && (
                    <Section emoji="📰" title="Related Stories">
                      {(data?.related_stories?.length ?? 0) === 0 ? <CardSkeleton count={3} /> : (
                      <div className="flex flex-col gap-2">
                        {data!.related_stories!.slice(0, 5).map((s, i) => {
                          const safe = isSafeUrl(s.url);
                          const inner = (
                            <>
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[11px]">📄</span>
                              <div className="min-w-0 flex-1">
                                <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground/90">{s.title}</p>
                                {s.publisher && <p className="mt-1 text-[11px] text-muted-foreground">{s.publisher}</p>}
                                {!safe && <p className="mt-1 text-[10.5px] font-medium text-muted-foreground/50">Original source unavailable</p>}
                              </div>
                            </>
                          );
                          // Clickable only when there's a real article URL; otherwise a
                          // static row — never a row that silently fails on tap.
                          return safe ? (
                            <fm.button
                              key={i}
                              type="button"
                              variants={reduce ? undefined : rise}
                              onClick={() => openOriginal(s.url)}
                              whileHover={reduce ? undefined : { y: -2, borderColor: "hsl(152 72% 48% / 0.3)" }}
                              transition={{ type: "spring", stiffness: 320, damping: 24 }}
                              className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left"
                            >
                              {inner}
                            </fm.button>
                          ) : (
                            <fm.div
                              key={i}
                              variants={reduce ? undefined : rise}
                              className="flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 text-left opacity-70"
                            >
                              {inner}
                            </fm.div>
                          );
                        })}
                      </div>
                      )}
                    </Section>
                  )}
                </fm.div>
              )}
            </div>

            {/* Sticky · Ask Signal — available as soon as the sheet has content */}
            {status !== "error" && (
              <div className="shrink-0 border-t border-white/[0.06] bg-[#080b08]/95 px-5 py-3 backdrop-blur-2xl">
                <fm.button
                  type="button"
                  onClick={() => { dispatchAsk(articleTitle); onClose(); }}
                  whileHover={reduce ? undefined : { scale: 1.01 }}
                  whileTap={reduce ? undefined : { scale: 0.98 }}
                  transition={{ type: "spring", stiffness: 340, damping: 24 }}
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-green text-[14px] font-bold text-black shadow-[0_6px_22px_hsl(152_72%_48%/0.28)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-[#080b08]"
                >
                  <Brain className="h-4 w-4" /> Ask Signal about this story
                </fm.button>
              </div>
            )}
          </fm.div>
        </fm.div>
      )}
    </AnimatePresence>
  );
}
