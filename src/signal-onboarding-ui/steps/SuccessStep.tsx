import { Check } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import type { Signal } from "../shared/peek";
import { PrimaryButton } from "../components/PrimaryButton";
import { EASE } from "@/ui-editorial/motion";

interface Props {
  firstName?: string;
  topics?: string[];
  signals?: Signal[];
  onEnter: () => void;
}

export function SuccessStep({ firstName, onEnter }: Props) {
  const reduce = useReducedMotion();
  return (
    <div className="flex h-full flex-col px-7 pb-7 pt-20 text-center">
      <motion.div initial={reduce ? false : { opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: EASE }} className="flex flex-1 flex-col items-center justify-center">
        <div className="mb-8 flex h-20 w-20 items-center justify-center rounded-full bg-ed-accent-soft text-ed-accent-ink">
          <Check className="h-10 w-10" strokeWidth={1.8} />
        </div>
        <p className="ed-eyebrow mb-4">You're all set</p>
        <h1 className="ed-serif text-[38px] font-semibold leading-[1.1] tracking-[-0.025em] text-ed-text">Welcome to Signal{firstName ? `, ${firstName}` : ""}.</h1>
        <p className="mt-4 max-w-[280px] text-sm leading-relaxed text-ed-text-2">A little less noise. A clearer view of AI.</p>
      </motion.div>
      <PrimaryButton onClick={onEnter}>Enter Signal</PrimaryButton>
    </div>
  );
}
