// signal-ui-v2 · components/RecommendationCard.tsx
import { Rocket, Bookmark } from "lucide-react";
import { cn } from "@/lib/utils";
import { SignalScoreRing } from "./SignalScoreRing";
import { SignalButton } from "./SignalButton";
import { SignalBadge } from "./SignalBadge";
import type { Recommendation } from "../shared/types";

interface Props {
  recommendation: Recommendation;
  /** Eyebrow above the title, e.g. "MY PICK FOR YOU TODAY". */
  eyebrow?: string;
  onStart?: (id: string) => void;
  onToggleSave?: (id: string) => void;
  /** Loading state for the CTA (e.g. while opening the resource). */
  starting?: boolean;
  className?: string;
}

/**
 * The Advisor / hero recommendation: an opinionated pick with a conviction ring
 * and a contextual CTA. The production app maps `type → ctaLabel/destination`
 * and passes them in; this component only presents them.
 */
export function RecommendationCard({
  recommendation,
  eyebrow = "My pick for you today",
  onStart,
  onToggleSave,
  starting,
  className,
}: Props) {
  const { id, title, reason, conviction, ctaLabel, saved } = recommendation;

  return (
    <div className={cn("green-halo relative overflow-hidden p-5", className)}>
      <div className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-green/[0.16] blur-[50px]" />

      <div className="relative mb-4">
        <SignalBadge tone="green" icon={<Rocket className="h-3 w-3" />}>{eyebrow}</SignalBadge>
      </div>

      <div className="relative flex items-start justify-between gap-4">
        <h2 className="flex-1 text-[27px] font-extrabold leading-[1.14] tracking-[-0.025em] text-foreground">
          {title}
        </h2>
        <SignalScoreRing score={conviction} size={62} caption="CONVICTION" className="shrink-0" />
      </div>

      {reason && (
        <p className="relative mt-4 text-[15px] leading-relaxed text-foreground/80">{reason}</p>
      )}

      <div className="relative mt-[18px] flex items-center gap-2">
        <SignalButton fullWidth size="lg" onClick={() => onStart?.(id)} disabled={starting}>
          {starting ? "Opening…" : ctaLabel}
        </SignalButton>
        <SignalButton
          variant="secondary"
          size="lg"
          aria-label={saved ? "Remove bookmark" : "Save"}
          onClick={() => onToggleSave?.(id)}
          className="w-[52px] px-0"
        >
          <Bookmark className={cn("h-[18px] w-[18px]", saved && "fill-green text-green animate-bookmark")} />
        </SignalButton>
      </div>
    </div>
  );
}
