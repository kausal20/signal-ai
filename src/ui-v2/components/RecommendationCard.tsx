// signal-ui-v2 · components/RecommendationCard.tsx
// ---------------------------------------------------------------------------
// "My Pick For You Today" — a personal AI intelligence briefing.
// Answers, in one glance: what happened · why it matters · why it matters to
// YOU · can I trust it · what to do next. Keeps the existing Signal design
// language (green-halo glass, floating/breathing motion, conviction ring,
// premium CTAs); this is an information-architecture upgrade, not a restyle.
// ---------------------------------------------------------------------------
import { Sparkles, Bookmark, Check, ShieldCheck, ArrowRight, MessageSquare } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { SignalButton } from "./SignalButton";
import { SignalBadge } from "./SignalBadge";
import { haptic } from "../animations/motion";
import type { Recommendation } from "../shared/types";

interface Props {
  recommendation: Recommendation;
  /** Eyebrow above the title, e.g. "MY PICK FOR YOU TODAY". */
  eyebrow?: string;
  onStart?: (id: string) => void;
  /** Opens the single Signal AI screen with this story's context. */
  onAsk?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  /** Loading state for the CTA (e.g. while opening the resource). */
  starting?: boolean;
  className?: string;
}

/**
 * The Advisor hero: an opinionated daily pick presented as an intelligence
 * briefing. All content (headline, summary, reasons, badge, trust signals) is
 * passed in already-derived from real backend intelligence; this component only
 * presents it.
 */
export function RecommendationCard({
  recommendation,
  eyebrow = "My pick for you today",
  onStart,
  onAsk,
  onToggleSave,
  starting,
  className,
}: Props) {
  const { id, title, summary, reasons, badge, trust, official, ctaLabel, saved } = recommendation;
  const reduce = useReducedMotion();

  return (
    <fm.div
      animate={reduce ? undefined : { y: [0, -3, 0] }}
      transition={reduce ? undefined : { duration: 7, repeat: Infinity, ease: "easeInOut" }}
      whileHover={reduce ? undefined : { y: -5, scale: 1.006 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      className={cn("green-halo relative overflow-hidden p-5", className)}
    >
      {/* Breathing ambient glow */}
      <fm.div
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-green/[0.16] blur-[50px]"
        animate={reduce ? undefined : { opacity: [0.5, 0.9, 0.5], scale: [0.95, 1.08, 0.95] }}
        transition={reduce ? undefined : { duration: 4.5, repeat: Infinity, ease: "easeInOut" }}
      />
      {/* Secondary glow — bottom left */}
      {!reduce && (
        <fm.div
          aria-hidden
          className="pointer-events-none absolute -bottom-10 -left-10 h-36 w-36 rounded-full bg-green/[0.08] blur-[40px]"
          animate={{ opacity: [0.3, 0.65, 0.3] }}
          transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut", delay: 1.5 }}
        />
      )}

      {/* SECTION 1 — Header: eyebrow + dynamic story badge */}
      <div className="relative mb-4 flex items-center justify-between gap-2">
        <SignalBadge tone="green" icon={<Sparkles className="h-3 w-3" />}>{eyebrow}</SignalBadge>
        {badge && (
          <SignalBadge tone={badge.tone} icon={official ? <ShieldCheck className="h-3 w-3" /> : undefined}>
            {badge.label}
          </SignalBadge>
        )}
      </div>

      {/* SECTION 2 — Headline */}
      <h2 className="relative text-[24px] font-extrabold leading-[1.16] tracking-[-0.025em] text-foreground">
        {title}
      </h2>

      {/* SECTION 3 — Executive summary (what happened) */}
      {summary && (
        <p className="relative mt-3.5 text-[14.5px] leading-relaxed text-foreground/75 line-clamp-3">
          {summary}
        </p>
      )}

      {/* SECTION 4 — Why this matters to YOU */}
      {reasons && reasons.length > 0 && (
        <div className="relative mt-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Why this matters to you
          </p>
          <ul className="mt-2.5 flex flex-col gap-2">
            {reasons.map((r, i) => (
              <li key={i} className="flex items-start gap-2.5 text-[13.5px] leading-snug text-foreground/85">
                <Check className="mt-[1px] h-4 w-4 shrink-0 text-green" strokeWidth={2.5} />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* SECTION 5 — Trust signals */}
      {trust && trust.length > 0 && (
        <div className="relative mt-5 flex flex-wrap items-center gap-x-2 gap-y-1.5">
          {trust.map((t, i) => (
            <span
              key={i}
              className="inline-flex items-center rounded-full border border-white/[0.08] bg-white/[0.04] px-2.5 py-1 text-[11px] font-semibold text-muted-foreground"
            >
              {t}
            </span>
          ))}
        </div>
      )}

      {/* SECTION 6 — Actions */}
      <div className="relative mt-[18px] flex flex-col gap-2">
        <SignalButton fullWidth size="lg" onClick={() => onStart?.(id)} disabled={starting}>
          {starting ? "Opening…" : (
            <span className="inline-flex items-center gap-2">{ctaLabel} <ArrowRight className="h-4 w-4 stroke-[2.5]" /></span>
          )}
        </SignalButton>
        <div className="flex items-center gap-2">
          {onAsk && (
            <SignalButton variant="secondary" size="lg" fullWidth onClick={() => { haptic(10); onAsk(id); }}>
              <span className="inline-flex items-center gap-2"><MessageSquare className="h-[17px] w-[17px]" /> Ask Signal AI</span>
            </SignalButton>
          )}
          <SignalButton
            variant="secondary"
            size="lg"
            aria-label={saved ? "Remove bookmark" : "Save"}
            onClick={() => { haptic(10); onToggleSave?.(id); }}
            className="w-[52px] px-0"
          >
            <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-green text-green animate-bookmark-enhanced")} />
          </SignalButton>
        </div>
      </div>
    </fm.div>
  );
}
