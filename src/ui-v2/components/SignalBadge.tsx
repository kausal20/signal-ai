// signal-ui-v2 · components/SignalBadge.tsx
import { cn } from "@/lib/utils";

type Tone = "green" | "amber" | "red" | "neutral" | "news" | "prompt" | "usecase";

interface Props {
  children: React.ReactNode;
  tone?: Tone;
  icon?: React.ReactNode;
  className?: string;
  uppercase?: boolean;
}

const TONES: Record<Tone, string> = {
  green: "bg-green/10 text-green border-green/20",
  amber: "bg-[hsl(38_92%_55%/0.1)] text-[hsl(38_92%_60%)] border-[hsl(38_92%_55%/0.2)]",
  red: "bg-[hsl(0_55%_50%/0.1)] text-[hsl(0_75%_66%)] border-[hsl(0_55%_50%/0.22)]",
  neutral: "bg-white/[0.05] text-muted-foreground border-white/[0.08]",
  news: "bg-[hsl(200_70%_50%/0.1)] text-[hsl(200_70%_60%)] border-[hsl(200_70%_50%/0.15)]",
  prompt: "bg-[hsl(38_92%_55%/0.1)] text-[hsl(38_92%_55%)] border-[hsl(38_92%_55%/0.15)]",
  usecase: "bg-[hsl(280_60%_55%/0.1)] text-[hsl(280_60%_65%)] border-[hsl(280_60%_55%/0.15)]",
};

/** Small status / tag pill. Prefer this over ad-hoc spans for consistency. */
export function SignalBadge({ children, tone = "green", icon, className, uppercase = true }: Props) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold tracking-wider",
        uppercase && "uppercase",
        TONES[tone],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
}
