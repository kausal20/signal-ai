// Prompt Library — the full premium workspace (/prompts).
// Search · AI generator · category filters · trending/editor/saved/recent lanes ·
// prompt cards with copy · detail overlay. Signal design language reused.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion as fm, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  ArrowLeft, Search, Sparkles, Copy, Check, Bookmark, ArrowRight,
  Flame, Star, Heart, Clock, Wand2, X, RefreshCw,
} from "lucide-react";
import {
  PROMPT_CATEGORIES, CATEGORY_ICON, fetchFeatured, searchPrompts, fetchSaved,
  fetchRecent, fetchPrompt, toggleSave, copyPrompt, generatePrompt, trackView,
  isSaved, track, type Prompt,
} from "@/lib/prompts";

type Lane = "trending" | "editor" | "saved" | "recent";

export default function PromptLibrary() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [lane, setLane] = useState<Lane>("trending");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(12);
  const [detail, setDetail] = useState<Prompt | null>(null);
  const debounce = useRef<number>();

  // Load list based on query / category / lane.
  const load = useCallback(async () => {
    setLoading(true);
    let rows: Prompt[] = [];
    if (query.trim() || category) rows = await searchPrompts(query, category, 60);
    else if (lane === "saved") rows = await fetchSaved();
    else if (lane === "recent") rows = await fetchRecent();
    else rows = await searchPrompts("", null, 60); // trending/editor over full set
    if (lane === "editor" && !query.trim() && !category) rows = rows.filter((p) => p.is_featured);
    if (lane === "trending" && !query.trim() && !category) rows = [...rows].sort((a, b) => (b.copy_count ?? 0) - (a.copy_count ?? 0));
    setPrompts(rows); setVisible(12); setLoading(false);
  }, [query, category, lane]);

  useEffect(() => {
    window.clearTimeout(debounce.current);
    debounce.current = window.setTimeout(load, query ? 220 : 0);
    return () => window.clearTimeout(debounce.current);
  }, [load, query]);

  const shown = useMemo(() => prompts.slice(0, visible), [prompts, visible]);

  // Custom scroll indicator — replaces the native gray scrollbar thumb with a
  // thin green line that fades in while scrolling (right edge).
  const rootRef = useRef<HTMLDivElement>(null);
  const [scrollPct, setScrollPct] = useState(0);
  const [scrolling, setScrolling] = useState(false);
  const scrollTimer = useRef<number>();

  useEffect(() => {
    const el = rootRef.current;
    if (!el) return;
    let scrollEl: HTMLElement | null = el.parentElement;
    while (scrollEl && scrollEl !== document.body) {
      const cs = getComputedStyle(scrollEl);
      if (cs.overflowY === "auto" || cs.overflowY === "scroll") break;
      scrollEl = scrollEl.parentElement;
    }
    if (!scrollEl) return;
    const onScroll = () => {
      const max = scrollEl!.scrollHeight - scrollEl!.clientHeight;
      setScrollPct(max > 0 ? scrollEl!.scrollTop / max : 0);
      setScrolling(true);
      window.clearTimeout(scrollTimer.current);
      scrollTimer.current = window.setTimeout(() => setScrolling(false), 700);
    };
    scrollEl.addEventListener("scroll", onScroll, { passive: true });
    return () => { scrollEl?.removeEventListener("scroll", onScroll); window.clearTimeout(scrollTimer.current); };
  }, []);

  return (
    <div ref={rootRef} className="min-h-screen bg-[#070707] text-foreground pb-24 no-scrollbar">
      {/* Custom scroll indicator — thin green line, fades in on scroll */}
      <AnimatePresence>
        {scrolling && (
          <fm.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="pointer-events-none fixed right-1 top-16 bottom-4 z-40 w-[3px] rounded-full bg-white/[0.04]"
          >
            <div
              className="absolute w-full rounded-full bg-green shadow-[0_0_8px_hsl(152_72%_48%/0.6)]"
              style={{ height: "16%", top: `${scrollPct * 84}%` }}
            />
          </fm.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-[#070707]/85 backdrop-blur-xl pt-safe">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-5 pt-[52px] pb-3 sm:pt-[52px]">
          <button onClick={() => navigate(-1)} aria-label="Back" className="pressable -ml-1 flex h-9 w-9 items-center justify-center rounded-full text-foreground/80 hover:bg-white/[0.06]">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <h1 className="text-[17px] font-extrabold tracking-tight">Prompt Library</h1>
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-green"><Sparkles className="h-3.5 w-3.5" /> {prompts.length}</span>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-5">
        {/* Search */}
        <div className="mt-5 flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.04] px-3.5 h-12">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query} onChange={(e) => setQuery(e.target.value)}
            placeholder="Search prompts — landing page, marketing, react, claude…"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
          {query && <button onClick={() => setQuery("")} aria-label="Clear" className="pressable text-muted-foreground"><X className="h-4 w-4" /></button>}
        </div>

        {/* Generator */}
        <Generator reduce={!!reduce} />

        {/* Categories */}
        <div className="mt-6 flex gap-2 overflow-x-auto no-scrollbar pb-1">
          <Chip active={!category} onClick={() => setCategory(null)}>All</Chip>
          {PROMPT_CATEGORIES.map((c) => (
            <Chip key={c} active={category === c} onClick={() => setCategory(category === c ? null : c)}>
              <span className="mr-1">{CATEGORY_ICON[c]}</span>{c}
            </Chip>
          ))}
        </div>

        {/* Lanes */}
        {!query.trim() && !category && (
          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
            <Lane icon={<Flame className="h-3.5 w-3.5" />} label="Trending" active={lane === "trending"} onClick={() => setLane("trending")} />
            <Lane icon={<Star className="h-3.5 w-3.5" />} label="Editor's Picks" active={lane === "editor"} onClick={() => setLane("editor")} />
            <Lane icon={<Heart className="h-3.5 w-3.5" />} label="Saved" active={lane === "saved"} onClick={() => setLane("saved")} />
            <Lane icon={<Clock className="h-3.5 w-3.5" />} label="Recently Used" active={lane === "recent"} onClick={() => setLane("recent")} />
          </div>
        )}

        {/* Cards */}
        <div className="mt-5 flex flex-col gap-3">
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => <div key={i} className="skeleton h-[92px] rounded-2xl" />)
          ) : shown.length === 0 ? (
            <div className="py-16 text-center">
              <p className="text-[14px] font-bold">No prompts here yet</p>
              <p className="mt-1 text-[12.5px] text-muted-foreground">{lane === "saved" ? "Save prompts to build your collection." : "Try a different search or category."}</p>
            </div>
          ) : (
            shown.map((p) => <PromptCard key={p.id} prompt={p} onOpen={() => setDetail(p)} reduce={!!reduce} />)
          )}
        </div>

        {visible < prompts.length && (
          <button onClick={() => setVisible((v) => v + 12)} className="mt-5 w-full rounded-2xl border border-white/[0.08] bg-white/[0.03] py-3 text-[13px] font-semibold text-foreground/80 pressable hover:border-green/25 hover:text-green">
            Load More
          </button>
        )}
      </main>

      <AnimatePresence>
        {detail && <PromptDetail slug={detail.slug} onClose={() => setDetail(null)} onOpenRelated={(p) => setDetail(p)} />}
      </AnimatePresence>
    </div>
  );
}

// ── Generator ──────────────────────────────────────────────────────────────
function Generator({ reduce }: { reduce: boolean }) {
  const [intent, setIntent] = useState("");
  const [result, setResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const run = async (improve?: string) => {
    if (!intent.trim() && !improve) return;
    setBusy(true);
    const p = await generatePrompt(intent, improve);
    setResult(p); setBusy(false);
  };
  return (
    <div className="mt-4 rounded-2xl border border-green/20 bg-[linear-gradient(140deg,hsl(152_72%_48%/0.08),transparent)] p-4">
      <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-green"><Wand2 className="h-3.5 w-3.5" /> Generate Prompt</div>
      <div className="mt-2.5 flex items-center gap-2">
        <input value={intent} onChange={(e) => setIntent(e.target.value)} onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Describe what you want… e.g. a SaaS pricing page prompt"
          className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 h-10 text-[13.5px] outline-none placeholder:text-muted-foreground" />
        <button onClick={() => run()} disabled={busy || !intent.trim()} className="shrink-0 rounded-xl bg-green px-4 h-10 text-[13px] font-bold text-black pressable disabled:opacity-50">
          {busy ? "…" : "Generate"}
        </button>
      </div>
      {result && (
        <fm.div initial={reduce ? undefined : { opacity: 0, y: 6 }} animate={reduce ? undefined : { opacity: 1, y: 0 }} className="mt-3">
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-black/30 p-3 text-[12.5px] leading-relaxed text-foreground/85">{result}</pre>
          <div className="mt-2 flex gap-2">
            <button onClick={async () => { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-green/15 px-3 py-1.5 text-[12px] font-semibold text-green pressable">
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
            </button>
            <button onClick={() => run(result)} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-foreground/80 pressable"><Sparkles className="h-3.5 w-3.5" /> Improve</button>
            <button onClick={() => run()} className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.1] px-3 py-1.5 text-[12px] font-semibold text-foreground/80 pressable"><RefreshCw className="h-3.5 w-3.5" /> Regenerate</button>
          </div>
        </fm.div>
      )}
    </div>
  );
}

// ── Card + chips ─────────────────────────────────────────────────────────────
export function PromptCard({ prompt, onOpen, reduce }: { prompt: Prompt; onOpen: () => void; reduce: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (await copyPrompt(prompt)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };
  return (
    <fm.button onClick={onOpen} whileHover={reduce ? undefined : { y: -2 }} whileTap={reduce ? undefined : { scale: 0.99 }}
      className="group w-full rounded-2xl border border-white/[0.07] bg-white/[0.028] p-4 text-left transition-colors hover:border-green/20 hover:bg-white/[0.05]">
      <div className="flex items-start gap-3">
        <span className="text-[20px] leading-none">{CATEGORY_ICON[prompt.category] ?? "✨"}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold leading-snug text-foreground line-clamp-2">{prompt.title}</p>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-[11.5px] text-muted-foreground">
            <span className="font-semibold text-foreground/70">{prompt.category}</span>
            {prompt.supported_models?.[0] && <><span className="text-white/25">•</span><span>{prompt.supported_models[0]}</span></>}
            <span className="text-white/25">•</span><span className="inline-flex items-center gap-0.5 text-green"><Star className="h-3 w-3 fill-green" />{Number(prompt.rating).toFixed(1)}</span>
          </p>
        </div>
        <span onClick={doCopy} role="button" tabIndex={0}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[12px] font-semibold text-foreground/80 transition-colors hover:bg-green/15 hover:text-green">
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
        </span>
      </div>
    </fm.button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 h-9 text-[12.5px] font-semibold transition-colors pressable ${active ? "border-green bg-green text-black" : "border-white/[0.08] bg-white/[0.04] text-foreground/80 hover:border-green/25 hover:text-green"}`}>
      {children}
    </button>
  );
}
function Lane({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} className={`shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 h-8 text-[12px] font-semibold pressable ${active ? "border-green/40 bg-green/10 text-green" : "border-white/[0.08] text-foreground/70 hover:text-foreground"}`}>
      {icon}{label}
    </button>
  );
}

// ── Detail overlay ───────────────────────────────────────────────────────────
function PromptDetail({ slug, onClose, onOpenRelated }: { slug: string; onClose: () => void; onOpenRelated: (p: Prompt) => void }) {
  const reduce = useReducedMotion();
  const navigate = useNavigate();
  const [p, setP] = useState<Prompt | null>(null);
  const [related, setRelated] = useState<Prompt[]>([]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetchPrompt(slug).then(async (full) => {
      if (cancelled || !full) return;
      setP(full); trackView(full); setSaved(await isSaved(full.id));
      const rel = await searchPrompts(full.category, full.category, 6);
      setRelated(rel.filter((r) => r.slug !== slug).slice(0, 3));
    });
    return () => { cancelled = true; };
  }, [slug]);

  return (
    <fm.div className="fixed inset-0 z-50 flex flex-col" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <fm.div
        initial={reduce ? undefined : { y: "100%" }} animate={reduce ? undefined : { y: 0 }} exit={reduce ? undefined : { y: "100%" }}
        transition={{ type: "spring", stiffness: 320, damping: 34 }}
        className="relative z-10 mt-auto max-h-[92vh] overflow-auto rounded-t-3xl border-t border-white/10 bg-[#0b0f0d] p-5 pb-10"
      >
        <div className="mx-auto mb-3 h-1 w-10 rounded-full bg-white/15" />
        {!p ? <div className="skeleton h-40 rounded-2xl" /> : (
          <div className="mx-auto max-w-2xl">
            <div className="flex items-start gap-3">
              <span className="text-[26px] leading-none">{CATEGORY_ICON[p.category] ?? "✨"}</span>
              <div className="min-w-0 flex-1">
                <h2 className="text-[20px] font-extrabold leading-tight">{p.title}</h2>
                <p className="mt-1 text-[12px] text-muted-foreground">{p.category} • {p.difficulty} • <span className="text-green">★ {Number(p.rating).toFixed(1)}</span></p>
              </div>
              <button onClick={onClose} aria-label="Close" className="pressable text-muted-foreground"><X className="h-5 w-5" /></button>
            </div>

            {p.description && <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/80">{p.description}</p>}

            <div className="mt-3 flex flex-wrap gap-1.5">
              {p.supported_models?.map((m) => <span key={m} className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-foreground/75">{m}</span>)}
              {p.tags?.slice(0, 5).map((t) => <span key={t} className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-muted-foreground">#{t}</span>)}
            </div>

            <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-black/40 p-4 text-[12.5px] leading-relaxed text-foreground/90">{p.prompt_text}</pre>

            <div className="mt-4 flex flex-wrap gap-2">
              <button onClick={async () => { if (await copyPrompt(p)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-green px-4 h-11 text-[14px] font-bold text-black pressable">
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{copied ? "Copied" : "Copy Prompt"}
              </button>
              <button onClick={async () => setSaved(await toggleSave(p))} aria-label="Save"
                className={`inline-flex items-center gap-1.5 rounded-xl border px-4 h-11 text-[13px] font-semibold pressable ${saved ? "border-green/40 bg-green/10 text-green" : "border-white/[0.12] text-foreground/80"}`}>
                <Bookmark className={`h-4 w-4 ${saved ? "fill-green" : ""}`} /> {saved ? "Saved" : "Save"}
              </button>
              <button onClick={() => { track(p.id, "open_ask"); navigate("/", { state: { openAsk: true, article: { headline: p.title, summary: p.description, article_url: "" } } }); }}
                className="inline-flex items-center gap-1.5 rounded-xl border border-green/40 px-4 h-11 text-[13px] font-semibold text-green pressable">
                <Sparkles className="h-4 w-4" /> Ask Signal
              </button>
            </div>

            {related.length > 0 && (
              <div className="mt-6">
                <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Related prompts</p>
                <div className="flex flex-col gap-2">
                  {related.map((r) => (
                    <button key={r.id} onClick={() => onOpenRelated(r)} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left pressable hover:border-green/20">
                      <span>{CATEGORY_ICON[r.category] ?? "✨"}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{r.title}</span>
                      <ArrowRight className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </fm.div>
    </fm.div>
  );
}
