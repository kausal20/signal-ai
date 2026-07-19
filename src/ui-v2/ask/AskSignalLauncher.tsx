// signal-ui-v2 · ask/AskSignalLauncher.tsx
// ---------------------------------------------------------------------------
// Ask Signal trigger — a compact header button (Advisor top-right ONLY, no
// global floating button). Opening slides the overlay up from the bottom;
// closing slides it back down (see AskSignalOverlay). Self-contained; owns the
// overlay. AnimatePresence keeps the sheet mounted long enough to play its
// exit animation.
// ---------------------------------------------------------------------------
import { useState } from "react";
import { AnimatePresence, motion as fm, useReducedMotion } from "framer-motion";
import { Brain } from "lucide-react";
import { AskSignalOverlay } from "./AskSignalOverlay";

interface Props {
  /** Show the label next to the icon (header pill) vs icon-only. */
  label?: boolean;
  className?: string;
}

export function AskSignalLauncher({ label = true, className }: Props) {
  const [open, setOpen] = useState(false);
  const reduce = useReducedMotion();

  return (
    <>
      <fm.button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ask Signal — AI Intelligence Assistant"
        aria-haspopup="dialog"
        aria-expanded={open}
        whileHover={reduce ? undefined : { scale: 1.04 }}
        whileTap={reduce ? undefined : { scale: 0.95 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        className={[
          "inline-flex items-center gap-1.5 rounded-full border border-green/30 bg-green/[0.10] text-green backdrop-blur-md",
          "shadow-[0_0_16px_hsl(152_72%_48%/0.18)] transition-colors hover:bg-green/[0.16]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          label ? "h-9 pl-2.5 pr-3.5 text-[12.5px] font-bold" : "h-9 w-9 justify-center",
          className ?? "",
        ].join(" ")}
      >
        <Brain className="h-4 w-4" />
        {label && <span>Ask Signal</span>}
      </fm.button>

      <AnimatePresence>
        {open && <AskSignalOverlay key="ask-signal-overlay" onClose={() => setOpen(false)} />}
      </AnimatePresence>
    </>
  );
}
