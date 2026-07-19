// news-intelligence — on-demand AI intelligence for a single news article.
//
// Flow: cache lookup → (miss) build prompt → shared AI provider → validate →
// cache → return. Additive: does NOT touch existing feed fetching, tables, or
// functions. Caching + article lookup are best-effort — the feature still works
// (uncached) if the `news_intelligence` table isn't migrated yet.
//
// Contract (POST, invoked from the client):
//   body: { article_id: string, article?: { title, summary, why_it_matters, source, tag } }
//   200 { ok: true, intelligence, cached }      — success
//   200 { ok: false, code, error }              — graceful failure (UI shows retry)
//
// Returns 200 even on failure so `supabase.functions.invoke` doesn't throw; the
// client branches on `ok`.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildPrompt, validateIntelligence, RESPONSE_SCHEMA, type ArticleInput } from "../_shared/news_intelligence.ts";
import { isConfigured, generateContent } from "../_shared/ai_provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let payload: { article_id?: string; article?: Partial<ArticleInput> } = {};
  try {
    payload = await req.json();
  } catch {
    return json({ ok: false, code: "bad_request", error: "Invalid JSON body." }, 200);
  }

  const articleId = (payload.article_id ?? "").toString().trim();
  if (!articleId) return json({ ok: false, code: "bad_request", error: "Missing article_id." }, 200);

  // 1) Cache lookup (best-effort). Only reuse a cached row that has the full
  //    structured analysis (jsonb); legacy-only rows fall through + regenerate.
  try {
    const { data } = await supabase
      .from("news_intelligence")
      .select("analysis")
      .eq("article_id", articleId)
      .maybeSingle();
    if (data?.analysis && typeof data.analysis === "object" && (data.analysis as Record<string, unknown>).executive_summary) {
      return json({ ok: true, cached: true, intelligence: data.analysis });
    }
  } catch (_) { /* table/column may not exist yet — fall through to generate */ }

  // 2) Assemble the article. Prefer the client-provided content; fall back to
  //    a feed_items lookup (read-only) so we don't depend on either alone.
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
      const { data } = await supabase
        .from("feed_items")
        .select("title,summary,why_it_matters,tag")
        .eq("id", articleId)
        .maybeSingle();
      if (data) {
        article = { id: articleId, title: data.title, summary: data.summary, why_it_matters: data.why_it_matters, tag: data.tag };
      }
    } catch (_) { /* ignore */ }
  }
  if (!article.title) return json({ ok: false, code: "no_article", error: "Article content unavailable." }, 200);

  // 3) No key yet → graceful, retryable failure (UI shows "Unable to generate").
  if (!isConfigured()) {
    return json({ ok: false, code: "no_key", error: "Intelligence service is not configured yet." }, 200);
  }

  // 4) Generate via shared AI provider (structured JSON output).
  const result = await generateContent({
    feature: "news-intelligence",
    contents: [{ role: "user", parts: [{ text: buildPrompt(article) }] }],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: RESPONSE_SCHEMA,
      temperature: 0.4,
      maxOutputTokens: 2048,
    },
  });

  if (!result.success) {
    return json({ ok: false, code: result.code, error: result.error, retry: result.retry }, 200);
  }

  let intelligence;
  try {
    intelligence = validateIntelligence(result.data);
  } catch (e) {
    return json({ ok: false, code: "generation_failed", error: e instanceof Error ? e.message : String(e) }, 200);
  }

  // 5) Cache (best-effort — never fail the response on a write error).
  try {
    await supabase.from("news_intelligence").upsert(
      {
        article_id: articleId,
        // Full structured analysis (source of truth for the sheet).
        analysis: intelligence,
        // Legacy columns kept populated for back-compat.
        summary: intelligence.summary,
        why_it_matters: intelligence.why_it_matters,
        affected_groups: intelligence.affected_groups,
        importance_score: intelligence.importance_score,
        key_takeaways: intelligence.key_takeaways,
        related_topics: intelligence.related_topics,
        confidence: intelligence.confidence,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "article_id" },
    );
  } catch (_) { /* cache write is optional */ }

  return json({ ok: true, cached: false, intelligence });
});
