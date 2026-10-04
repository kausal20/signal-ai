import { useState } from "react";
import { ArrowUp } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE } from "../motion";
import { SignalGlyph } from "./SignalMark";

interface Props {
  onOpen: (question: string) => void;
  placeholder?: string;
  className?: string;
}

export function SignalAIEntry({ onOpen, placeholder = "Ask Signal anything…", className }: Props) {
  const [draft, setDraft] = useState("");
  const question = draft.trim();
  return (
    <form
      noValidate
      onSubmit={(event) => { event.preventDefault(); if (question) onOpen(question); }}
      className={cn(
        "group flex min-h-[52px] w-full items-center gap-3 rounded-xl border border-ed-border-strong bg-ed-surface pl-4 pr-1 text-left transition-colors focus-within:border-ed-accent focus-within:ring-2 focus-within:ring-ed-accent/25",
        className,
      )}
    >
      <SignalGlyph className="h-[20px] w-[20px] shrink-0 text-ed-accent" strokeWidth={2.2} />
      <input
        aria-label="Ask Signal a question"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => { if (event.key === "Enter" && event.nativeEvent.isComposing) event.preventDefault(); }}
        placeholder={placeholder}
        enterKeyHint="send"
        className="ed-prompt-input min-w-0 flex-1 bg-transparent py-3 text-base text-ed-text outline-none placeholder:text-ed-text-2"
      />
      <motion.button
        type="submit"
        aria-label="Send question to Signal AI"
        disabled={!question}
        whileTap={question ? { scale: 0.92 } : undefined}
        animate={{ opacity: question ? 1 : 0.35 }}
        transition={{ duration: 0.16, ease: EASE }}
        className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ed-accent-ink text-ed-on-accent disabled:cursor-not-allowed"
      >
        <ArrowUp className="h-[18px] w-[18px] transition-transform duration-200 group-hover:-translate-y-px" strokeWidth={2.2} />
      </motion.button>
    </form>
  );
}
