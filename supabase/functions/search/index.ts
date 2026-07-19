// search — intelligent, archive-wide search for Signal. Full-text + fuzzy +
// alias expansion, multi-factor ranking, related topics, "did you mean", and a
// trending fallback so the page is NEVER empty. Additive: reads feed_items via
// the signal_search / signal_trending RPCs; changes no existing function.
//
// POST { q: string, limit?: number }
// 200 {
//   results: Row[], related: string[], suggestions: string[],
//   total_results: number, search_time: number, matched_fields: string[],
//   fallback?: "trending"
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import {
  toTsQuery, scoreCandidate, relatedTopics, didYouMean, expandQuery,
  type SearchCandidate,
} from "../_shared/search.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const t0 = Date.now();

  let q = "", limit = 30;
  try {
    const body = await req.json();
    q = (body?.q ?? "").toString().trim();
    limit = Math.min(60, Math.max(1, Number(body?.limit) || 30));
  } catch { /* ignore */ }
  console.info("[search] Incoming query", { q, limit });

  const trendingFallback = async (extra: Record<string, unknown> = {}) => {
    const { data, error } = await supabase.rpc("signal_trending", { max_results: 12 });
    if (error) console.error("[search] Trending fallback RPC failed", { q, message: error.message, code: error.code });
    console.info("[search] Returning trending fallback", { q, returnedCount: data?.length ?? 0, reason: extra.note ?? "no_direct_match" });
    return json({
      results: data ?? [],
      related: [], suggestions: didYouMean(q),
      total_results: (data ?? []).length,
      search_time: Date.now() - t0, matched_fields: [],
      fallback: "trending", ...extra,
    });
  };

  // Empty query → trending (discovery), never an empty page.
  if (!q) return await trendingFallback();

  try {
    const expanded = expandQuery(q);
    const qTs = toTsQuery(q);
    console.info("[search] Expanded query", { q, expanded, qTs });
    const { data, error } = await supabase.rpc("signal_search", {
      q_ts: qTs,
      q_raw: q,
      max_results: limit,
    });
    console.info("[search] RPC response", { q, rowCount: data?.length ?? 0, error: error?.message ?? null, code: error?.code ?? null });
    if (error) {
      console.error("[search] Search RPC failed", { q, message: error.message, code: error.code });
      return await trendingFallback({ note: "search_rpc_error" });
    }

    const rows = (data ?? []) as SearchCandidate[];

    // No hits anywhere in the archive → still never empty: trending + suggestion.
    if (rows.length === 0) return await trendingFallback();

    // PRESERVE the RPC ordering. signal_search already orders results correctly:
    // for an entity query it returns the entity's COMPLETE archive history newest
    // -first; for free-text it orders by relevance. Re-sorting here (by the old
    // freshness-relevance heuristic) would override that and, for a company like
    // "Perplexity", push older launches/funding out of order. So we keep the
    // server order and only annotate matched_fields.
    const terms = expandQuery(q);
    const annotated = rows.map((item) => ({ item, matched_fields: scoreCandidate(item, terms).matched_fields }));
    const results = annotated.map((r) => r.item);
    const matched = Array.from(new Set(annotated.flatMap((r) => r.matched_fields)));
    console.info("[search] Results ready", { q, inputCount: rows.length, returnedCount: results.length, matchedFields: matched });

    // Related: alias/adjacent terms + entities from the top results.
    const entityRelated = annotated.slice(0, 3).flatMap((r) => r.item.trend_entities ?? []);
    const related = Array.from(new Set([...relatedTopics(q), ...entityRelated])).slice(0, 8);

    console.info("[search] Returning results", { q, returnedCount: results.length });
    return json({
      results,
      related,
      suggestions: annotated.length <= 1 ? didYouMean(q) : [],
      total_results: results.length,
      search_time: Date.now() - t0,
      matched_fields: matched,
      expanded: expandQuery(q),
    });
  } catch (error) {
    console.error("[search] Unhandled search exception", { q, message: error instanceof Error ? error.message : String(error) });
    return await trendingFallback({ note: "exception" });
  }
});
