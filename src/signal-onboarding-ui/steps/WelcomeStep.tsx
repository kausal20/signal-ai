// signal-onboarding-ui · steps/WelcomeStep.tsx  (Step 1)
// Product-peek welcome: a single-column live feed rail behind a scrim,
// a radar-style logo with expanding pulse rings, headline, and CTA.
// Scroll animation is pure CSS (translateY on GPU). Zero JS per-frame cost.
import { ArrowRight } from "lucide-react";
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
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-white p-1">
      <img
        src={BRAND_LOGOS[key]}
        width={18}
        height={18}
        alt={`${source} logo`}
        className="h-[18px] w-[18px] object-contain brightness-0"
      />
    </span>
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
    <div className="relative h-full overflow-hidden bg-ed-bg">
      {/* ── Live feed peek ─────────────────────────────────────────────── */}
      {/* Full-screen feed rail, masked so it stays atmospheric behind copy. */}
      <div
        aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden"
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
            willChange: "transform",
          }}
        >
          {loop.map((f, i) => (
            <div
              key={i}
              className="rounded-2xl border border-ed-accent bg-ed-surface px-[15px] py-3.5 "
            >
              {/* Eyebrow row */}
              <div className="mb-2 flex items-center gap-2">
                <SourceLogo source={f.source} />
                <span className="ed-numeral text-[9px] font-bold tracking-[0.14em] text-ed-accent-ink">
                  {f.source}
                </span>
                <span className="h-[3px] w-[3px] rounded-full bg-ed-surface" />
                <span className="text-[9px] font-bold tracking-[0.14em] text-ed-text-2">
                  {f.tag}
                </span>
                <span className="ml-auto ed-numeral text-[10px] text-ed-accent-ink">
                  {f.score}
                </span>
              </div>
              {/* Headline */}
              <div className="text-sm font-semibold leading-snug text-ed-text">
                {f.title}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Bottom content block ───────────────────────────────────────── */}
      <div className="absolute inset-x-0 bottom-0 flex animate-fade-up flex-col items-start bg-ed-bg px-7 pb-[40px] pt-2">
        <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-12 h-12 bg-gradient-to-b from-transparent to-ed-bg" />
        {/* Headline */}
        <h1 className="ed-serif mb-4 text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] text-ed-text">
          <span className="text-ed-accent-ink">AI</span> intelligence.<br />Zero noise.
        </h1>

        {/* Subheadline */}
        <p className="mb-7 max-w-[300px] text-sm leading-relaxed text-ed-text-2">
          Signal scans thousands of sources and surfaces only the AI moves that matter to you.
        </p>

        {/* CTA button */}
        <button
          type="button"
          onClick={onGetStarted}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-ed-accent-ink py-[17px] text-base font-bold text-ed-on-accent  transition-transform active:scale-[0.98]"
        >
          Get Started <ArrowRight className="h-[17px] w-[17px]" />
        </button>

      </div>

      {/* ── Scoped keyframes (self-contained; no global CSS dependency) ──── */}
      <style>{`
        .ed-onboarding .welcome-feed-scroll {
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
          to   { transform: translate3d(0, calc(-50% - 6px), 0); }
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
