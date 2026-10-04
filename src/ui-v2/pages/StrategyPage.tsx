// signal-ui-v2 · pages/StrategyPage.tsx
// ---------------------------------------------------------------------------
// AI Strategy chat — presentation swap only. Domain data (ranked signals,
// advisor object) stays in the parent (pages/Strategy.tsx, same
// usePersonalizedFeed() shared hook as Advisor/Weekly), passed down as a pure
// onAsk callback. Chat transcript + input are page-private UI state, owned
// here — same split SearchPage uses for its own local-only state.
//
// Replaces production: pages/Strategy.tsx.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, Brain, Send } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { ScreenShell } from "../layouts/ScreenShell";

export interface StrategyAnswer { verdict: string; tone: string; text: string; }

interface Msg { role: "user" | "ai"; text: string; verdict?: string; tone?: string; }

interface Props {
  onAsk: (query: string) => StrategyAnswer;
  onTrack?: (query: string) => void;
  onBack?: () => void;
}

const GREETING = "Ask me anything strategic — should you learn MCP, migrate models, or build that SaaS? I'll answer from today's signals.";

export function StrategyPage({ onAsk, onTrack, onBack }: Props) {
  const reduce = useReducedMotion();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "ai", text: GREETING }]);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const send = () => {
    const q = input.trim();
    if (!q) return;
    onTrack?.(q);
    const a = onAsk(q);
    setMsgs((m) => [...m, { role: "user", text: q }, { role: "ai", text: a.text, verdict: a.verdict, tone: a.tone }]);
    setInput("");
  };

  const header = (
    <div className="flex items-center gap-3 bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_72%,transparent)] px-5 pb-3 pt-12">
      <button
        type="button"
        onClick={onBack}
        aria-label="Back"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-foreground/80 transition-transform active:scale-90"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <span className="flex h-[30px] w-[30px] items-center justify-center rounded-[9px] border border-green/25 bg-green/[0.12]">
        <Brain className="h-4 w-4 text-green" />
      </span>
      <h1 className="text-[15px] font-extrabold tracking-[-0.01em] text-foreground">AI Strategy</h1>
    </div>
  );

  const footer = (
    <div className="border-t border-white/[0.06] bg-[#070707]/90 backdrop-blur-xl pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="mx-auto flex w-full max-w-2xl items-center gap-2 px-5 pt-3">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(); }}
          placeholder="Ask a strategic question…"
          className="h-11 min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3.5 text-[14px] text-foreground outline-none placeholder:text-muted-foreground/70 focus:border-green/30"
        />
        <button
          type="button"
          onClick={send}
          aria-label="Send"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-green text-black transition-transform active:scale-90"
        >
          <Send className="h-4 w-4" />
        </button>
      </div>
      <p className="mx-auto max-w-2xl px-5 pb-2 pt-2 text-center text-[10px] text-muted-foreground/60">
        Answered from today's cached intelligence — no new analysis run.
      </p>
    </div>
  );

  return (
    <ScreenShell header={header} footer={footer} bodyClassName="px-5 pt-3 pb-3">
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3">
        {msgs.map((m, i) =>
          m.role === "user" ? (
            <fm.div
              key={i}
              initial={reduce ? undefined : { opacity: 0, y: 6 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className="max-w-[80%] rounded-2xl rounded-br-md bg-green px-4 py-2.5 text-[14px] font-medium text-black">{m.text}</div>
            </fm.div>
          ) : (
            <fm.div
              key={i}
              initial={reduce ? undefined : { opacity: 0, y: 6 }}
              animate={reduce ? undefined : { opacity: 1, y: 0 }}
              className="flex justify-start"
            >
              <div className="max-w-[85%] rounded-2xl border border-white/[0.07] bg-white/[0.03] px-4 py-3">
                {m.verdict && <p className="mb-1 text-[14px] font-extrabold" style={{ color: m.tone }}>{m.verdict}</p>}
                <p className="text-[13px] leading-relaxed text-foreground/85">{m.text}</p>
              </div>
            </fm.div>
          )
        )}
        <div ref={endRef} />
      </div>
    </ScreenShell>
  );
}
