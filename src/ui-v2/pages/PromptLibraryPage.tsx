// signal-ui-v2 · pages/PromptLibraryPage.tsx
// ---------------------------------------------------------------------------
// Prompt Library workspace (/prompts) — presentation swap only. Same data
// layer (lib/prompts.ts), same search/filter/lane/pagination/generator/detail
// logic as the old pages/PromptLibrary.tsx, restyled to the ui-v2 tokens
// (ScreenShell chrome, SectionHeader, SignalButton, SignalModal).
//
// Self-contained by design, not props-driven — same precedent as the existing
// ui-v2 PromptLibraryPreview component, since lib/prompts.ts is already this
// feature's own self-contained data layer (no shared app state involved, so
// there's nothing another page needs threaded through props here).
//
// Replaces production: pages/PromptLibrary.tsx.
// ---------------------------------------------------------------------------
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion as fm, useReducedMotion } from "framer-motion";
import {
  ChevronLeft, Search, Sparkles, Copy, Check, Bookmark, ArrowRight,
  Flame, Star, Heart, Clock, Wand2, X, RefreshCw,
} from "lucide-react";
import { ScreenShell } from "../layouts/ScreenShell";
import { SectionHeader } from "../components/SectionHeader";
import { SignalButton } from "../components/SignalButton";
import { SignalModal } from "../components/SignalModal";
import {
  PROMPT_CATEGORIES, CATEGORY_ICON, searchPrompts, fetchSaved, fetchRecent,
  fetchPrompt, toggleSave, copyPrompt, generatePrompt, trackView, isSaved,
  track, type Prompt,
} from "@/lib/prompts";

type Lane = "trending" | "editor" | "saved" | "recent";

export function PromptLibraryPage() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [query, setQuery] = useState("");
  const [focused, setFocused] = useState(false);
  const [category, setCategory] = useState<string | null>(null);
  const [lane, setLane] = useState<Lane>("trending");
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(12);
  const [detail, setDetail] = useState<Prompt | null>(null);
  const debounce = useRef<number>();

  const load = useCallback(async () => {
    setLoading(true);
    let rows: Prompt[] = [];
    if (query.trim() || category) rows = await searchPrompts(query, category, 60);
    else if (lane === "saved") rows = await fetchSaved();
    else if (lane === "recent") rows = await fetchRecent();
    else rows = await searchPrompts("", null, 60);
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
  const filtering = !!query.trim() || !!category;
  const sectionTitle = filtering
    ? "Results"
    : lane === "trending" ? "Trending"
    : lane === "editor" ? "Editor's Picks"
    : lane === "saved" ? "Saved"
    : "Recently Used";

  const header = (
    <div className="flex items-center gap-3.5 bg-[linear-gradient(to_bottom,hsl(0_0%_3%/0.96)_72%,transparent)] px-5 pb-3 pt-12">
      <button
        type="button"
        onClick={() => navigate(-1)}
        aria-label="Back"
        className="flex h-[38px] w-[38px] items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.05] text-foreground/80 transition-transform active:scale-90"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <h1 className="text-xl font-extrabold tracking-[-0.02em] text-foreground">Prompt Library</h1>
      <span className="ml-auto inline-flex items-center gap-1 text-[11px] font-semibold text-green">
        <Sparkles className="h-3.5 w-3.5" /> {prompts.length}
      </span>
    </div>
  );

  return (
    <ScreenShell header={header} bodyClassName="px-5 pb-24 pt-1">
      <div className="mx-auto w-full max-w-2xl">
        {/* Search */}
        <div
          className={`mt-4 flex h-12 items-center gap-2 rounded-[20px] border px-3.5 backdrop-blur-xl transition-[border-color,box-shadow] duration-200 ${
            focused ? "border-green/70 shadow-[0_0_0_3px_hsl(152_72%_48%/0.10)]" : "border-white/[0.08]"
          } bg-white/[0.04]`}
        >
          <Search className={`h-4 w-4 shrink-0 transition-colors ${focused ? "text-green" : "text-muted-foreground"}`} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Search prompts — landing page, marketing, react, claude…"
            className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-muted-foreground"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} aria-label="Clear" className="text-muted-foreground active:scale-90">
              <X className="h-4 w-4" />
            </button>
          )}
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
        {!filtering && (
          <div className="mt-4 flex gap-2 overflow-x-auto no-scrollbar">
            <LaneTab icon={<Flame className="h-3.5 w-3.5" />} label="Trending" active={lane === "trending"} onClick={() => setLane("trending")} />
            <LaneTab icon={<Star className="h-3.5 w-3.5" />} label="Editor's Picks" active={lane === "editor"} onClick={() => setLane("editor")} />
            <LaneTab icon={<Heart className="h-3.5 w-3.5" />} label="Saved" active={lane === "saved"} onClick={() => setLane("saved")} />
            <LaneTab icon={<Clock className="h-3.5 w-3.5" />} label="Recently Used" active={lane === "recent"} onClick={() => setLane("recent")} />
          </div>
        )}

        {/* Section header + cards */}
        <div className="mt-6">
          <SectionHeader
            title={sectionTitle}
            action={<span className="font-mono-tight text-[11px] font-semibold text-green">{prompts.length}</span>}
          />
          <div className="flex flex-col gap-3">
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => <div key={i} className="motion-wave-shimmer h-[92px] rounded-2xl" />)
            ) : shown.length === 0 ? (
              <div className="py-16 text-center">
                <p className="text-[14px] font-bold text-foreground">No prompts here yet</p>
                <p className="mt-1 text-[12.5px] text-muted-foreground">
                  {lane === "saved" ? "Save prompts to build your collection." : "Try a different search or category."}
                </p>
              </div>
            ) : (
              shown.map((p) => <PromptCard key={p.id} prompt={p} onOpen={() => setDetail(p)} reduce={!!reduce} />)
            )}
          </div>

          {visible < prompts.length && (
            <SignalButton variant="secondary" fullWidth size="md" className="mt-4" onClick={() => setVisible((v) => v + 12)}>
              Load More
            </SignalButton>
          )}
        </div>
      </div>

      <SignalModal open={!!detail} onClose={() => setDetail(null)} variant="sheet" labelledBy="prompt-detail-title" className="max-w-2xl">
        {detail && (
          <PromptDetailContent
            slug={detail.slug}
            onClose={() => setDetail(null)}
            onOpenRelated={(p) => setDetail(p)}
          />
        )}
      </SignalModal>
    </ScreenShell>
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
      <div className="flex items-center gap-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-green">
        <Wand2 className="h-3.5 w-3.5" /> Generate Prompt
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <input
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && run()}
          placeholder="Describe what you want… e.g. a SaaS pricing page prompt"
          className="min-w-0 flex-1 rounded-xl border border-white/[0.08] bg-white/[0.04] px-3 h-10 text-[13.5px] outline-none placeholder:text-muted-foreground"
        />
        <SignalButton size="sm" onClick={() => run()} disabled={busy || !intent.trim()}>
          {busy ? "…" : "Generate"}
        </SignalButton>
      </div>
      {result && (
        <fm.div initial={reduce ? undefined : { opacity: 0, y: 6 }} animate={reduce ? undefined : { opacity: 1, y: 0 }} className="mt-3">
          <pre className="max-h-52 overflow-auto whitespace-pre-wrap rounded-xl border border-white/[0.08] bg-black/30 p-3 text-[12.5px] leading-relaxed text-foreground/85">{result}</pre>
          <div className="mt-2 flex gap-2">
            <SignalButton
              size="sm" variant="secondary"
              onClick={async () => { await navigator.clipboard.writeText(result); setCopied(true); setTimeout(() => setCopied(false), 1400); }}
              iconLeft={copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            >
              {copied ? "Copied" : "Copy"}
            </SignalButton>
            <SignalButton size="sm" variant="secondary" onClick={() => run(result)} iconLeft={<Sparkles className="h-3.5 w-3.5" />}>Improve</SignalButton>
            <SignalButton size="sm" variant="secondary" onClick={() => run()} iconLeft={<RefreshCw className="h-3.5 w-3.5" />}>Regenerate</SignalButton>
          </div>
        </fm.div>
      )}
    </div>
  );
}

// ── Card + chips ─────────────────────────────────────────────────────────────
function PromptCard({ prompt, onOpen, reduce }: { prompt: Prompt; onOpen: () => void; reduce: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (await copyPrompt(prompt)) { setCopied(true); setTimeout(() => setCopied(false), 1500); }
  };
  return (
    <fm.button
      onClick={onOpen}
      whileHover={reduce ? undefined : { y: -2 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      className="group w-full rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition-colors hover:border-green/20 hover:bg-white/[0.05]"
    >
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
        <span
          onClick={doCopy} role="button" tabIndex={0}
          className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2.5 py-1.5 text-[12px] font-semibold text-foreground/80 transition-colors hover:bg-green/15 hover:text-green"
        >
          {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
        </span>
      </div>
    </fm.button>
  );
}

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 h-9 text-[12.5px] font-semibold transition-colors ${
        active ? "border-green bg-green text-black" : "border-white/[0.08] bg-white/[0.04] text-foreground/80 hover:border-green/25 hover:text-green"
      }`}
    >
      {children}
    </button>
  );
}

function LaneTab({ icon, label, active, onClick }: { icon: React.ReactNode; label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-3 h-8 text-[12px] font-semibold transition-colors ${
        active ? "border-green/40 bg-green/10 text-green" : "border-white/[0.08] text-foreground/70 hover:text-foreground"
      }`}
    >
      {icon}{label}
    </button>
  );
}

// ── Detail sheet content (rendered inside SignalModal) ──────────────────────
function PromptDetailContent({ slug, onClose, onOpenRelated }: { slug: string; onClose: () => void; onOpenRelated: (p: Prompt) => void }) {
  const navigate = useNavigate();
  const [p, setP] = useState<Prompt | null>(null);
  const [related, setRelated] = useState<Prompt[]>([]);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setP(null);
    fetchPrompt(slug).then(async (full) => {
      if (cancelled || !full) return;
      setP(full); trackView(full); setSaved(await isSaved(full.id));
      const rel = await searchPrompts(full.category, full.category, 6);
      setRelated(rel.filter((r) => r.slug !== slug).slice(0, 3));
    });
    return () => { cancelled = true; };
  }, [slug]);

  if (!p) return <div className="motion-wave-shimmer h-40 rounded-2xl" />;

  return (
    <div id="prompt-detail-title">
      <div className="flex items-start gap-3">
        <span className="text-[26px] leading-none">{CATEGORY_ICON[p.category] ?? "✨"}</span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[20px] font-extrabold leading-tight text-foreground">{p.title}</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">{p.category} • {p.difficulty} • <span className="text-green">★ {Number(p.rating).toFixed(1)}</span></p>
        </div>
        <button type="button" onClick={onClose} aria-label="Close" className="text-muted-foreground active:scale-90"><X className="h-5 w-5" /></button>
      </div>

      {p.description && <p className="mt-3 text-[13.5px] leading-relaxed text-foreground/80">{p.description}</p>}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {p.supported_models?.map((m) => <span key={m} className="rounded-full border border-white/[0.1] bg-white/[0.04] px-2.5 py-0.5 text-[11px] font-semibold text-foreground/75">{m}</span>)}
        {p.tags?.slice(0, 5).map((t) => <span key={t} className="rounded-full bg-white/[0.04] px-2.5 py-0.5 text-[11px] text-muted-foreground">#{t}</span>)}
      </div>

      <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/[0.08] bg-black/40 p-4 text-[12.5px] leading-relaxed text-foreground/90">{p.prompt_text}</pre>

      <div className="mt-4 flex flex-wrap gap-2">
        <SignalButton
          size="lg" className="flex-1"
          onClick={async () => { if (await copyPrompt(p)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
          iconLeft={copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        >
          {copied ? "Copied" : "Copy Prompt"}
        </SignalButton>
        <SignalButton
          size="lg" variant={saved ? "primary" : "secondary"}
          onClick={async () => setSaved(await toggleSave(p))}
          iconLeft={<Bookmark className={`h-4 w-4 ${saved ? "fill-current" : ""}`} />}
        >
          {saved ? "Saved" : "Save"}
        </SignalButton>
        <SignalButton
          size="lg" variant="secondary" className="border-green/40 text-green"
          onClick={() => { track(p.id, "open_ask"); navigate("/", { state: { openAsk: true, article: { headline: p.title, summary: p.description, article_url: "" } } }); }}
          iconLeft={<Sparkles className="h-4 w-4" />}
        >
          Ask Signal
        </SignalButton>
      </div>

      {related.length > 0 && (
        <div className="mt-6">
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">Related prompts</p>
          <div className="flex flex-col gap-2">
            {related.map((r) => (
              <button key={r.id} type="button" onClick={() => onOpenRelated(r)} className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3 text-left hover:border-green/20">
                <span>{CATEGORY_ICON[r.category] ?? "✨"}</span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-foreground">{r.title}</span>
                <ArrowRight className="h-4 w-4 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
