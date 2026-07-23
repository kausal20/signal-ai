// useSignalSearch — archive-wide search via the `search` edge function.
//
// Debounced. Returns ui-v2 Signals ranked across ALL news (not just today's
// feed) plus related topics + "did you mean" suggestions. Search is backend
// only; failures are logged so deployment/CORS/RLS problems are visible.
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { sourceKeyFor, sourceLabelFor, formatTimeAgo } from "@/adapters/homeV2";
import type { Signal } from "@/ui-v2/shared/types";

interface SearchRow {
  id: string; title: string; summary?: string; why_it_matters?: string;
  url?: string; tag?: string; source?: string; source_label?: string;
  category?: string; content_category?: string; score?: number;
  published_at?: string; trend_entities?: string[];
  // Publisher (real site) + section/content-type/editorial from the search RPC.
  publisher?: string; publisher_domain?: string; original_url?: string;
  content_type?: string; section?: string;
  is_official_company_news?: boolean; is_official_source?: boolean;
  event_type?: string; editorial_quality_score?: number;
}

function rowToSignal(r: SearchRow): Signal {
  // SOURCE = the real publisher (never the ingestion connector / company).
  const publisher = (r.publisher && r.publisher.trim())
    ? r.publisher.trim()
    : sourceLabelFor(r.source_label || r.source || "");
  // Logo keys off the publisher domain/name when we have a bundled brand asset.
  const key = sourceKeyFor(r.publisher_domain || "") || sourceKeyFor(publisher);
  // Source button must open the REAL article, not a Google-News redirect.
  const url = typeof (r.original_url || r.url) === "string" ? (r.original_url || r.url) : undefined;
  let domain = r.publisher_domain || "";
  if (!domain && url) { try { domain = new URL(url).hostname.replace(/^www\./, ""); } catch { /* ignore */ } }
  return {
    id: r.id,
    title: r.title,
    source: publisher,
    sourceKey: key,
    score: Math.round(r.score ?? 0),
    tag: r.tag as Signal["tag"],
    timeAgo: r.published_at ? formatTimeAgo(r.published_at) : undefined,
    takeaway: r.why_it_matters || undefined,
    url,
    domain: domain || undefined,
    publishedAt: r.published_at,
    verified: !!key,
    section: r.section || undefined,
    contentType: r.content_type || undefined,
    eventType: r.event_type || undefined,
    isOfficial: r.is_official_source === true,
  };
}

export interface RelatedProduct { name: string; type: string; slug: string; }

export interface SignalSearchState {
  results: Signal[];
  related: string[];
  /** Related Products — entity-derived, ranked (products > companies > tech). */
  relatedProducts: RelatedProduct[];
  /** What the backend actually returned: products / companies / technologies / none. */
  relatedFallback: "products" | "companies" | "technologies" | "none";
  suggestions: string[];
  loading: boolean;
  ready: boolean;   // a backend response was received for the current query
  error: string | null;
  /** Set to "trending" when backend returned fallback content instead of real matches. */
  fallback: string | null;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  return "The search service returned an unknown error.";
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const context = (error as { context?: { status?: number } }).context;
  return typeof context?.status === "number" ? context.status : null;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function invokeBackendSearch(q: string) {
  const maxAttempts = 4;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    console.info("[Signal search] Sending backend request", {
      endpoint: "/functions/v1/search",
      query: q,
      attempt,
    });

    // NOTE: send no custom headers. The edge function's CORS allow-list is
    // `authorization, x-client-info, apikey, content-type`; any extra header
    // (e.g. x-region) makes the browser preflight fail → every search errors.
    const response = await supabase.functions.invoke("search", { body: { q } });
    const rows = Array.isArray(response.data?.results) ? response.data.results : [];

    if (!response.error && response.data) {
      console.info("[Signal search] Backend response", {
        query: q,
        attempt,
        resultCount: rows.length,
        fallback: response.data.fallback ?? null,
      });
      return response;
    }

    const status = errorStatus(response.error);
    const message = response.error
      ? errorMessage(response.error)
      : "The search service returned no response.";
    const retryable = attempt < maxAttempts;
    console.warn("[Signal search] Backend search attempt failed", {
      query: q,
      attempt,
      status,
      retryable,
      message,
      error: response.error,
    });

    if (!retryable) return response;
    await wait(250 * attempt);
  }

  return { data: null, error: new Error("The search service did not respond.") };
}

export function useSignalSearch(query: string, enabled: boolean): SignalSearchState {
  const [state, setState] = useState<SignalSearchState>({ results: [], related: [], suggestions: [], loading: false, ready: false, error: null, fallback: null });
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (!enabled || q.length < 2) {
      setState({ results: [], related: [], relatedProducts: [], relatedFallback: "none", suggestions: [], loading: false, ready: false, error: null, fallback: null });
      return;
    }
    const mySeq = ++seq.current;
    setState((s) => ({ ...s, loading: true }));

    const t = setTimeout(async () => {
      try {
        const { data, error } = await invokeBackendSearch(q);
        if (mySeq !== seq.current) return;                 // stale response
        if (error || !data) {
          const message = error ? errorMessage(error) : "The search service returned no response.";
          console.error("[Signal search] Backend search failed", { query: q, message, error });
          setState({ results: [], related: [], relatedProducts: [], relatedFallback: "none", suggestions: [], loading: false, ready: false, error: message, fallback: null });
          return;
        }
        const rows: SearchRow[] = Array.isArray(data.results) ? data.results : [];
        setState({
          results: rows.map(rowToSignal),
          related: Array.isArray(data.related) ? data.related : [],
          relatedProducts: Array.isArray(data.related_products) ? data.related_products : [],
          relatedFallback: (["products", "companies", "technologies", "none"] as const).includes(data.related_fallback) ? data.related_fallback : "none",
          suggestions: Array.isArray(data.suggestions) ? data.suggestions : [],
          loading: false,
          ready: true,
          error: null,
          fallback: typeof data.fallback === "string" ? data.fallback : null,
        });
      } catch (error) {
        if (mySeq === seq.current) {
          const message = errorMessage(error);
          console.error("[Signal search] Backend search request threw", { query: q, message, error });
          setState({ results: [], related: [], relatedProducts: [], relatedFallback: "none", suggestions: [], loading: false, ready: false, error: message, fallback: null });
        }
      }
    }, 250);

    return () => clearTimeout(t);
  }, [query, enabled]);

  return state;
}
