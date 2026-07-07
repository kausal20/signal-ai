// signal-ui-v2 · components/ProfileCard.tsx
import { cn } from "@/lib/utils";
import { SignalScoreRing } from "./SignalScoreRing";
import { MetricChip } from "./MetricChip";
import type { UserProfile } from "../shared/types";

interface Stat {
  value: string;
  label: string;
}

interface Props {
  profile: UserProfile;
  /** Small stat chips, e.g. [{value:"124",label:"articles"}]. */
  stats?: Stat[];
  /** One-line status, e.g. "Signal knows you well". */
  confidenceLabel?: string;
  onEdit?: () => void;
  className?: string;
}

/**
 * AI-identity hero: avatar + name/role + a "how well Signal knows you"
 * confidence ring and learned-activity stat chips.
 */
export function ProfileCard({ profile, stats = [], confidenceLabel, onEdit, className }: Props) {
  const { name, role, level, initials, confidence } = profile;
  const monogram = initials ?? name.slice(0, 1).toUpperCase();

  return (
    <div className={cn("green-halo relative overflow-hidden p-[22px]", className)}>
      <div className="pointer-events-none absolute -right-12 -top-14 h-44 w-44 rounded-full bg-green/[0.14] blur-[50px]" />

      <div className="relative flex items-center gap-4">
        <div className="relative h-16 w-16 shrink-0">
          <div className="absolute -inset-1 rounded-full bg-green/[0.18] blur-[8px]" />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-full border border-green/[0.35] bg-green/[0.16] text-[26px] font-extrabold text-green">
            {monogram}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[21px] font-extrabold leading-tight tracking-[-0.02em] text-foreground">{name}</div>
          {(role || level) && (
            <div className="mt-0.5 text-[13px] text-muted-foreground">
              {[role, level].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
        {typeof confidence === "number" && (
          <SignalScoreRing score={confidence} size={52} caption="CONF" className="shrink-0" />
        )}
      </div>

      {confidenceLabel && (
        <div className="relative mt-[18px] flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.04] px-3.5 py-2.5">
          <span className="text-[12.5px] font-semibold text-foreground/85">{confidenceLabel}</span>
        </div>
      )}

      {stats.length > 0 && (
        <div className="relative mt-3.5 flex flex-wrap gap-2">
          {stats.map((s) => (
            <MetricChip key={s.label} value={s.value} label={s.label} />
          ))}
        </div>
      )}

      {onEdit && (
        <button
          type="button"
          onClick={onEdit}
          className="relative mt-[18px] h-[42px] w-full rounded-[13px] border border-white/10 bg-white/[0.06] text-[13.5px] font-bold text-foreground/90 transition-all active:scale-[0.98] hover:bg-white/[0.09]"
        >
          Edit profile
        </button>
      )}
    </div>
  );
}
