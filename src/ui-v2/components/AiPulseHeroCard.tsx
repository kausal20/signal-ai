// signal-ui-v2 · components/AiPulseHeroCard.tsx
// ---------------------------------------------------------------------------
// The "AI Pulse" hero card that lives inside the Advisor hero carousel. Glass +
// gradient border + green glow + subtle float. Tapping opens the AI Pulse page.
// Self-contained navigation so no prop plumbing is needed on AdvisorPage.
// ---------------------------------------------------------------------------
import { useNavigate } from "react-router-dom";
import { motion as fm, useReducedMotion } from "framer-motion";
import { TrendingUp, ArrowRight, Rocket, Handshake, Building2 } from "lucide-react";
import { SAMPLE_PULSE } from "@/data/aiPulse";

export function AiPulseHeroCard() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const leader = SAMPLE_PULSE.leader;

  const stats = [
    { icon: <Rocket className="h-3.5 w-3.5" />, label: `${leader.launches} launches` },
    { icon: <Handshake className="h-3.5 w-3.5" />, label: `${leader.partnerships} partnerships` },
    { icon: <Building2 className="h-3.5 w-3.5" />, label: `${leader.acquisitions} acquisition${leader.acquisitions === 1 ? "" : "s"}` },
  ];

  return (
    <fm.button
      type="button"
      onClick={() => navigate("/ai-pulse")}
      aria-label="Open AI Pulse — live industry intelligence"
      whileHover={reduce ? undefined : { y: -4, scale: 1.01 }}
      whileTap={reduce ? undefined : { scale: 0.98 }}
      animate={reduce ? undefined : { y: [0, -3, 0] }}
      transition={{
        y: { duration: 6.5, repeat: Infinity, ease: "easeInOut" },
        default: { type: "spring", stiffness: 320, damping: 24 },
      }}
      className="group relative w-full overflow-hidden rounded-[32px] p-[1.5px] text-left"
      style={{ background: "linear-gradient(135deg, hsl(152 72% 48% / 0.55), hsl(152 72% 48% / 0.08) 45%, hsl(0 0% 100% / 0.06))" }}
    >
      {/* Inner glass surface */}
      <div className="relative overflow-hidden rounded-[30px] bg-[#080b08]/95 p-6 backdrop-blur-xl">
        {/* Ambient green glow */}
        {!reduce && (
          <fm.div
            aria-hidden
            className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-green/20 blur-3xl"
            animate={{ opacity: [0.4, 0.75, 0.4], scale: [0.9, 1.1, 0.9] }}
            transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
          />
        )}

        <div className="relative">
          <div className="mb-1 flex items-center gap-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-green/25 bg-green/[0.12] text-green shadow-[0_0_16px_hsl(152_72%_48%/0.2)]">
              <TrendingUp className="h-[18px] w-[18px]" />
            </span>
            <div>
              <div className="text-[17px] font-extrabold tracking-[-0.02em] text-foreground">AI Pulse</div>
              <div className="text-[11.5px] font-medium text-muted-foreground">The AI industry at a glance</div>
            </div>
          </div>

          <p className="mt-3 text-[15px] font-bold text-foreground">
            <span className="text-green">{leader.company}</span> leads this week
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {stats.map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-foreground/80">
                <span className="text-green">{s.icon}</span>
                {s.label}
              </span>
            ))}
          </div>

          <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-bold text-green">
            Explore
            <fm.span
              aria-hidden
              animate={reduce ? undefined : { x: [0, 3, 0] }}
              transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }}
            >
              <ArrowRight className="h-4 w-4" />
            </fm.span>
          </span>
        </div>
      </div>
    </fm.button>
  );
}
