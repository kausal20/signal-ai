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
  const cache = useRef<Map<string, Intelligence>>(new Map());
  const activeId = useRef<string | null>(null);

  const generate = useCallback(async (article: IntelligenceArticle) => {
    if (!article?.id) return;
    activeId.current = article.id;

    // Session cache — instant reopen, no refetch.
    const hit = cache.current.get(article.id);
    if (hit) { setData(hit); setStatus("ready"); setError(null); return; }

    setStatus("loading");
    setError(null);
    setData(null);

    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("news-intelligence", {
        body: {
          article_id: article.id,
          article: {
            title: article.title,
            summary: article.summary,
            why_it_matters: article.why_it_matters,
            source: article.source,
            tag: article.tag,
          },
        },
      });

      // Ignore a stale response if the user moved to a different article.
      if (activeId.current !== article.id) return;

      if (fnErr) { setStatus("error"); setError("Unable to reach the intelligence service."); return; }
      if (!res?.ok) {
        setStatus("error");
        setError(res?.error ?? "Unable to generate intelligence.");
        return;
      }
      const intel = res.intelligence as Intelligence;
      cache.current.set(article.id, intel);
      setData(intel);
      setStatus("ready");
    } catch (e) {
      if (activeId.current !== article.id) return;
      setStatus("error");
      setError(e instanceof Error ? e.message : "Unable to generate intelligence.");
    }
  }, []);

  const reset = useCallback(() => {
    activeId.current = null;
    setStatus("idle");
    setData(null);
    setError(null);
  }, []);

  return { status, data, error, generate, reset };
}
