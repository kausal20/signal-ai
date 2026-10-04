import { useEffect, useRef, useState } from "react";
import { ArrowRight, ArrowUp, Square, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE, Reveal, Stagger, Swap, itemV } from "../motion";
import { AIMessage, ThinkingIndicator, type AIMessageData } from "../components/AIMessage";
import { StoryImage } from "../components/StoryImage";
import { ConversationMenu, type ConversationSummary } from "../components/ConversationMenu";

export interface SignalContext {
  headline: string;
  source?: string;
  image?: string;
  /** Starter questions built from the story itself. */
  questions: string[];
}

export interface SignalPageProps {
  messages: AIMessageData[];
  status: "idle" | "thinking" | "streaming";
  context?: SignalContext;
  suggestions: string[];
  onSend: (text: string) => void;
  onStop: () => void;
  onNewChat: () => void;
  onClearContext: () => void;
  history: ConversationSummary[];
  activeId?: string;
  onOpenConversation: (id: string) => void;
  onDeleteConversation: (id: string) => void;
}

/** SIGNAL = interact / think. Runs on the deep surface: a calm reading column,
 *  open typography for answers, one sticky composer. The only conversational AI. */
export function SignalPage(p: SignalPageProps) {
  const [draft, setDraft] = useState("");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const busy = p.status !== "idle";
  const empty = p.messages.length === 0;

  // Follow the answer while it streams — unless the reader scrolled away.
  useEffect(() => {
    const onScroll = () => {
      stick.current = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 140;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (empty || !stick.current) return;
    endRef.current?.scrollIntoView({ block: "end", behavior: "auto" });
  }, [p.messages, p.status, empty]);

  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 144)}px`;
  };

  const send = (text?: string) => {
    const q = (text ?? draft).trim();
    if (!q || busy) return;
    stick.current = true;
    p.onSend(q);
    setDraft("");
    requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = "auto"; });
  };

  const starters = p.context ? p.context.questions : p.suggestions;

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-88px)] w-full max-w-[760px] flex-col pt-7 lg:min-h-[calc(100dvh-64px-96px)] lg:pt-12">
      <header className="flex items-center justify-between gap-4">
        <h1 className="ed-serif text-[34px] font-semibold leading-[1.05] tracking-[-0.025em] text-ed-text md:text-[42px]">Signal AI</h1>
        <div className="relative flex items-center gap-2">
        <ConversationMenu
          conversations={p.history}
          activeId={p.activeId}
          onOpen={(id) => { p.onOpenConversation(id); setDraft(""); }}
          onDelete={p.onDeleteConversation}
          onNew={() => { p.onNewChat(); setDraft(""); requestAnimationFrame(() => taRef.current?.focus()); }}
        />
        </div>
      </header>

      {/* Empty state ↔ conversation crossfade (e.g. "New conversation"). */}
      <Swap id={empty ? "empty" : "chat"} className="flex flex-1 flex-col">
      {empty ? (
        <section aria-labelledby="signal-prompt" className="mt-12 flex-1 lg:mt-16">
          {p.context && (
            <Reveal className="mb-10 border-t border-ed-text pt-4">
              <div className="flex items-center justify-between gap-3">
                <p className="ed-eyebrow">Asking about this story</p>
                <button
                  type="button"
                  onClick={p.onClearContext}
                  className="-mr-2 inline-flex min-h-11 items-center gap-1.5 px-2 text-[13px] font-medium text-ed-text-2 transition-colors hover:text-ed-text"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" /> Clear
                </button>
              </div>
              <div className="mt-1 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <p className="ed-serif text-[22px] font-semibold leading-snug tracking-[-0.01em] text-ed-text [text-wrap:balance]">{p.context.headline}</p>
                  {p.context.source && <p className="mt-1.5 text-[13px] text-ed-text-2">{p.context.source}</p>}
                </div>
                {p.context.image && <StoryImage src={p.context.image} aspect="aspect-square" className="h-16 w-16 shrink-0 rounded-md" />}
              </div>
            </Reveal>
          )}

          <motion.h2
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: EASE, delay: 0.05 }}
            id="signal-prompt"
            className="ed-serif max-w-[18ch] text-[30px] font-semibold leading-[1.12] tracking-[-0.02em] text-ed-text md:text-[38px]">
            What do you want to understand?
          </motion.h2>

          <Stagger delay={0.18} className="mt-8 border-t border-ed-border">
            {starters.map((q) => (
              <motion.li key={q} variants={itemV} className="border-b border-ed-border">
                <button
                  type="button"
                  onClick={() => send(q)}
                  className="group flex min-h-[56px] w-full items-center justify-between gap-4 py-3 text-left text-[17px] text-ed-text transition-colors hover:text-ed-accent-ink"
                >
                  <span>{q}</span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-ed-text-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ed-accent-ink" aria-hidden="true" />
                </button>
              </motion.li>
            ))}
          </Stagger>
        </section>
      ) : (
        <section aria-label="Conversation" aria-live="polite" className="mt-9 flex-1 space-y-9">
          {p.context && (
            <p className="border-t border-ed-border pt-3 text-[13px] leading-snug text-ed-text-2">
              <span className="ed-eyebrow mr-2">About</span>
              {p.context.headline}
            </p>
          )}
          {p.messages.filter((m) => m.role === "user" || m.content.length > 0).map((m) => <AIMessage key={m.id} message={m} onAsk={send} />)}
          <AnimatePresence>
            {p.status === "thinking" && (
              <motion.div key="thinking" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }} transition={{ duration: 0.2, ease: EASE }}>
                <ThinkingIndicator />
              </motion.div>
            )}
          </AnimatePresence>
          <div ref={endRef} aria-hidden="true" className="h-px scroll-mb-44" />
        </section>
      )}
      </Swap>

      <div
        className={cn(
          "sticky z-20 -mx-5 bg-ed-bg px-5 pb-3 pt-3 md:-mx-8 md:px-8",
          "bottom-[calc(58px+env(safe-area-inset-bottom))] lg:bottom-0 lg:mx-0 lg:px-0 lg:pb-6",
          !empty && "border-t border-ed-border",
        )}
      >
        <form noValidate
          onSubmit={(e) => { e.preventDefault(); send(); }}
          className="flex items-end gap-2 rounded-2xl border border-ed-border-strong bg-ed-surface py-2 pl-4 pr-2 transition-colors focus-within:border-ed-accent focus-within:ring-2 focus-within:ring-ed-accent/25"
        >
          <label htmlFor="signal-composer" className="sr-only">Message Signal AI</label>
          <textarea
            id="signal-composer"
            ref={taRef}
            rows={1}
            value={draft}
            onChange={(e) => { setDraft(e.target.value); grow(); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }}
            placeholder={p.context && empty ? "Ask about this story…" : "Ask Signal anything…"}
            className="ed-prompt-input no-scrollbar max-h-36 min-h-11 flex-1 resize-none bg-transparent py-2.5 text-[16px] leading-relaxed text-ed-text caret-ed-accent outline-none placeholder:text-ed-text-3"
          />
          <AnimatePresence mode="popLayout" initial={false}>
          {busy ? (
            <motion.button
              key="stop"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.18, ease: EASE }}
              type="button"
              onClick={p.onStop}
              aria-label="Stop generating"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-ed-border-strong text-ed-text transition-colors hover:bg-ed-sunken"
            >
              <Square className="h-4 w-4 fill-current" aria-hidden="true" />
            </motion.button>
          ) : (
            <motion.button
              key="send"
              initial={{ scale: 0.6, opacity: 0 }}
              animate={{ scale: 1, opacity: draft.trim() ? 1 : 0.35 }}
              exit={{ scale: 0.6, opacity: 0 }}
              whileTap={{ scale: 0.9 }}
              transition={{ duration: 0.18, ease: EASE }}
              type="submit"
              disabled={!draft.trim()}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-ed-accent-ink text-ed-on-accent"
            >
              <ArrowUp className="h-5 w-5" strokeWidth={2.2} aria-hidden="true" />
            </motion.button>
          )}
          </AnimatePresence>
        </form>
        <p className="mt-2 text-center text-[11px] leading-snug text-ed-text-3">
          Signal AI can make mistakes. Double-check important information.
        </p>
      </div>
    </div>
  );
}
