// signal-onboarding-ui · steps/WelcomeStep.tsx  (Step 1)
// Product-peek welcome: a single-column live feed rail behind a scrim,
// a radar-style logo with expanding pulse rings, headline, and CTA.
// Scroll animation is pure CSS (translateY on GPU). Zero JS per-frame cost.
import { ArrowRight, Sparkles } from "lucide-react";
import type { Signal } from "../shared/peek";
import { BRAND_LOGOS, type BrandLogoKey } from "@/lib/brandLogos";

/* Bundled real brand logos used by the atmospheric welcome feed. */
const LOGO_KEY: Record<string, BrandLogoKey> = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GOOGLE: "google",
  META: "meta",
  MISTRAL: "mistral",
  NVIDIA: "nvidia",
  RUNWAY: "runway",
  LANGCHAIN: "langchain",
  PERPLEXITY: "perplexity",
  "HUGGING FACE": "huggingface",
  GITHUB: "github",
  REDDIT: "reddit",
  APPLE: "apple",
  CURSOR: "cursor",
};

/** Tiny brand logo sourced from bundled SVG assets. */
function SourceLogo({ source }: { source: string }) {
  const key = LOGO_KEY[source.toUpperCase()];
  if (!key) return null;

  return (
    <img
      src={BRAND_LOGOS[key]}
      width={12}
      height={12}
      alt={source}
      className="shrink-0 opacity-90"
      style={{ width: 12, height: 12, objectFit: "contain" }}
    />
  );
}

interface Props {
  /** Optional preview signals scrolling behind the scrim. */
  peek?: Signal[];
  onGetStarted: () => void;
  onSignIn?: () => void;
}

const DEFAULT_PEEK: Signal[] = [
  { source: "OPENAI", tag: "MODELS", score: 98, title: "GPT-5 rolls out advanced reasoning to all Plus users" },
  { source: "ANTHROPIC", tag: "AGENTS", score: 96, title: "Claude gains computer-use for multi-step workflows" },
  { source: "GOOGLE", tag: "RESEARCH", score: 92, title: "Gemini 2.0 doubles context window to 4M tokens" },
  { source: "META", tag: "OPEN SOURCE", score: 89, title: "Llama 4 released under a permissive license" },
  { source: "MISTRAL", tag: "EFFICIENCY", score: 85, title: "New 3B model matches 70B on coding benchmarks" },
  { source: "NVIDIA", tag: "CHIPS", score: 94, title: "New inference stack cuts latency for enterprise AI apps" },
  { source: "RUNWAY", tag: "VIDEO", score: 91, title: "Video model update improves shot consistency and motion control" },
  { source: "LANGCHAIN", tag: "AGENTS", score: 88, title: "Agent observability tools add deeper workflow traces" },
  { source: "PERPLEXITY", tag: "SEARCH", score: 87, title: "AI search teams push toward answer engines for work" },
  { source: "HUGGING FACE", tag: "OPEN SOURCE", score: 84, title: "Community models climb the coding and reasoning boards" },
];

export function WelcomeStep({ peek = DEFAULT_PEEK, onGetStarted }: Props) {
  const feed = peek.length > 0 ? peek : DEFAULT_PEEK;
  const feedSequence = [...feed, ...feed, ...feed];
  const loop = [...feedSequence, ...feedSequence];

  return (
    <div className="relative h-full overflow-hidden bg-[#070707]">
      {/* ── Live feed peek ─────────────────────────────────────────────── */}
      {/* Full-screen feed rail, masked so it stays atmospheric behind copy. */}
      <div
        className="pointer-events-none absolute inset-0 overflow-hidden"
        style={{
          maskImage:
            "linear-gradient(to bottom, transparent 0%, #000 5%, #000 86%, transparent 100%)",
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, #000 5%, #000 86%, transparent 100%)",
        }}
      >
        <div
          className="welcome-feed-scroll absolute inset-x-0 -top-10 flex flex-col gap-3 px-[16px]"
          style={{
            opacity: 0.94,
            filter: "blur(0.05px)",
            willChange: "transform",
          }}
        >
          {loop.map((f, i) => (
            <div
              key={i}
              className="rounded-2xl border border-green/[0.16] bg-white/[0.058] px-[15px] py-3.5 shadow-[0_10px_34px_hsl(152_72%_48%/0.09)]"
            >
              {/* Eyebrow row */}
              <div className="mb-2 flex items-center gap-2">
                <SourceLogo source={f.source} />
                <span className="font-mono-tight text-[9px] font-bold tracking-[0.14em] text-green">
                  {f.source}
                </span>
                <span className="h-[3px] w-[3px] rounded-full bg-white/25" />
                <span className="text-[9px] font-bold tracking-[0.14em] text-muted-foreground">
                  {f.tag}
                </span>
                <span className="ml-auto font-mono-tight text-[10px] text-green">
                  {f.score}
                </span>
              </div>
              {/* Headline */}
              <div className="text-sm font-semibold leading-snug text-foreground/90">
                {f.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scrim gradient ─────────────────────────────────────────────── */}
      {/* Transparent at top → page bg by ~72% down                       */}
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.00)_0%,hsl(0_0%_3%/0.18)_34%,hsl(0_0%_3%/0.68)_54%,hsl(0_0%_3%/0.90)_76%,#070707_92%)]" />

      {/* ── Bottom content block ───────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 flex animate-fade-up flex-col items-start px-7 pb-[40px]">
        {/* Radar-style logo mark */}
        <div className="relative mb-5 flex h-[52px] w-[52px] items-center justify-center">
          {/* Expanding pulse ring 1 */}
          <span
            className="absolute inset-0 rounded-[14px] border border-green/30"
            style={{
              animation: "radarPulse 3s ease-out infinite",
            }}
          />
          {/* Expanding pulse ring 2 (half-cycle delay) */}
          <span
            className="absolute inset-0 rounded-[14px] border border-green/30"
            style={{
              animation: "radarPulse 3s ease-out 1.5s infinite",
            }}
          />
          {/* Badge */}
          <div
            className="relative z-10 flex h-[42px] w-[42px] items-center justify-center rounded-[12px] border border-green/25"
            style={{
              background:
                "radial-gradient(circle at 40% 35%, hsl(152 72% 54% / 0.28), hsl(152 72% 48% / 0.08) 55%, hsl(0 0% 5% / 0.92) 85%)",
              boxShadow: "0 8px 28px hsl(152 72% 48% / 0.18)",
            }}
          >
            <Sparkles
              aria-hidden
              className="h-[22px] w-[22px] text-green drop-shadow-[0_0_10px_hsl(152_72%_48%/0.45)]"
              strokeWidth={2.4}
            />
          </div>
        </div>

        {/* Eyebrow label */}
        <div className="mb-3.5 text-[10px] font-bold tracking-[0.24em] text-green">
          SIGNAL · AI INTELLIGENCE
        </div>

        {/* Headline */}
        <h1 className="mb-4 text-[34px] font-extrabold leading-[1.08] tracking-[-0.03em] text-foreground">
          Every breakthrough.<br />None of the noise.
        </h1>

        {/* Subheadline */}
        <p className="mb-7 max-w-[300px] text-sm leading-relaxed text-muted-foreground">
          Signal scans thousands of sources and surfaces only the AI moves that matter to you.
        </p>

        {/* CTA button */}
        <button
          type="button"
          onClick={onGetStarted}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green py-[17px] text-base font-bold text-black shadow-[0_8px_30px_hsl(152_72%_48%/0.3)] transition-transform active:scale-[0.98]"
        >
          Get Started <ArrowRight className="h-[17px] w-[17px]" />
        </button>

      </div>

      {/* ── Scoped keyframes (self-contained; no global CSS dependency) ──── */}
      <style>{`
        .welcome-feed-scroll {
          animation-name: welcomeFeedScroll !important;
          animation-duration: 65s !important;
          animation-timing-function: linear !important;
          animation-iteration-count: infinite !important;
          animation-fill-mode: none !important;
          animation-play-state: running !important;
          transform: translate3d(0, 0, 0);
        }
        @keyframes welcomeFeedScroll {
          from { transform: translate3d(0, 0, 0); }
          to   { transform: translate3d(0, -50%, 0); }
        }
        @keyframes radarPulse {
          0% {
            transform: scale(0.55);
            opacity: 0.55;
          }
          100% {
            transform: scale(1.9);
            opacity: 0;
          }
        }
      `}</style>
    </div>
  );
}
