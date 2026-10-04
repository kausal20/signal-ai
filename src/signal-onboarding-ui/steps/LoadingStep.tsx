import { useEffect, useRef, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { SignalGlyph } from "@/ui-editorial/components/SignalMark";
import { EASE } from "@/ui-editorial/motion";

const PHASES = ["Bringing your interests together", "Personalizing your feed", "Preparing your AI briefing"];

interface Props {
  onComplete: () => void;
}

export function LoadingStep({ onComplete }: Props) {
  const [phase, setPhase] = useState(0);
  const reduce = useReducedMotion();
  const complete = useRef(onComplete);
  useEffect(() => { complete.current = onComplete; }, [onComplete]);
  useEffect(() => {
    const timer = window.setInterval(() => setPhase((current) => Math.min(current + 1, PHASES.length - 1)), 1000);
    const finish = window.setTimeout(() => complete.current(), 3200);
    return () => { window.clearInterval(timer); window.clearTimeout(finish); };
  }, []);

  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-2xl border border-ed-border bg-ed-accent-soft">
        <SignalGlyph className="h-10 w-10 text-ed-accent-ink" />
      </div>
      <p className="ed-eyebrow mb-4">Made for you</p>
      <h2 className="ed-serif text-[34px] font-semibold leading-tight text-ed-text">Finding your Signal.</h2>
      <div role="status" aria-live="polite" className="mt-4 min-h-12 text-sm text-ed-text-2">
        <motion.p key={phase} initial={reduce ? false : { opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22, ease: EASE }}>{PHASES[phase]}</motion.p>
      </div>
      <div aria-hidden="true" className="mt-4 flex gap-2">
        {PHASES.map((label, index) => <span key={label} className={`h-1 w-10 rounded-full transition-colors ${index <= phase ? "bg-ed-accent" : "bg-ed-border"}`} />)}
      </div>
    </div>
  );
}
