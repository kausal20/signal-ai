import { useMemo, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Brain, Send } from "lucide-react";
import { usePersonalizedFeed } from "@/hooks/usePersonalizedFeed";
import { track } from "@/lib/signals";
import type { FeedItem } from "@/data/feed";

interface Msg { role: "user" | "ai"; text: string; verdict?: string; tone?: string; }

// Dedicated AI Strategy Chat. Answers come from the CACHED advisor object only —
// keyword-routed to today's intelligence. No LLM call, no backend change.
export default function Strategy() {
  const { items, advisor } = usePersonalizedFeed();
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([{
    role: "ai",
    text: "Ask me anything strategic — should you learn MCP, migrate models, or build that SaaS? I'll answer from today's signals.",
  }]);
  const endRef = useRef<HTMLDivElement>(null);

  const ranked = useMemo(
    () => [...items].sort((a, b) => (b.intel?.signalScore ?? b.score) - (a.intel?.signalScore ?? a.score)),
    [items],
  );

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);

  const answerFromCache = (q: string): Msg => {
    const words = q.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
    const hero = ranked.find((i) => i.intel?.opportunity) ?? ranked[0];
    const match: FeedItem | undefined =
      ranked.find((i) => words.some((w) => `${i.title} ${i.summary}`.toLowerCase().includes(w))) ?? hero;
    const r = match?.intel;
    let verdict = "Worth a look", tone = "hsl(38 92% 55%)";
    if (r?.priority === "High" && r?.risk !== "High") { verdict = "Yes — act on it"; tone = "hsl(152 72% 48%)"; }
    else if (r?.risk === "High") { verdict = "Hold — wait it out"; tone = "hsl(0 55% 55%)"; }
    const reason = r?.recommendationReason ?? r?.opportunity?.explanation ?? match?.whyItMatters
      ?? advisor?.one_action_to_take ?? "Keep monitoring before committing.";
    return { role: "ai", verdict, tone, text: reason };
  };

  const send = () => {
    const q = input.trim();
    if (!q) return;
    track("search", { query: q });
    setMsgs((m) => [...m, { role: "user", text: q }, answerFromCache(q)]);
    setInput("");
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.05] bg-background/85 backdrop-blur-xl pt-safe">
        <div className="max-w-2xl mx-auto px-4 h-14 flex items-center gap-3">
          <Link to="/advisor" className="w-9 h-9 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center pressable" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-7 h-7 rounded-xl bg-green/15 border border-green/25 flex items-center justify-center">
              <Brain className="w-4 h-4 text-green" />
            </span>
            <span className="font-bold tracking-tight">AI Strategy</span>
          </div>
        </div>
      </header>

      {/* Messages */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-5 space-y-3">
          {msgs.map((m, i) => (
            m.role === "user" ? (
              <div key={i} className="flex justify-end animate-scale-in">
                <div className="max-w-[80%] rounded-2xl rounded-br-md bg-green text-black text-[14px] font-medium px-4 py-2.5">{m.text}</div>
              </div>
            ) : (
              <div key={i} className="flex justify-start animate-scale-in">
                <div className="max-w-[85%] premium-card px-4 py-3">
                  {m.verdict && <p className="text-[14px] font-extrabold mb-1" style={{ color: m.tone }}>{m.verdict}</p>}
                  <p className="text-[13px] text-foreground/85 leading-relaxed">{m.text}</p>
                </div>
              </div>
            )
          ))}
          <div ref={endRef} />
        </div>
      </main>

      {/* Composer */}
      <div className="border-t border-white/[0.05] bg-background/85 backdrop-blur-xl pb-safe">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") send(); }}
            placeholder="Ask a strategic question…"
            className="flex-1 h-11 rounded-xl bg-white/[0.04] border border-white/[0.08] px-3.5 text-[14px] outline-none focus:border-green/30 placeholder:text-muted-foreground/70"
          />
          <button onClick={send} aria-label="Send" className="h-11 w-11 rounded-xl bg-green text-black flex items-center justify-center pressable shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-center text-[10px] text-muted-foreground/60 pb-2">Answered from today's cached intelligence — no new analysis run.</p>
      </div>
    </div>
  );
}
