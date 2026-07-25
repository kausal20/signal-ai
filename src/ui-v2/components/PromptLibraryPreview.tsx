// PromptLibraryPreview — Advisor's compact Prompt Library section. Shows three
// backend-featured prompts (title · category icon · Copy). Card tap opens the
// prompt; "View All →" opens the full /prompts workspace. Never shows the full
// prompt text here — keeps the Advisor clean.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion as fm, useReducedMotion } from "framer-motion";
import { Sparkles, Copy, Check, ArrowRight } from "lucide-react";
import { SectionHeader } from "./SectionHeader";
import { fetchFeatured, copyPrompt, CATEGORY_ICON, type Prompt } from "@/lib/prompts";

export function PromptLibraryPreview() {
  const navigate = useNavigate();
  const reduce = useReducedMotion();
  const [prompts, setPrompts] = useState<Prompt[] | null>(null);

  useEffect(() => { let c = false; fetchFeatured(3).then((r) => { if (!c) setPrompts(r); }); return () => { c = true; }; }, []);

  return (
    <div>
      <SectionHeader
        title="Prompt Library"
        action={
          <button onClick={() => navigate("/prompts")} className="inline-flex items-center gap-0.5 text-[12px] font-semibold text-green pressable">
            View All <ArrowRight className="h-3.5 w-3.5" />
          </button>
        }
      />
      <p className="mb-3 text-[13px] leading-snug text-muted-foreground">Discover, copy and generate professional AI prompts.</p>

      <div className="flex flex-col gap-2.5">
        {prompts === null
          ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="skeleton h-[52px] rounded-xl" />)
          : prompts.map((p) => <PreviewRow key={p.id} prompt={p} onOpen={() => navigate("/prompts")} reduce={!!reduce} />)}
      </div>
    </div>
  );
}

function PreviewRow({ prompt, onOpen, reduce }: { prompt: Prompt; onOpen: () => void; reduce: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <fm.button
      onClick={onOpen}
      whileHover={reduce ? undefined : { y: -1 }}
      whileTap={reduce ? undefined : { scale: 0.99 }}
      className="flex w-full items-center gap-3 rounded-[14px] border border-white/[0.07] bg-white/[0.028] px-3.5 py-3 text-left transition-colors hover:border-green/20 hover:bg-white/[0.05]"
    >
      <span className="text-[17px] leading-none">{CATEGORY_ICON[prompt.category] ?? "✨"}</span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-foreground">{prompt.title}</span>
      <span
        role="button" tabIndex={0}
        onClick={async (e) => { e.stopPropagation(); if (await copyPrompt(prompt)) { setCopied(true); setTimeout(() => setCopied(false), 1500); } }}
        className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-white/[0.05] px-2.5 py-1 text-[11.5px] font-semibold text-foreground/80 transition-colors hover:bg-green/15 hover:text-green"
      >
        {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}{copied ? "Copied" : "Copy"}
      </span>
    </fm.button>
  );
}
