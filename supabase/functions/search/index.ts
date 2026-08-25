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
  toTsQuery, scoreCandidate, didYouMean, expandQuery,
  type SearchCandidate,
} from "../_shared/search.ts";
import { relatedProducts } from "../_shared/related_products.ts";

interface SearchRpcRow extends SearchCandidate {
  section?: string;
  is_official_source?: boolean;
  is_official_company_news?: boolean;
  source_type?: string;
  trust_score?: number;
  publisher?: string;
  publisher_domain?: string;
  rank?: number;
  event_type?: string;
}

interface ResolvedEntityRow {
  r_entity_id: string; r_canonical_name: string; r_official_domain: string | null;
  r_logo_url: string | null; r_confidence: number;
}

/**
 * When a keyword resolves to a known entity with its own domain but the
 * archive has no article from that domain (yet), synthesize a real,
 * clickable "visit the source" card instead of a dead end. Never replaces a
 * genuine article — only fills the gap when nothing on that domain exists.
 */
function domainCard(r: ResolvedEntityRow): SearchRpcRow {
  const domain = r.r_official_domain!;
  return {
    id: `domain:${domain}`,
    title: `${r.r_canonical_name} — official site`,
    summary: `No archived articles from ${domain} yet. Visit the source directly.`,
    source: r.r_canonical_name,
    source_label: r.r_canonical_name,
    publisher: r.r_canonical_name,
    publisher_domain: domain,
    url: `https://${domain}`,
    original_url: `https://${domain}`,
    content_type: "website",
    section: "official",
    is_official_source: true,
    is_official_company_news: false,
    source_type: "OFFICIAL_BLOG",
    trust_score: 100,
    score: 100,
    rank: 1_000_000,
  };
}

function logSearchTiers(q: string, rows: SearchRpcRow[]): void {
  const official = rows.filter((r) => r.section === "official" || r.is_official_source);
  const media = rows.filter((r) => r.section === "analysis" && !r.is_official_source);
  const other = rows.length - official.length - media.length;
  console.info("[search] Tier breakdown", {
    q,
    total: rows.length,
    official_count: official.length,
    media_count: media.length,
    other_count: other,
    top: rows.slice(0, 8).map((r) => ({
      section: r.section ?? null,
      is_official_source: r.is_official_source ?? false,
      is_official_company_news: r.is_official_company_news ?? false,
      source_type: r.source_type ?? null,
      trust_score: r.trust_score ?? null,
      publisher: r.publisher ?? r.source ?? null,
      rank: r.rank ?? null,
      title: (r.title ?? "").slice(0, 80),
      reason: r.section === "official"
        ? "official_source_section"
        : r.is_official_source
          ? "is_official_source"
          : r.section === "analysis"
            ? "media_coverage"
            : r.section ?? "free_text_or_other",
    })),
  });
}

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
      related: [], related_products: [], related_fallback: "none",
      suggestions: didYouMean(q),
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

    let rows = (data ?? []) as SearchRpcRow[];

    // Resolve the keyword to a known entity (Phase 2 Entity Resolution Engine —
    // typo-tolerant, confidence-scored). If it names a real entity with its own
    // domain and the archive has NOTHING from that domain yet, surface a real,
    // clickable "visit the source" card instead of a dead end or unrelated
    // trending content. Confidence >=60 matches resolve_query's own floor.
    const { data: resolvedRows } = await supabase.rpc("resolve_query", { q_raw: q, max_results: 1 });
    const resolved = (Array.isArray(resolvedRows) ? resolvedRows[0] : null) as ResolvedEntityRow | null;
    if (resolved && resolved.r_confidence >= 60 && resolved.r_official_domain) {
      const hasDomainRow = rows.some((r) => r.publisher_domain === resolved.r_official_domain);
      if (!hasDomainRow) {
        rows = [domainCard(resolved), ...rows];
        console.info("[search] Injected domain fallback card", { q, domain: resolved.r_official_domain, confidence: resolved.r_confidence });
      }
    }

    // No hits anywhere in the archive → still never empty: trending + suggestion.
    if (rows.length === 0) return await trendingFallback();

    logSearchTiers(q, rows);

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

    // Related PRODUCTS — derived from Entity Intelligence (co-mentions in the
    // entity_article_links graph, ranked products > companies > tech). Falls
    // back to trend entities from top results only if entity resolution fails.
    let relatedProductsList: { name: string; type: string; slug: string }[] = [];
    let relatedFallback: "products" | "companies" | "technologies" | "none" = "none";
    try {
      const rp = await relatedProducts(supabase, q, 8);
      relatedProductsList = rp.items;
      relatedFallback = rp.fallback;
    } catch (e) {
      console.error("[search] relatedProducts failed", e instanceof Error ? e.message : e);
    }
    // Legacy `related` string[] kept for backwards compat — reuse the products.
    const related = relatedProductsList.length > 0
      ? relatedProductsList.map((p) => p.name)
      : Array.from(new Set(annotated.slice(0, 3).flatMap((r) => r.item.trend_entities ?? []))).slice(0, 8);

    console.info("[search] Returning results", { q, returnedCount: results.length, relatedCount: relatedProductsList.length, relatedFallback });
    return json({
      results,
      related,
      related_products: relatedProductsList,
      related_fallback: relatedFallback,
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
