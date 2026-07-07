// signal-ui-v2 · components/ProjectCard.tsx
import { Zap } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Project } from "../shared/types";

interface Props {
  project: Project;
  onContinue?: (id: string) => void;
  className?: string;
}

/**
 * "Continue Building" card — progress framed as a story (yesterday → today →
 * tomorrow) with a streak. Presentation only; streak/progress come from props.
 */
export function ProjectCard({ project, onContinue, className }: Props) {
  const { id, title, yesterday, today, tomorrow, streakDays } = project;

  return (
    <div
      onClick={() => onContinue?.(id)}
      className={cn(
        "cursor-pointer rounded-[18px] border border-white/[0.06] bg-white/[0.028] p-[18px] transition-all hover:bg-white/[0.05] active:scale-[0.99]",
        className
      )}
    >
      <div className="mb-3.5 flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">{title}</span>
        {typeof streakDays === "number" && streakDays > 0 && (
          <span className="flex items-center gap-1.5 text-[11px] font-bold text-green">
            <Zap className="h-3.5 w-3.5 fill-green" />
            {streakDays}-day streak
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2.5">
        {yesterday && (
          <Row label="YESTERDAY" text={yesterday} muted />
        )}
        {today && (
          <Row label="TODAY" text={today} />
        )}
        {tomorrow && (
          <Row label="TOMORROW" text={tomorrow} muted />
        )}
      </div>
    </div>
  );
}

function Row({ label, text, muted }: { label: string; text: string; muted?: boolean }) {
  return (
    <div className="flex gap-3">
      <span
        className={cn(
          "w-[62px] shrink-0 pt-0.5 text-[10px] font-bold tracking-[0.1em]",
          muted ? "text-muted-foreground" : "text-green"
        )}
      >
        {label}
      </span>
      <span className={cn("text-[13.5px] leading-snug", muted ? "text-muted-foreground" : "font-semibold text-foreground")}>
        {text}
      </span>
    </div>
  );
}
