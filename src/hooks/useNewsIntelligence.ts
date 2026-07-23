// useNewsIntelligence — lazy, on-demand AI intelligence for one article.
//
// Never runs automatically; call `generate()` (e.g. when the user opens the
// AI Intelligence sheet). Results are cached per article id for the session so
// re-opening is instant. Additive: talks only to the new `news-intelligence`
// edge function; no existing data flow is touched.
import { useCallback, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AffectedGroup {
  group: "Developers" | "Students" | "Businesses" | "Creators" | "Researchers";
  impact: "High" | "Medium" | "Low" | "None";
  note: string;
}

export interface Intelligence {
  // Structured editorial analysis (Signal Analysis).
  event_type?: string;
  executive_summary?: string;
  why_matters?: { business: string; technology: string; market: string };
  who_wins?: string[];
  who_loses?: string[];
  market_impact?: string;
  timeline?: { past: string; present: string; next: string };
  related_companies?: string[];
  impact_score?: number;
  // Full Signal Analysis sections.
  relevance?: { audience: string; stars: number }[];
  technology_breakdown?: string[];
  scores?: { business: number; technology: number; market: number; innovation: number };
  confidence_label?: "Low" | "Medium" | "High";
  related_stories?: { title: string; url: string; publisher: string; published_at: string; source_type: string }[];
  // Legacy / shared fields.
  summary: string;
  why_it_matters: string;
  affected_groups: AffectedGroup[];
  importance_score: number;
  key_takeaways: string[];
  related_topics: string[];
  confidence: number;
}

export interface IntelligenceArticle {
  id: string;
  title: string;
  summary?: string;
  why_it_matters?: string;
  source?: string;
  tag?: string;
  // Source attribution (surfaced in the sheet; not sent to the model).
  sourceKey?: string;
  url?: string;
  verified?: boolean;
}

type Status = "idle" | "loading" | "ready" | "error";

export function useNewsIntelligence() {
  const [status, setStatus] = useState<Status>("idle");
  const [data, setData] = useState<Intelligence | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Phases still in flight → the sheet keeps skeletons only for those sections.
  const [pending, setPending] = useState<Set<"core" | "deep">>(new Set());
  const cache = useRef<Map<string, Intelligence>>(new Map());
  const activeId = useRef<string | null>(null);

  const generate = useCallback(async (article: IntelligenceArticle) => {
    if (!article?.id) return;
    activeId.current = article.id;

    // Session cache — instant reopen, no skeletons at all.
    const hit = cache.current.get(article.id);
    if (hit) { setData(hit); setStatus("ready"); setError(null); setPending(new Set()); return; }

    setStatus("loading");
    setError(null);
    setData(null);
    setPending(new Set(["core", "deep"]));

    const body = (phase: string) => ({
      article_id: article.id,
      phase,
      article: {
        title: article.title,
        summary: article.summary,
        why_it_matters: article.why_it_matters,
        source: article.source,
        tag: article.tag,
      },
    });
    const call = (phase: string) => supabase.functions.invoke("news-intelligence", { body: body(phase) });
    const fresh = () => activeId.current === article.id;
    const merge = (partial: Partial<Intelligence>) =>
      setData((prev) => ({ ...(prev ?? ({} as Intelligence)), ...partial }) as Intelligence);
    const donePhase = (p: "core" | "deep") =>
      setPending((prev) => { const n = new Set(prev); n.delete(p); return n; });

    // 1) Instant (no AI): related stories land in well under a second.
    call("instant").then(({ data: res }) => {
      if (!fresh() || !res?.ok) return;
      merge({ related_stories: res.related_stories ?? [] });
    }).catch(() => { /* non-critical */ });

    // 2) Core + 3) Deep run in PARALLEL; each renders the moment it lands.
    const corePromise = call("core").then(({ data: res, error: fnErr }) => {
      if (!fresh()) return;
      if (fnErr || !res?.ok) {
        setError(res?.error ?? "Unable to generate intelligence.");
        setStatus((s) => (s === "ready" ? s : "error"));
        donePhase("core");
        return;
      }
      merge({ ...(res.intelligence as Partial<Intelligence>), related_stories: res.related_stories ?? undefined });
      setStatus("ready");            // content is on screen; deep may still be loading
      donePhase("core");
    }).catch(() => { if (fresh()) { setStatus("error"); donePhase("core"); } });

    const deepPromise = call("deep").then(({ data: res }) => {
      if (!fresh() || !res?.ok) { donePhase("deep"); return; }
      merge(res.intelligence as Partial<Intelligence>);
      donePhase("deep");
    }).catch(() => { if (fresh()) donePhase("deep"); });

    await Promise.allSettled([corePromise, deepPromise]);
    // Cache the merged report for instant reopen (only when core produced content).
    setData((prev) => {
      if (fresh() && prev?.executive_summary) cache.current.set(article.id, prev);
      return prev;
    });
  }, []);

  const reset = useCallback(() => {
    activeId.current = null;
    setStatus("idle");
    setData(null);
    setError(null);
    setPending(new Set());
  }, []);

  return { status, data, error, pending, generate, reset };
}
