import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { press } from "../motion";

interface Props {
  label: string;
  description?: string;
  /** Quiet current value shown on the right (e.g. "Light"). */
  value?: string;
  /** A control rendered on the right (switch, segmented…). */
  control?: ReactNode;
  onClick?: () => void;
  danger?: boolean;
  /** Stack the control under the label (for wide controls on small screens). */
  stacked?: boolean;
}

/** One settings line. Either a tappable row (onClick) or a row hosting a control. */
export function ProfileRow({ label, description, value, control, onClick, danger, stacked }: Props) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className={cn("text-[16px] font-medium leading-snug", danger ? "text-ed-negative" : "text-ed-text")}>{label}</p>
        {description && <p className="mt-0.5 max-w-[52ch] text-[13.5px] leading-snug text-ed-text-2">{description}</p>}
      </div>
      {value && <span className="shrink-0 text-[14.5px] text-ed-text-2">{value}</span>}
      {control && !stacked && <div className="shrink-0">{control}</div>}
      {onClick && <ChevronRight className="h-4 w-4 shrink-0 text-ed-text-3" aria-hidden="true" />}
    </>
  );

  return (
    <li className="border-b border-ed-border">
      {onClick ? (
        <motion.button {...press} type="button" onClick={onClick} className="flex min-h-[60px] w-full items-center gap-3 py-3 text-left transition-colors active:bg-ed-sunken">
          {body}
        </motion.button>
      ) : (
        <div className={cn("flex min-h-[60px] gap-3 py-3", stacked ? "flex-col" : "items-center")}>
          {body}
          {control && stacked && <div>{control}</div>}
        </div>
      )}
    </li>
  );
}
