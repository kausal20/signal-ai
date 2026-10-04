import type { ReactNode } from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { revealV } from "../motion";

interface Props {
  title: string;
  body?: string;
  actionLabel?: string;
  onAction?: () => void;
  actionTo?: string;
  /** Extra content under the action (e.g. a hint). */
  children?: ReactNode;
  className?: string;
}

const actionCls =
  "mt-5 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-ed-accent-ink underline decoration-ed-accent/40 underline-offset-4 transition-colors hover:decoration-ed-accent";

/** Intentional emptiness: a serif statement and one clear next step. No
 *  illustrations, no icon-in-a-circle. */
export function EmptyState({ title, body, actionLabel, onAction, actionTo, children, className }: Props) {
  return (
    <motion.div variants={revealV} initial="hidden" animate="show" className={cn("py-14 md:py-20", className)}>
      <h2 className="ed-serif max-w-[22ch] text-[28px] font-semibold leading-[1.15] tracking-[-0.015em] text-ed-text">{title}</h2>
      {body && <p className="mt-3 max-w-[40ch] text-[16px] leading-relaxed text-ed-text-2">{body}</p>}
      {actionLabel && actionTo && (
        <Link to={actionTo} className={actionCls}>
          {actionLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      )}
      {actionLabel && !actionTo && onAction && (
        <button type="button" onClick={onAction} className={actionCls}>
          {actionLabel} <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
      {children}
    </motion.div>
  );
}
