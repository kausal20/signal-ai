// signal-ui-v2 · ask/AskSignalOverlay.tsx
// ---------------------------------------------------------------------------
// The Ask Signal experience — a bottom-sheet overlay portaled into the
// PhoneFrame's overlay root (outside the clipping scroll container). Rises
// from the bottom as its own layer, leaving Home visible (scaled down,
// dimmed) above and behind it — an Apple Maps / Apple Music "Now Playing"
// style entry, not a full-screen page replace. Hosts the AI Intelligence
// Assistant: empty state, prompt cards, premium composer, streaming chat,
// thinking indicator, and follow-ups. Presentation-only; talks to the
// ask-signal function via useAskSignal.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  animate, AnimatePresence, LayoutGroup, motion as fm, useMotionValue, useReducedMotion, type Variants,
} from "framer-motion";
import {
  Brain, X, Plus, ArrowUp, Square, Paperclip, Mic, ArrowDown,
  Sparkles, Code2, GitCompare, Lightbulb, Newspaper, Server,
} from "lucide-react";
import { useAskSignal, type AskMessage } from "@/hooks/useAskSignal";
import type { ArticleContext } from "@/lib/askSignal";
import { Markdown } from "./Markdown";

// Bottom-sheet slide (up on open, down on close) — tween, not spring: no
// bounce, no overshoot, so it reads as a deliberate premium workspace entry.
const EASE = [0.22, 1, 0.36, 1] as const;
const OPEN_MS = 0.35;
const CLOSE_MS = 0.3;
const HOME_SCALE = 0.985;
const HOME_DIM = 0.18;
const SWIPE_DISMISS_PX = 120;
const SWIPE_DISMISS_VELOCITY = 800;

const SUGGESTIONS = [
  { icon: Sparkles, label: "Explain GPT-5.5", q: "Explain GPT-5.5" },
  { icon: GitCompare, label: "Compare Claude vs Gemini", q: "Compare Claude vs Gemini for real work" },
  { icon: Lightbulb, label: "Find AI business ideas", q: "Find promising AI business ideas for a solo founder" },
  { icon: Code2, label: "Best AI tools for coding", q: "What are the best AI tools for coding right now?" },
  { icon: Newspaper, label: "Summarize today's AI news", q: "Summarize today's most important AI news" },
  { icon: Server, label: "How do MCP servers work?", q: "How do MCP servers work?" },
];

function greeting(): string {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}
function userName(): string {
  try { return localStorage.getItem("signal:userName") || "there"; } catch { return "there"; }
}

// ── Animated background mesh (very slow, non-distracting) ──────────────────
function BackgroundMesh({ reduce }: { reduce: boolean }) {
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
      <fm.div
        className="absolute -left-1/4 top-0 h-[60%] w-[70%] rounded-full bg-green/[0.07] blur-[90px]"
        animate={reduce ? undefined : { x: [0, 60, 0], y: [0, 30, 0] }}
        transition={{ duration: 26, repeat: Infinity, ease: "easeInOut" }}
      />
      <fm.div
        className="absolute -right-1/4 bottom-0 h-[55%] w-[65%] rounded-full bg-green/[0.05] blur-[100px]"
        animate={reduce ? undefined : { x: [0, -50, 0], y: [0, -20, 0] }}
        transition={{ duration: 32, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="absolute inset-0 opacity-[0.4] [background-image:radial-gradient(hsl(0_0%_100%/0.02)_1px,transparent_1px)] [background-size:22px_22px]" />
    </div>
  );
}

// ── Magnetic prompt card ────────────────────────────────────────────────────
function SuggestionCard({ icon: Icon, label, onClick, reduce, delay }: {
  icon: typeof Sparkles; label: string; onClick: () => void; reduce: boolean; delay: number;
}) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const ref = useRef<HTMLButtonElement>(null);
  const onMove = (e: React.MouseEvent) => {
    if (reduce || !ref.current) return;
    const r = ref.current.getBoundingClientRect();
    x.set(((e.clientX - r.left) / r.width - 0.5) * 10);
    y.set(((e.clientY - r.top) / r.height - 0.5) * 10);
  };
  const reset = () => { x.set(0); y.set(0); };
  return (
    <fm.button
      ref={ref}
      type="button"
      onClick={onClick}
      onMouseMove={onMove}
      onMouseLeave={reset}
      initial={reduce ? undefined : { opacity: 0, y: 12 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.22, ease: EASE, delay }}
      style={{ x, y }}
      whileHover={reduce ? undefined : { scale: 1.03, borderColor: "hsl(152 72% 48% / 0.35)" }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      className="group flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.03] p-3.5 text-left backdrop-blur-md transition-colors hover:bg-white/[0.05] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-green/[0.10] text-green transition-colors group-hover:bg-green/[0.16]">
        <Icon className="h-[18px] w-[18px]" />
      </span>
      <span className="text-[13.5px] font-semibold leading-snug text-foreground/90">{label}</span>
    </fm.button>
  );
}

function ThinkingIndicator() {
  return (
    <div className="flex items-center gap-2.5 px-1 py-1" role="status" aria-label="Signal is thinking">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg border border-green/25 bg-green/[0.10] text-green">
        <Brain className="h-3.5 w-3.5" />
      </span>
      <span className="relative overflow-hidden bg-[linear-gradient(90deg,hsl(0_0%_100%/0.4),hsl(152_72%_60%),hsl(0_0%_100%/0.4))] bg-[length:200%_100%] bg-clip-text text-[13px] font-semibold text-transparent [animation:shimmer_2s_linear_infinite]">
        Signal is thinking
      </span>
      <span className="flex gap-1">
        {[0, 1, 2].map((i) => (
          <fm.span key={i} className="h-1.5 w-1.5 rounded-full bg-green"
            animate={{ opacity: [0.3, 1, 0.3], y: [0, -2, 0] }}
            transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.16 }} />
        ))}
      </span>
    </div>
  );
}

const bubbleV: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.98, filter: "blur(3px)" },
  show: { opacity: 1, y: 0, scale: 1, filter: "blur(0px)", transition: { duration: 0.32, ease: EASE } },
};

function RelatedSuggestions({ suggestions, loading, onAsk, reduce }: {
  suggestions: string[]; loading: boolean; onAsk: (q: string) => void; reduce: boolean;
}) {
  return (
    <div className="mt-3 border-t border-white/[0.06] pt-3">
      <div className="mb-2 text-[10.5px] font-bold uppercase tracking-[0.1em] text-muted-foreground/70">Related</div>
      <AnimatePresence mode="wait" initial={false}>
        {loading ? (
          <fm.div key="related-loading" exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: 0.18, ease: EASE }} className="flex flex-wrap gap-2">
            {[0, 1].map((index) => (
              <div key={index} className={`h-8 rounded-full border border-white/[0.05] bg-white/[0.05] ${index === 0 ? "w-40" : "w-36"} animate-pulse`} />
            ))}
          </fm.div>
        ) : (
          <fm.div key={suggestions.join("|")} initial={reduce ? undefined : { opacity: 0, y: 8, scale: 0.95 }} animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }} exit={reduce ? undefined : { opacity: 0, y: 8, scale: 0.96 }} transition={{ duration: 0.24, ease: EASE }} className="flex flex-wrap gap-2">
            {suggestions.slice(0, 2).map((suggestion, index) => (
              <fm.button key={suggestion} type="button" onClick={() => onAsk(suggestion)}
                initial={reduce ? undefined : { opacity: 0, y: 6, scale: 0.95 }}
                animate={reduce ? undefined : { opacity: 1, y: 0, scale: 1 }}
                transition={{ type: "spring", stiffness: 360, damping: 24, delay: index * 0.08 }}
                whileHover={reduce ? undefined : { y: -2, boxShadow: "0 8px 18px hsl(152 72% 48% / 0.18)" }}
                whileTap={reduce ? undefined : { scale: 0.97 }}
                className="rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-foreground/80 transition-colors hover:border-green/30 hover:text-green">
                {suggestion}
              </fm.button>
            ))}
          </fm.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function MessageBubble({ m, onAsk, reduce }: { m: AskMessage; onAsk: (q: string) => void; reduce: boolean }) {
  const isUser = m.role === "user";
  return (
    <fm.div variants={reduce ? undefined : bubbleV} initial={reduce ? undefined : "hidden"} animate={reduce ? undefined : "show"}
      className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div className={isUser ? "max-w-[85%]" : "w-full max-w-[92%]"}>
        {isUser ? (
          <div className="rounded-[20px] rounded-br-md border border-white/[0.06] bg-white/[0.06] px-4 py-2.5 text-[14px] leading-relaxed text-foreground shadow-[0_4px_18px_hsl(0_0%_0%/0.35)]">
            {m.content}
          </div>
        ) : (
          <div className="rounded-[20px] rounded-bl-md border border-green/15 bg-[linear-gradient(160deg,hsl(152_72%_48%/0.05),hsl(0_0%_100%/0.02))] px-4 py-3 backdrop-blur-md">
            {m.content ? <Markdown text={m.content} /> : null}
            {m.streaming && (
              <span className="ml-0.5 inline-block h-4 w-[2px] translate-y-0.5 animate-[pulse-dot_1s_ease-in-out_infinite] bg-green align-middle" />
            )}
            {(m.streaming || (m.related?.length ?? 0) > 0) && <RelatedSuggestions suggestions={m.related ?? []} loading={!!m.streaming} onAsk={onAsk} reduce={reduce} />}
          </div>
        )}
      </div>
    </fm.div>
  );
}

interface Props { onClose: () => void; context?: ArticleContext; }

/** Dynamic starter questions built from the article's own context. */
function contextQuestions(c: ArticleContext): string[] {
  const who = c.primary_entity || c.headline.split(/[:—-]/)[0].trim().split(" ").slice(0, 3).join(" ");
  const rival = (c.related_entities ?? []).find((e) => e && e !== c.primary_entity);
  return [
    "Why does this matter?",
    "Explain in simple words",
    rival ? `Compare with ${rival}` : "Compare with competitors",
    "Business impact",
    "What changed technically?",
    "Who benefits?",
    who ? `Show previous ${who} launches` : "Show previous launches",
    "Summarize in 30 seconds",
  ];
}

export function AskSignalOverlay({ onClose, context }: Props) {
  const reduce = useReducedMotion();
  // Local, clearable copy of the incoming article context so "Clear Story"
  // returns Signal AI to its normal Home without changing routes/pages.
  const [ctx, setCtx] = useState<ArticleContext | undefined>(context);
  useEffect(() => { setCtx(context); }, [context]);
  const clearContext = () => setCtx(undefined);
  const { messages, status, send, stop, newChat, busy } = useAskSignal(ctx);
  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const sheetRef = useRef<HTMLDivElement>(null);
  const empty = messages.length === 0;
  const name = useMemo(userName, []);

  // Scales + un-dims the Home layer behind the sheet. Called explicitly from
  // every close path (not a cleanup fn) so it runs in lockstep with the sheet's
  // own close animation rather than only after AnimatePresence fully unmounts.
  const restoreHome = useCallback(() => {
    const el = document.getElementById("app-content-root");
    if (el && !reduce) animate(el, { scale: 1 }, { duration: CLOSE_MS, ease: EASE });
  }, [reduce]);
  const handleClose = useCallback(() => { restoreHome(); onClose(); }, [restoreHome, onClose]);

  // Scale + dim Home the instant the overlay mounts (in lockstep with the sheet
  // rising). Safety-net cleanup resets the transform immediately on unmount in
  // case some path removed the overlay without going through handleClose.
  useEffect(() => {
    const el = document.getElementById("app-content-root");
    if (el) {
      el.style.transformOrigin = "top center";
      if (!reduce) animate(el, { scale: HOME_SCALE }, { duration: OPEN_MS, ease: EASE });
    }
    return () => { if (el) el.style.transform = ""; };
  }, [reduce]);

  // Escape to close + lock background scroll while the assistant is mounted, so
  // the Home page behind cannot move under the sheet.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") handleClose(); };
    window.addEventListener("keydown", onKey);
    sheetRef.current?.focus({ preventScroll: true });
    const scrollEl = document.querySelector<HTMLElement>("[data-home-scroll]");
    const prevHomeOverflow = scrollEl?.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    if (scrollEl) scrollEl.style.overflow = "hidden";
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      if (scrollEl) scrollEl.style.overflow = prevHomeOverflow ?? "";
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [handleClose]);

  // Always start at the top when the overlay opens or article context changes.
  // Skip while the user has an active chat so mid-conversation scroll is preserved.
  useEffect(() => {
    if (messages.length > 0) return;
    const el = scrollRef.current;
    if (!el) return;
    const reset = () => {
      el.scrollTo({ top: 0, behavior: "auto" });
      setScrolled(false);
      setAtBottom(el.scrollHeight - el.clientHeight < 80);
    };
    reset();
    requestAnimationFrame(reset);
  }, [ctx, messages.length]);

  // Auto-scroll to newest content while near the bottom (chat only — not the
  // empty hero/suggestions view, which must stay pinned at scrollTop 0).
  useEffect(() => {
    const el = scrollRef.current;
    if (el && atBottom && messages.length > 0) {
      el.scrollTo({ top: el.scrollHeight, behavior: reduce ? "auto" : "smooth" });
    }
  }, [messages, atBottom, reduce]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setScrolled(el.scrollTop > 8);
    setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 80);
  };

  const grow = () => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
  };

  const submit = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q || busy) return;
    send(q);
    setInput("");
    setAtBottom(true);
    requestAnimationFrame(() => { if (taRef.current) taRef.current.style.height = "auto"; });
  };

  // Portal target lives inside PhoneFrame but OUTSIDE the overflow-clipping
  // content wrapper, so the overlay can fill the full phone viewport.
  const portalTarget = document.getElementById("signal-overlay-root");

  const overlay = (
    <LayoutGroup id="ask-signal-overlay">
      {/* Backdrop — a light 18% scrim, not an opaque cover: Home stays visible
          (dimmed + scaled) beneath the sheet the whole time it's open, like an
          Apple Maps / Apple Music bottom sheet. */}
      <fm.div
        aria-hidden
        initial={reduce ? { opacity: HOME_DIM } : { opacity: 0 }}
        animate={{ opacity: HOME_DIM, transition: { duration: OPEN_MS, ease: EASE } }}
        exit={{ opacity: 0, transition: { duration: CLOSE_MS, ease: EASE } }}
        className="absolute inset-0 z-[94] bg-black"
      />
      <fm.div
        ref={sheetRef}
        tabIndex={-1}
        // Rises from the bottom as a card, not a full-screen replace — a `top`
        // inset leaves a peek strip so Home is visibly present above the sheet.
        // Tween only (no spring): a deliberate, non-bouncy premium entrance.
        initial={reduce ? false : { y: "100%", opacity: 0.98 }}
        animate={reduce ? undefined : { y: 0, opacity: 1, transition: { duration: OPEN_MS, ease: EASE } }}
        exit={reduce ? { opacity: 0 } : { y: "100%", transition: { duration: CLOSE_MS, ease: EASE } }}
        drag={reduce ? false : "y"}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 0.6 }}
        onDragEnd={(_, info) => {
          if (info.offset.y > SWIPE_DISMISS_PX || info.velocity.y > SWIPE_DISMISS_VELOCITY) handleClose();
        }}
        role="dialog"
        aria-modal="true"
        aria-label="Signal AI"
        className="absolute inset-x-0 bottom-0 top-14 z-[95] flex flex-col overflow-hidden rounded-t-[28px] border-t border-white/[0.08] bg-[#040604] text-foreground shadow-[0_-30px_80px_hsl(0_0%_0%/0.7)] outline-none will-change-transform"
      >
      <BackgroundMesh reduce={!!reduce} />

      {/* Grab handle — draggable sheet cue */}
      <div aria-hidden className="relative z-10 flex shrink-0 cursor-grab justify-center pt-2 pb-1 active:cursor-grabbing">
        <span className="h-[5px] w-10 rounded-full bg-white/20" />
      </div>

      {/* HEADER — glass, shrinks on scroll; fades/slides in 100ms after the
          sheet begins rising. paddingTop is a plain style value so the scroll
          animation can freely control it without React duplicate-prop conflicts. */}
      <fm.header
        className="relative z-10 flex items-center gap-3 border-b border-white/[0.06] bg-[linear-gradient(to_bottom,rgba(4,6,4,0.9),rgba(4,6,4,0.6))] px-4 backdrop-blur-xl sm:px-5"
        initial={reduce ? undefined : { opacity: 0, y: -10 }}
        animate={{
          opacity: 1, y: 0,
          paddingTop: scrolled ? 10 : 16, paddingBottom: scrolled ? 12 : 16,
        }}
        transition={{
          opacity: { duration: 0.22, ease: EASE, delay: reduce ? 0 : 0.1 },
          y: { duration: 0.22, ease: EASE, delay: reduce ? 0 : 0.1 },
          paddingTop: { duration: 0.25 },
          paddingBottom: { duration: 0.25 },
        }}
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-2xl border border-green/25 bg-green/[0.10] text-green shadow-[0_0_16px_hsl(152_72%_48%/0.2)]">
          <Brain className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <fm.h1 className="font-extrabold tracking-[-0.02em] text-foreground" animate={{ fontSize: scrolled ? 16 : 19 }} transition={{ duration: 0.25 }}>
            Signal AI
          </fm.h1>
          <AnimatePresence>
            {!scrolled && (
              <fm.p initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
                className="text-[11.5px] font-medium text-muted-foreground">
                Your AI Intelligence Assistant
              </fm.p>
            )}
          </AnimatePresence>
        </div>

        <fm.button type="button" onClick={handleClose} aria-label="Close Signal AI"
          whileHover={reduce ? undefined : { scale: 1.06 }} whileTap={reduce ? undefined : { scale: 0.92 }}
          className="flex h-9 w-9 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.04] text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green">
          <X className="h-4 w-4" />
        </fm.button>
      </fm.header>

      {/* BODY */}
      <div ref={scrollRef} onScroll={onScroll} className="no-scrollbar relative z-10 min-h-0 flex-1 overflow-y-auto overscroll-none px-4">
        <div className="w-full">
          {empty ? (
            /* ── ONE Signal AI Home layout. When `ctx` (an article) is present,
                 a Current Story card is inserted above the suggestions and the
                 suggestions become article-scoped. Clearing `ctx` returns to the
                 normal Home — no other page, no route change. */
            <div className="flex flex-1 flex-col items-center py-8 text-center">
              {/* Breathing logo */}
              <fm.div className="relative mb-6 flex h-20 w-20 items-center justify-center"
                animate={reduce ? undefined : { scale: [1, 1.04, 1] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }}>
                <fm.span className="absolute inset-0 rounded-[28px] bg-green/25 blur-2xl"
                  animate={reduce ? undefined : { opacity: [0.4, 0.8, 0.4] }} transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut" }} />
                <span className="relative flex h-full w-full items-center justify-center rounded-[26px] border border-green/25 bg-[radial-gradient(circle_at_38%_32%,hsl(152_72%_54%/0.3),hsl(0_0%_5%/0.9))] text-green shadow-[0_0_30px_hsl(152_72%_48%/0.25)]">
                  <Brain className="h-9 w-9" />
                </span>
              </fm.div>
              <fm.h2 initial={reduce ? undefined : { opacity: 0, y: 8 }} animate={reduce ? undefined : { opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: EASE }}
                className="text-[22px] font-extrabold tracking-[-0.02em] text-foreground">
                {greeting()}, <span className="text-green">{name}</span>
              </fm.h2>
              <fm.p initial={reduce ? undefined : { opacity: 0 }} animate={reduce ? undefined : { opacity: 1 }} transition={{ delay: 0.1 }}
                className="mt-1.5 text-[14px] text-muted-foreground">
                {ctx ? "Continue asking about this story." : "What would you like to explore today?"}
              </fm.p>

              {/* CURRENT STORY card — only when opened with article context. */}
              {ctx && (
                <fm.div
                  initial={reduce ? undefined : { opacity: 0, y: 10 }}
                  animate={reduce ? undefined : { opacity: 1, y: 0 }}
                  transition={{ duration: 0.28, ease: EASE, delay: 0.14 }}
                  className="mt-6 w-full overflow-hidden rounded-[22px] border border-green/20 bg-white/[0.03] text-left backdrop-blur-xl"
                >
                  {ctx.image_url && <img src={ctx.image_url} alt="" className="h-28 w-full object-cover" loading="eager" />}
                  <div className="p-4">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="font-mono-tight text-[10px] font-bold uppercase tracking-[0.14em] text-green/80">Current Story</span>
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); clearContext(); }}
                        aria-label="Clear story context"
                        className="inline-flex items-center gap-1 rounded-full border border-white/[0.10] bg-white/[0.04] px-2 py-0.5 text-[10.5px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <X className="h-3 w-3" /> Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      {ctx.event_type && (
                        <span className="rounded-full border border-green/25 bg-green/[0.08] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-green">
                          {ctx.event_type}
                        </span>
                      )}
                      {typeof ctx.impact_score === "number" && (
                        <span className="rounded-full border border-white/[0.10] bg-white/[0.05] px-2 py-0.5 text-[10px] font-bold text-foreground/80">
                          Impact {Math.round(ctx.impact_score)}
                        </span>
                      )}
                    </div>
                    <h3 className="mt-2 text-[16px] font-extrabold leading-snug tracking-[-0.02em] text-foreground">
                      {ctx.headline}
                    </h3>
                    <p className="mt-1.5 text-[11.5px] text-muted-foreground">
                      {ctx.publisher ?? "Signal"}
                      {ctx.source_type ? ` · ${ctx.source_type.replace(/_/g, " ").toLowerCase()}` : ""}
                    </p>
                  </div>
                </fm.div>
              )}

              <div className="mt-7 grid w-full grid-cols-1 gap-2.5">
                {ctx
                  ? contextQuestions(ctx).map((q, i) => (
                      <SuggestionCard key={q} icon={Sparkles} label={q} reduce={!!reduce} delay={0.18 + i * 0.05} onClick={() => submit(q)} />
                    ))
                  : SUGGESTIONS.map((s, i) => (
                      <SuggestionCard key={s.label} icon={s.icon} label={s.label} reduce={!!reduce} delay={0.18 + i * 0.05} onClick={() => submit(s.q)} />
                    ))}
              </div>
            </div>
          ) : (
            <fm.div
              className="flex flex-col gap-4 py-5"
              initial={reduce ? undefined : "hidden"}
              animate={reduce ? undefined : "show"}
              variants={reduce ? undefined : { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.18 } } }}
            >
              <AnimatePresence initial={false}>
                {messages.map((m) => <MessageBubble key={m.id} m={m} onAsk={submit} reduce={!!reduce} />)}
              </AnimatePresence>
              {status === "thinking" && <ThinkingIndicator />}
            </fm.div>
          )}
        </div>
      </div>

      {/* Scroll-to-bottom */}
      <AnimatePresence>
        {!atBottom && !empty && (
          <fm.button type="button" aria-label="Scroll to latest"
            onClick={() => { setAtBottom(true); scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 8 }}
            className="absolute bottom-[92px] left-1/2 z-20 flex h-9 w-9 -translate-x-1/2 items-center justify-center rounded-full border border-white/10 bg-[#0a0d0a] text-foreground shadow-[0_8px_24px_hsl(0_0%_0%/0.5)]">
            <ArrowDown className="h-4 w-4" />
          </fm.button>
        )}
      </AnimatePresence>

      {/* COMPOSER — sticky */}
      <div className="relative z-10 border-t border-white/[0.06] bg-[linear-gradient(to_top,rgba(4,6,4,0.95),rgba(4,6,4,0.7))] px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur-xl">
        <div className="w-full">
          <fm.div
            initial={reduce ? undefined : { opacity: 0, scale: 0.98 }}
            animate={reduce ? undefined : {
              opacity: 1, scale: 1,
              borderColor: focused ? "hsl(152 72% 48% / 0.55)" : "hsl(0 0% 100% / 0.08)",
              boxShadow: focused ? "0 0 0 3px hsl(152 72% 48% / 0.08), 0 8px 30px hsl(152 72% 48% / 0.10)" : "0 8px 24px hsl(0 0% 0% / 0.35)",
            }}
            transition={{
              opacity: { duration: 0.22, ease: EASE, delay: 0.14 },
              scale: { duration: 0.22, ease: EASE, delay: 0.14 },
              borderColor: { duration: 0.2 },
              boxShadow: { duration: 0.2 },
            }}
            className="flex items-end gap-2 rounded-[32px] border bg-white/[0.03] p-2 pl-3.5 backdrop-blur-xl"
          >

            <textarea
              ref={taRef}
              value={input}
              rows={1}
              onChange={(e) => { setInput(e.target.value); grow(); }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submit(); } }}
              placeholder="Ask Signal AI anything..."
              aria-label="Message Signal AI"
              className="no-scrollbar mb-1 max-h-[140px] flex-1 resize-none bg-transparent py-1.5 text-[14.5px] leading-relaxed text-foreground caret-green outline-none placeholder:text-muted-foreground/55"
            />

            {busy ? (
              <fm.button type="button" onClick={stop} aria-label="Stop" whileTap={reduce ? undefined : { scale: 0.94 }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.10] text-foreground">
                <Square className="h-4 w-4 fill-current" />
              </fm.button>
            ) : (
              <fm.button type="button" onClick={() => submit()} aria-label="Send" disabled={!input.trim()}
                whileHover={reduce || !input.trim() ? undefined : { scale: 1.06, boxShadow: "0 0 20px hsl(152 72% 48% / 0.4)" }}
                whileTap={reduce ? undefined : { scale: 0.96 }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[linear-gradient(135deg,hsl(152_72%_52%),hsl(152_72%_40%))] text-black shadow-[0_4px_18px_hsl(152_72%_48%/0.35)] transition-opacity disabled:opacity-40">
                <ArrowUp className="h-5 w-5 stroke-[2.5]" />
              </fm.button>
            )}
          </fm.div>
          <p className="mt-2 text-center text-[10.5px] text-muted-foreground/50">Signal AI focuses on AI news, models, companies and tools.</p>
        </div>
      </div>
    </fm.div>
    </LayoutGroup>
  );

  // If the portal target exists (PhoneFrame is mounted), render there so we
  // escape the overflow-clipping content wrapper. Otherwise fall back to inline.
  return portalTarget ? createPortal(overlay, portalTarget) : overlay;
}
