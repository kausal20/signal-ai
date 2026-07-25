// useArticleSummary — lazy Signal Summary loader keyed on article_id.
// Calls the `article-summary` edge function (cache-first on the server; the
// function persists the generated summary back to content_archive so subsequent
// calls hit its cache). Falls back silently to the passed `fallback` (usually
// the article excerpt) if the API returns nothing so the card is never blank.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const inflight = new Map<string, Promise<string | null>>();
const cache = new Map<string, string | null>();

async function loadSummary(articleId: string): Promise<string | null> {
  if (cache.has(articleId)) return cache.get(articleId) ?? null;
  let p = inflight.get(articleId);
  if (!p) {
    p = (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("article-summary", { body: { article_id: articleId } });
        if (error) return null;
        const s = (data?.summary as string | null | undefined) ?? null;
        cache.set(articleId, s);
        return s;
      } catch { return null; } finally { inflight.delete(articleId); }
    })();
    inflight.set(articleId, p);
  }
  return p;
}

export function useArticleSummary(articleId?: string, fallback?: string): { summary: string | undefined; loading: boolean } {
  const [summary, setSummary] = useState<string | undefined>(articleId && cache.has(articleId) ? (cache.get(articleId) ?? undefined) : undefined);
  const [loading, setLoading] = useState(!!articleId && !cache.has(articleId));
  const last = useRef<string | undefined>();
  useEffect(() => {
    if (!articleId) { setSummary(undefined); setLoading(false); return; }
    if (last.current === articleId) return;
    last.current = articleId;
    if (cache.has(articleId)) { setSummary(cache.get(articleId) ?? undefined); setLoading(false); return; }
    setLoading(true);
    let cancelled = false;
    loadSummary(articleId).then((s) => { if (!cancelled) { setSummary(s ?? undefined); setLoading(false); } });
    return () => { cancelled = true; };
  }, [articleId]);
  return { summary: summary ?? fallback, loading };
}
