// signal-ui-v2 · advisor/AiOpportunityCard.tsx
// ---------------------------------------------------------------------------
// Minimal hero card: one opportunity, one metric, one CTA. Shares layoutId
// "opp-surface" with the detail overlay so "Explore" morphs the card into a
// full-screen page. Glass, soft neon glow, slow gradient drift, gentle float.
// ---------------------------------------------------------------------------
import { motion as fm, useReducedMotion } from "framer-motion";
import { Lightbulb, ArrowRight } from "lucide-react";
import type { Opportunity } from "@/data/opportunities";

const ENTRY = { type: "spring" as const, stiffness: 260, damping: 30, mass: 0.9 };

export function AiOpportunityCard({ opportunity, active, onOpen }: {
  opportunity: Opportunity; active: boolean; onOpen: () => void;
}) {
  const reduce = useReducedMotion();
  return (
    <fm.div
      animate={reduce || active ? undefined : { y: [0, -5, 0] }}
      transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }}
    >
      <fm.div
        layoutId={active ? undefined : "opp-surface"}
        transition={ENTRY}
        className="relative overflow-hidden rounded-[32px] p-[1.5px]"
      >
        {/* Gradient hairline border */}
        <div className="absolute inset-0 rounded-[32px] bg-[linear-gradient(135deg,hsl(152_72%_48%/0.5),hsl(152_72%_48%/0.06)_45%,hsl(0_0%_100%/0.05))]" />
        <div className="relative overflow-hidden rounded-[30px] bg-[#080b08]/95 p-6 backdrop-blur-xl">
          {!reduce && (
            <fm.div
              aria-hidden
              className="pointer-events-none absolute -right-12 -top-12 h-44 w-44 rounded-full bg-green/20 blur-3xl"
              animate={{ opacity: [0.35, 0.7, 0.35], scale: [0.9, 1.12, 0.9] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            />
          )}
          <div className="relative">
            <div className="mb-5 inline-flex items-center gap-1.5 rounded-full border border-green/20 bg-green/[0.08] px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] text-green">
              <Lightbulb className="h-3.5 w-3.5" /> AI Opportunity
            </div>

            <h3 className="text-[26px] font-extrabold leading-tight tracking-[-0.03em] text-foreground">
              {opportunity.name}
            </h3>
            <p className="mt-1 text-[13.5px] text-muted-foreground">{opportunity.tagline}</p>

            <div className="mt-6 flex items-end justify-between">
              <div>
                <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                  Opportunity Score
                </div>
                <div className="font-mono-tight text-[40px] font-extrabold leading-none text-green">{opportunity.score}</div>
              </div>
              <fm.button
                type="button"
                onClick={onOpen}
                whileHover={reduce ? undefined : { scale: 1.04 }}
                whileTap={reduce ? undefined : { scale: 0.96 }}
                transition={{ type: "spring", stiffness: 360, damping: 22 }}
                className="inline-flex h-11 items-center gap-1.5 rounded-full bg-green px-5 text-[14px] font-bold text-black shadow-[0_6px_22px_hsl(152_72%_48%/0.3)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-black"
              >
                Explore <ArrowRight className="h-4 w-4" />
              </fm.button>
            </div>
          </div>
        </div>
      </fm.div>
    </fm.div>
  );
}
