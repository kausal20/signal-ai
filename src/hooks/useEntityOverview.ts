// useEntityOverview — resolves a search query to a recognized AI entity and
// fetches the cached 3-line Signal AI Overview from the `entity-overview` edge
// function. Debounced, cache-first on the server side, and cheap to unmount:
// returns { overview: null } when the query isn't a recognized entity, so the
// UI hides the section entirely without any placeholder.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface EntityOverviewResult {
  overview: string | null;
  entity: { slug: string; name: string; type: string } | null;
  sources: Array<{ title: string; url: string | null; publisher: string | null; published_at: string | null; official?: boolean }>;
  loading: boolean;
  error: string | null;
}

const EMPTY: EntityOverviewResult = { overview: null, entity: null, sources: [], loading: false, error: null };

export function useEntityOverview(rawQuery: string): EntityOverviewResult {
  const query = rawQuery.trim();
  const [state, setState] = useState<EntityOverviewResult>(EMPTY);
  const lastQuery = useRef<string>("");
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!query || query.length < 2) {
      lastQuery.current = "";
      setState(EMPTY);
      return;
    }
    if (query === lastQuery.current) return;
    lastQuery.current = query;

    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setState((s) => ({ ...s, loading: true, error: null }));
      try {
        const { data, error } = await supabase.functions.invoke("entity-overview", { body: { query } });
        if (ctrl.signal.aborted) return;
        if (error) throw error;
        setState({
          overview: (data?.overview as string) ?? null,
          entity: (data?.entity as EntityOverviewResult["entity"]) ?? null,
          sources: (data?.sources as EntityOverviewResult["sources"]) ?? [],
          loading: false,
          error: null,
        });
      } catch (e) {
        if (ctrl.signal.aborted) return;
        setState({ ...EMPTY, error: e instanceof Error ? e.message : String(e) });
      }
    }, 250);

    return () => { clearTimeout(timer); abortRef.current?.abort(); };
  }, [query]);

  return state;
}
