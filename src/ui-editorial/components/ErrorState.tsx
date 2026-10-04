import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { revealV } from "../motion";

interface Props {
  title: string;
  body?: string;
  onRetry?: () => void;
  retryLabel?: string;
  className?: string;
}

/** Human, actionable. Never shows a raw API error — the caller passes plain copy. */
export function ErrorState({ title, body = "Check your connection and try again.", onRetry, retryLabel = "Retry", className }: Props) {
  return (
    <motion.div variants={revealV} initial="hidden" animate="show" role="alert" className={cn("py-14 md:py-20", className)}>
      <h2 className="ed-serif max-w-[24ch] text-[28px] font-semibold leading-[1.15] tracking-[-0.015em] text-ed-text">{title}</h2>
      <p className="mt-3 max-w-[40ch] text-[16px] leading-relaxed text-ed-text-2">{body}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-6 inline-flex h-11 items-center rounded-lg border border-ed-border-strong bg-ed-surface px-5 text-[15px] font-semibold text-ed-text transition-colors hover:border-ed-text-3 active:bg-ed-sunken"
        >
          {retryLabel}
        </button>
      )}
    </motion.div>
  );
}
