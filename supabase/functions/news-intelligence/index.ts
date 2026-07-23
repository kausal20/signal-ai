// news-intelligence — Signal Analysis: a cached, GROUNDED intelligence report.
//
// Flow: content-hash cache lookup (signal_analysis) → hit returns instantly →
// miss assembles grounding (primary entity facts + related archive stories) →
// shared AI provider (structured JSON) → validate → cache → return. Grounding
// keeps the model factual; caching makes repeat opens instant. Returns 200 even
// on failure so the client can branch on `ok` and show a graceful retry.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildPhasePrompt, validatePhase, RESPONSE_SCHEMA, type ArticleInput, type GroundingContext, type AnalysisPhase } from "../_shared/news_intelligence.ts";
import { isConfigured, generateContent } from "../_shared/ai_provider.ts";
import { toTsQuery } from "../_shared/search.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
const ANALYSIS_VERSION = 2;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

// Stable content hash (fnv-1a) — the cache key. Same story content ⇒ one report.
function contentHash(title: string, summary: string): string {
  let h = 2166136261;
  for (const ch of `v${ANALYSIS_VERSION}:${title}\n${summary}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(16);
}

interface RelatedStory { title: string; url: string; publisher: string; published_at: string; source_type: string }

// Grounding: primary entity + facts + related archive headlines/stories.
async function assembleGrounding(article: ArticleInput): Promise<{ ctx: GroundingContext; related_stories: RelatedStory[] }> {
  const empty = { ctx: {} as GroundingContext, related_stories: [] as RelatedStory[] };
  try {
    const q = `${article.title}`.slice(0, 160);
    const { data } = await supabase.rpc("signal_search", { q_ts: toTsQuery(q), q_raw: q, max_results: 10 });
    const rows = (data ?? []) as Array<Record<string, unknown>>;
    const others = rows.filter((r) => String(r.title) !== article.title);

    // Most-frequent linked entity across results = the story's primary company.
    const tally = new Map<string, number>();
    for (const r of rows) for (const e of (r.trend_entities as string[] ?? [])) tally.set(e, (tally.get(e) ?? 0) + 1);
    const entityName = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];

    const entityFacts: string[] = [];
    if (entityName) {
      try {
        const { data: ent } = await supabase.from("entities")
          .select("canonical_name,description,official_domain,official_blog_url,website")
          .ilike("canonical_name", entityName).maybeSingle();
        if (ent) {
          if (ent.description) entityFacts.push(String(ent.description));
          if (ent.official_domain) entityFacts.push(`Official site: ${ent.official_domain}`);
        }
      } catch { /* optional */ }
    }

    const related_stories: RelatedStory[] = others.slice(0, 5).map((r) => ({
      title: String(r.title ?? ""),
      url: String(r.original_url ?? r.url ?? ""),
      publisher: String(r.publisher ?? r.source ?? "Signal archive"),
      published_at: String(r.published_at ?? ""),
      source_type: String(r.source_type ?? ""),
    }));

    return { ctx: { entityName, entityFacts, relatedHeadlines: others.slice(0, 8).map((r) => String(r.title ?? "")) }, related_stories };
  } catch {
    return empty;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payload: { article_id?: string; article?: Partial<ArticleInput>; phase?: string } = {};
  try { payload = await req.json(); } catch { return json({ ok: false, code: "bad_request", error: "Invalid JSON body." }); }

  const articleId = (payload.article_id ?? "").toString().trim();
  if (!articleId) return json({ ok: false, code: "bad_request", error: "Missing article_id." });
  // Phased generation keeps the first useful content fast (core ≈2-3s).
  const phase: AnalysisPhase = payload.phase === "core" || payload.phase === "deep" ? payload.phase : "full";

  // Assemble article (client content first, feed_items fallback).
  let article: ArticleInput = {
    id: articleId,
    title: (payload.article?.title ?? "").toString(),
    summary: payload.article?.summary?.toString(),
    why_it_matters: payload.article?.why_it_matters?.toString(),
    source: payload.article?.source?.toString(),
    tag: payload.article?.tag?.toString(),
  };
  if (!article.title) {
    try {
      const { data } = await supabase.from("feed_items").select("title,summary,why_it_matters,tag").eq("id", articleId).maybeSingle();
      if (data) article = { id: articleId, title: data.title, summary: data.summary, why_it_matters: data.why_it_matters, tag: data.tag };
    } catch { /* ignore */ }
  }
  if (!article.title) return json({ ok: false, code: "no_article", error: "Article content unavailable." });

  // "instant" phase: grounding only, NO AI — related stories + entity context in
  // well under a second so the sheet shows real content immediately.
  if (payload.phase === "instant") {
    const { ctx, related_stories } = await assembleGrounding(article);
    return json({ ok: true, phase: "instant", cached: false, intelligence: {}, related_stories, entity: ctx.entityName ?? null });
  }

  const hash = contentHash(article.title, article.summary ?? "");

  // 1) Cache lookup (content hash + phase). Instant on hit.
  try {
    const { data } = await supabase.from("signal_analysis").select("analysis_json")
      .eq("article_hash", hash).eq("phase", phase).eq("status", "ready").maybeSingle();
    const cached = data?.analysis_json as Record<string, unknown> | undefined;
    if (cached && Object.keys(cached).length) {
      return json({ ok: true, cached: true, phase, intelligence: cached, related_stories: cached._related_stories ?? [] });
    }
  } catch { /* table may not exist yet — regenerate */ }

  if (!isConfigured()) return json({ ok: false, code: "no_key", error: "Intelligence service is not configured yet." });

  // 2) Ground, then generate.
  const t0 = Date.now();
  const { ctx, related_stories } = await assembleGrounding(article);
  // Smaller output budget for `core` is what makes the first section fast.
  const maxOutputTokens = phase === "core" ? 900 : phase === "deep" ? 2200 : 3072;
  const result = await generateContent({
    feature: `news-intelligence:${phase}`,
    contents: [{ role: "user", parts: [{ text: buildPhasePrompt(article, ctx, phase) }] }],
    generationConfig: { responseMimeType: "application/json", responseSchema: RESPONSE_SCHEMA, temperature: 0.35, maxOutputTokens },
  });
  if (!result.success) return json({ ok: false, code: result.code, error: result.error, retry: result.retry });

  let intelligence;
  try { intelligence = validatePhase(result.data, phase); }
  catch (e) { return json({ ok: false, code: "generation_failed", error: e instanceof Error ? e.message : String(e) }); }

  // 3) Cache (best-effort). Store related_stories alongside the report.
  // Related stories ride along with `core` (they come from grounding, not the model).
  const analysis_json = phase === "deep" ? { ...intelligence } : { ...intelligence, _related_stories: related_stories };
  try {
    await supabase.from("signal_analysis").upsert({
      article_id: articleId, article_hash: hash, phase, model: Deno.env.get("DEFAULT_AI_MODEL") ?? null,
      analysis_json, status: "ready", version: ANALYSIS_VERSION,
      generation_time_ms: Date.now() - t0, generated_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    }, { onConflict: "article_hash,phase" });
  } catch { /* cache write optional */ }

  return json({ ok: true, cached: false, phase, intelligence, related_stories: phase === "deep" ? [] : related_stories });
});
