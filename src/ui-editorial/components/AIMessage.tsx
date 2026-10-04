import { memo, useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EditorialMarkdown } from "./Markdown";
import { Stagger, itemV } from "../motion";
import { SignalGlyph } from "./SignalMark";

export interface AIMessageData {
  id: string;
  role: "user" | "assistant";
  content: string;
  related?: string[];
  streaming?: boolean;
}

interface Props {
  message: AIMessageData;
  onAsk: (question: string) => void;
}

/** User turn = a subtle surface. Signal's answer = open typography under a
 *  small "Signal" label — no bubble, no card — with follow-ups as a plain list. */
export const AIMessage = memo(function AIMessage({ message, onAsk }: Props) {
  const reduce = useReducedMotion();
  const isUser = message.role === "user";
  const enter = reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.24, ease: [0.22, 1, 0.36, 1] as const } };

  if (isUser) {
    return (
      <motion.div {...enter} className="flex justify-end">
        <p className="max-w-[88%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ed-sunken px-4 py-3 text-[16px] leading-relaxed text-ed-text">
          {message.content}
        </p>
      </motion.div>
    );
  }

  // Service errors arrive as "⚠️ **…**" text: drop the emoji, and don't offer
  // follow-ups to a message that isn't an answer.
  const failed = message.content.startsWith("⚠️");
  // Older deployments appended a "Related Reading" list; it is not shown.
  const stripped = message.content.replace(/\n*#{1,4}\s*Related Reading[\s\S]*$/i, "").trimEnd();
  const text = failed ? stripped.replace(/^⚠️\s*/, "") : stripped;
  const followUps = failed ? [] : (message.related ?? []).slice(0, 2);
  return (
    <motion.article {...enter} aria-label="Signal's answer" className="max-w-[68ch]">
      <p className="mb-2.5 flex items-center gap-2 text-[12px] font-semibold uppercase tracking-[0.09em] text-ed-text-2">
        <SignalGlyph className="h-4 w-4 text-ed-accent" strokeWidth={2.2} /> Signal
      </p>
      {text ? <EditorialMarkdown text={text} /> : null}
      {message.streaming && <span className="ed-caret" aria-hidden="true" />}

      {!message.streaming && followUps.length > 0 && (
        <div className="mt-5 border-t border-ed-border pt-1">
          <p className="ed-eyebrow mb-1 mt-3">Follow-ups</p>
          <Stagger delay={0.1}>
            {followUps.map((q) => (
              <motion.li key={q} variants={itemV} className="border-b border-ed-border last:border-b-0">
                <button
                  type="button"
                  onClick={() => onAsk(q)}
                  className={cn("group flex min-h-11 w-full items-center justify-between gap-3 py-2 text-left text-[15px] text-ed-text transition-colors hover:text-ed-accent-ink")}
                >
                  <span>{q}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ed-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ed-accent-ink" aria-hidden="true" />
                </button>
              </motion.li>
            ))}
          </Stagger>
        </div>
      )}
    </motion.article>
  );
});

const PROGRESS_STEPS = [
  "Connecting to Signal",
  "Reading your question",
  "Waiting for the answer",
] as const;

/** A calm progression while the real answer is pending. It never delays streaming. */
export function ThinkingIndicator() {
  const reduce = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = window.setInterval(() => setStep((current) => Math.min(current + 1, PROGRESS_STEPS.length - 1)), 900);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <div role="status" aria-live="polite" className="max-w-[68ch] py-2">
      <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.09em] text-ed-text-2">
        <SignalGlyph className="h-4 w-4 text-ed-accent" strokeWidth={2.2} /> Signal
      </div>
      <div className="mt-2 min-h-6 overflow-hidden text-[14px] leading-6 text-ed-text-2">
        <motion.span
          key={step}
          initial={reduce ? false : { opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2 }}
          className="block"
        >
          {PROGRESS_STEPS[step]}
        </motion.span>
      </div>
      {!reduce && (
        <div className="mt-2 flex gap-1.5" aria-hidden="true">
          {PROGRESS_STEPS.map((label, index) => (
            <span key={label} className={cn("h-0.5 w-6 rounded-full transition-colors duration-200", index <= step ? "bg-ed-accent" : "bg-ed-border-strong")} />
          ))}
        </div>
      )}
    </div>
  );
}
