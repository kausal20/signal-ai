// signal-ui-v2 · ask/AskSignalLauncher.tsx
// ---------------------------------------------------------------------------
// Ask Signal trigger — a compact header button (Advisor top-right ONLY, no
// global floating button). Opening slides the overlay up from the bottom;
// closing slides it back down (see AskSignalOverlay). Self-contained; owns the
// overlay. AnimatePresence keeps the sheet mounted long enough to play its
// exit animation.
//
// This is the ONE Ask Signal surface in the app. Other screens (e.g. the Top
// Story card) navigate here with `state: { openAsk: true, article }`, which
// auto-opens THIS overlay pre-loaded with that article's context — so there is
// never a second, different-looking Ask Signal page.
// ---------------------------------------------------------------------------
import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion as fm, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { AskSignalOverlay } from "./AskSignalOverlay";
import type { ArticleContext } from "@/lib/askSignal";

interface Props {
  /** Show the label next to the icon (header pill) vs icon-only. */
  label?: boolean;
  className?: string;
}

export function AskSignalLauncher({ label = true, className }: Props) {
  const [open, setOpen] = useState(false);
  const [context, setContext] = useState<ArticleContext | undefined>(undefined);
  const reduce = useReducedMotion();
  const location = useLocation();
  const navigate = useNavigate();

  // Arrived from a story ("Ask Signal" on the Top Story card): open this same
  // overlay with the article context, then clear the route state so a back or
  // refresh doesn't re-open it.
  useEffect(() => {
    const state = location.state as { openAsk?: boolean; article?: ArticleContext } | null;
    if (!state?.openAsk) return;
    setContext(state.article);
    setOpen(true);
    navigate(location.pathname, { replace: true, state: null });
  }, [location.state, location.pathname, navigate]);

  const close = () => { setOpen(false); setContext(undefined); };

  return (
    <>
      <fm.button
        type="button"
        onClick={() => { setContext(undefined); setOpen(true); }}
        aria-label="Signal AI — your AI intelligence assistant"
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
        <Sparkles className="h-4 w-4" />
        {label && <span>Signal AI</span>}
      </fm.button>

      <AnimatePresence>
        {open && <AskSignalOverlay key="ask-signal-overlay" onClose={close} context={context} />}
      </AnimatePresence>
    </>
  );
}
