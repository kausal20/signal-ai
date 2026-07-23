// Signal AI Overview — 3-line grounded summary for a recognized entity.
// Cache-first: hits `entity_overviews` and returns instantly. On miss (or when
// the entity's freshest article is newer than the cached `latest_seen_at`, i.e.
// a major release / announcement landed), regenerates from grounded sources:
//   1. entity row (name, type, description, official domain)
//   2. top articles in content_archive linked via entity_article_links,
//      preferring official-source rows, then newest.
// Never hallucinated: the LLM only receives real titles + summaries and must
// answer what/who/why in ≤3 lines. Empty on unknown query — the UI hides the
// section entirely.
//
// POST { query: string } → { ok, overview?, entity?, sources?, cached? }
// verify_jwt=false (public read).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { completeChat } from "../_shared/ai_provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface EntityRow {
  id: string; slug: string; type: string; canonical_name: string; normalized_name: string;
  description: string | null; website: string | null; official_domain: string | null;
  is_ai: boolean;
}

interface ArticleRow {
  title: string; summary: string | null; publisher: string | null;
  original_url: string | null; url: string | null; published_at: string | null;
  is_official_source: boolean | null; is_official_company_news: boolean | null;
  editorial_quality_score: number | null;
}

// Only entities of these kinds get an overview (matches the task's scope:
// AI companies, models, tools, frameworks, technologies).
const OVERVIEW_KINDS = new Set(["company", "product", "model", "framework", "technology", "person", "lab"]);

function normalize(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.\-_]+/g, "-");
}

async function resolveEntity(sb: any, query: string): Promise<EntityRow | null> {
  const q = query.trim();
  if (!q || q.length < 2 || q.length > 60) return null;
  const norm = normalize(q);

  // 1) exact slug / normalized name.
  const exact = await sb.from("entities")
    .select("id,slug,type,canonical_name,normalized_name,description,website,official_domain,is_ai")
    .or(`slug.eq.${norm},normalized_name.eq.${q.toLowerCase()}`)
    .limit(5);
  if (exact.data && exact.data.length > 0) {
    const preferred = (exact.data as EntityRow[]).find((r) => OVERVIEW_KINDS.has(r.type)) ?? exact.data[0];
    if (OVERVIEW_KINDS.has(preferred.type)) return preferred;
  }

  // 2) alias exact match.
  const alias = await sb.from("entity_aliases")
    .select("entity_id, entities!inner(id,slug,type,canonical_name,normalized_name,description,website,official_domain,is_ai)")
    .eq("alias_normalized", q.toLowerCase())
    .limit(1);
  if (alias.data && alias.data.length > 0) {
    const e = (alias.data[0] as any).entities as EntityRow;
    if (e && OVERVIEW_KINDS.has(e.type)) return e;
  }

  // 3) prefix on canonical_name (short queries like "gpt-5").
  const like = await sb.from("entities")
    .select("id,slug,type,canonical_name,normalized_name,description,website,official_domain,is_ai")
    .ilike("canonical_name", `${q}%`)
    .in("type", [...OVERVIEW_KINDS])
    .order("last_seen", { ascending: false, nullsFirst: false })
    .limit(1);
  if (like.data && like.data.length > 0) return like.data[0] as EntityRow;

  return null;
}

async function loadGroundingArticles(sb: any, entityId: string): Promise<ArticleRow[]> {
  const links = await sb.from("entity_article_links")
    .select("article_id, confidence")
    .eq("entity_id", entityId)
    .order("confidence", { ascending: false })
    .limit(60);
  const ids = (links.data ?? []).map((l: any) => l.article_id).filter(Boolean);
  if (ids.length === 0) return [];

  const cols = "title,summary,publisher,original_url,url,published_at,is_official_source,is_official_company_news,editorial_quality_score";
  const { data } = await sb.from("content_archive")
    .select(cols)
    .in("id", ids)
    .eq("archive_status", "active")
    .order("is_official_source", { ascending: false, nullsFirst: false })
    .order("published_at", { ascending: false, nullsFirst: false })
    .limit(10);
  return (data ?? []) as ArticleRow[];
}

const SYSTEM_PROMPT = `You are Signal's AI Overview writer. Produce a factual, three-sentence briefing on the searched AI entity, grounded ONLY in the provided entity metadata and article snippets. Answer exactly three questions in order:
1) What is it?
2) Who created it? (company / lab / maintainer)
3) Why does it matter? (concrete capability, launch, or role — not marketing)
Rules:
- Maximum 3 sentences, roughly 45–65 words total.
- No marketing language, no hype ("revolutionary", "game-changing", "unlock", "supercharge", "transform", "cutting-edge").
- No filler ("in the world of AI…", "as we all know…").
- Do NOT repeat the search query verbatim as the opening.
- Do NOT include URLs, dates, or footnotes.
- If the grounding is insufficient, output the single token: NO_OVERVIEW.
Return ONLY the finished overview text. No preamble.`;

// ── Deterministic, grounded fallback ────────────────────────────────────────
// Builds a factual 3-line overview directly from the grounded articles + entity
// row. No LLM call, so it's <100 ms, no billing risk, and physically cannot
// hallucinate (every phrase comes from real data). Used as first-choice when
// the LLM is unavailable and as the guaranteed fallback otherwise.
const CREATOR_HINT: Record<string, string> = {
  openai: "OpenAI", "chatgpt": "OpenAI", gpt: "OpenAI", sora: "OpenAI",
  claude: "Anthropic", anthropic: "Anthropic",
  gemini: "Google DeepMind", "google-deepmind": "Google DeepMind", google: "Google",
  llama: "Meta", meta: "Meta",
  mistral: "Mistral AI",
  perplexity: "Perplexity",
  cursor: "Anysphere (Cursor)",
  lovable: "Lovable",
  firecrawl: "Mendable / Firecrawl",
  deepseek: "DeepSeek",
  groq: "Groq",
  cohere: "Cohere",
  runway: "Runway",
  elevenlabs: "ElevenLabs",
  midjourney: "Midjourney",
  huggingface: "Hugging Face",
  langchain: "LangChain",
  xai: "xAI", grok: "xAI",
  nvidia: "NVIDIA",
  copilot: "Microsoft",
};

function kindPhrase(type: string): string {
  switch (type) {
    case "company": return "an AI company";
    case "lab": return "an AI research lab";
    case "person": return "a figure in AI";
    case "model": return "an AI model";
    case "product": return "an AI product";
    case "framework": return "an AI framework";
    case "technology": return "an AI technology";
    default: return "an AI entity";
  }
}

function inferCreator(entity: EntityRow, articles: ArticleRow[]): string | null {
  const slug = entity.slug.toLowerCase();
  for (const [k, v] of Object.entries(CREATOR_HINT)) {
    if (slug.includes(k)) return v;
  }
  const officialPublisher = articles.find((a) => (a.is_official_source || a.is_official_company_news) && a.publisher)?.publisher;
  if (officialPublisher) return officialPublisher.replace(/\s*\(official\)/i, "").trim();
  return null;
}

function pickSalientArticle(articles: ArticleRow[], entity: EntityRow): ArticleRow | null {
  // Only consider articles that (a) have real text and (b) explicitly mention
  // this entity — filters out roundup/lists that link to many entities.
  const withText = articles.filter((a) =>
    (a.summary && a.summary.trim().length > 40) || (a.title && a.title.trim().length > 15),
  );
  if (withText.length === 0) return null;
  const named = withText.filter((a) =>
    mentionsEntity(a.summary ?? "", entity) || mentionsEntity(a.title ?? "", entity),
  );
  const pool = named.length > 0 ? named : withText;
  const official = pool.find((a) => a.is_official_source || a.is_official_company_news);
  if (official) return official;
  return pool.sort((a, b) => (b.editorial_quality_score ?? 0) - (a.editorial_quality_score ?? 0))[0] ?? pool[0];
}

function stripBoilerplate(s: string): string {
  let out = s
    // Decode common HTML entities & non-breaking-space glyphs.
    .replace(/&nbsp;| /gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ")
    // Drop trailing "· SourceName" citation blobs with an explicit separator.
    .replace(/\s+[·—–|]\s+[A-Z][A-Za-z0-9 &]{2,30}\s*$/g, "")
    .replace(/\s+/g, " ")
    .trim();
  // Google-News style: "Real title   SourceName" separated by 2+ spaces. Strip
  // the trailing short PascalCase token when it looks like a publisher name.
  // (Runs AFTER the whitespace collapse above, on the original 2-space signal.)
  const m = s.match(/\s{2,}([A-Z][A-Za-z0-9.&' ]{1,25})\s*$/);
  if (m) out = out.replace(new RegExp(`\\s+${m[1].replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*$`), "");
  return out.replace(/^(so|well|now|today|recently|in a (recent|new) (post|announcement|article|blog|update))[:,]?\s+/i, "").trim();
}

// True if the summary explicitly mentions the entity by name (or by first token
// of a multi-word name). Prevents "Claude" from getting a Grok headline as its
// why-line, etc.
function mentionsEntity(text: string, entity: EntityRow): boolean {
  const t = (text ?? "").toLowerCase();
  const name = entity.canonical_name.toLowerCase();
  if (t.includes(name)) return true;
  const firstToken = name.split(/\s+/)[0];
  return firstToken.length >= 3 && t.includes(firstToken);
}

function deterministicOverview(entity: EntityRow, articles: ArticleRow[]): string | null {
  const name = entity.canonical_name;
  const kind = kindPhrase(entity.type);
  const creator = inferCreator(entity, articles);
  const salient = pickSalientArticle(articles, entity);

  // Line 1: what it is (prefer real description if present)
  const desc = (entity.description ?? "").trim();
  const line1 = desc.length > 20
    ? (desc.length > 180 ? desc.slice(0, 180).replace(/\s+\S*$/, "") + "." : (desc.endsWith(".") ? desc : desc + "."))
    : `${name} is ${kind}.`;

  // Line 2: who created it (drop if unknown to keep it honest)
  const line2 = creator && creator.toLowerCase() !== name.toLowerCase()
    ? `Built by ${creator}.`
    : null;

  // Line 3: why it matters — a factual sentence from a real, preferably
  // official article. We take the FIRST sentence of the summary (or the title
  // as a last resort) so it's a real fact, not a rephrasing.
  let line3: string | null = null;
  if (salient) {
    const src = stripBoilerplate(salient.summary ?? "");
    // Prefer a sentence that ACTUALLY names the entity — never a random opener
    // from a multi-entity roundup. If no sentence mentions it, try the title;
    // if the title also doesn't mention it, drop line 3 (2 honest lines > 3
    // random-feeling ones).
    const sentences = src.split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/).map((s) => s.trim()).filter((s) => s.length >= 25);
    const namedSent = sentences.find((s) => mentionsEntity(s, entity));
    const fromTitle = stripBoilerplate(salient.title ?? "");
    const chosen = namedSent ?? (mentionsEntity(fromTitle, entity) ? fromTitle : "");
    if (chosen) {
      const trimmed = chosen.length > 180 ? chosen.slice(0, 180).replace(/\s+\S*$/, "") + "." : (chosen.endsWith(".") ? chosen : chosen + ".");
      line3 = trimmed;
    }
  }

  const parts = [line1, line2, line3].filter((x): x is string => !!x);
  if (parts.length === 0) return null;
  const joined = parts.join(" ").replace(/\s+/g, " ").trim();
  if (joined.length < 40) return null;
  if (joined.length > 500) return joined.slice(0, 500).replace(/\s+\S*$/, "") + ".";
  return joined;
}

async function generateOverview(entity: EntityRow, articles: ArticleRow[]): Promise<{ text: string | null; debug?: any }> {
  const payload = {
    entity: {
      name: entity.canonical_name, type: entity.type,
      description: entity.description ?? "",
      website: entity.website ?? entity.official_domain ?? "",
    },
    articles: articles.slice(0, 8).map((a) => ({
      title: a.title, summary: (a.summary ?? "").slice(0, 400),
      publisher: a.publisher ?? "",
      official: !!(a.is_official_source || a.is_official_company_news),
      published_at: a.published_at ?? "",
    })),
  };

  const result = await completeChat<any>({
    feature: "entity-overview",
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: JSON.stringify(payload) },
    ],
    timeoutMs: 20_000,
  });
  if (!result.success) {
    console.warn("[entity-overview] AI fail → deterministic", result.error, result.code);
    const det = deterministicOverview(entity, articles);
    return { text: det, debug: { fallback: "deterministic", ai_code: result.code } };
  }
  const raw = String(result.data.choices?.[0]?.message?.content ?? "").trim();
  if (!raw || /NO_OVERVIEW/.test(raw)) {
    const det = deterministicOverview(entity, articles);
    return { text: det, debug: { fallback: "deterministic", reason: "empty_or_no_overview" } };
  }

  // Strip any leading bullets / list numbering / markdown, collapse whitespace.
  const cleaned = raw
    .replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();

  // Enforce 3-sentence cap on the SERVER too. If split can't find 3 sentences,
  // keep the whole cleaned string (models sometimes join with commas).
  const sents = cleaned.split(/(?<=[.!?])\s+(?=[A-Z“"‘'])/).filter((s) => s.trim().length > 0);
  const trimmed = (sents.length >= 2 ? sents.slice(0, 3).join(" ") : cleaned).trim();
  if (trimmed.length < 30) return { text: null, debug: { reason: "too_short", raw: raw.slice(0, 200), articles: articles.length } };
  if (trimmed.length > 600) return { text: trimmed.slice(0, 600).replace(/\s+\S*$/, "") + "." };
  return { text: trimmed };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const query = String(body?.query ?? "").slice(0, 60);
  if (!query.trim()) {
    return new Response(JSON.stringify({ ok: true, overview: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 1) Resolve query → recognized entity. Unknown query = no overview.
  const entity = await resolveEntity(sb, query);
  if (!entity) {
    return new Response(JSON.stringify({ ok: true, overview: null, entity: null }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // 2) Cache lookup + freshness gate. Regenerate if the newest article for this
  //    entity is newer than the cache's `latest_seen_at` (i.e. a real update
  //    landed since last generation) OR the row is past its refresh_after TTL.
  const now = Date.now();
  const [cacheRes, newestRes] = await Promise.all([
    sb.from("entity_overviews")
      .select("overview,sources,generated_at,latest_seen_at,refresh_after")
      .eq("entity_id", entity.id).maybeSingle(),
    sb.from("entity_article_links")
      .select("article_id, content_archive!inner(published_at)")
      .eq("entity_id", entity.id)
      .order("content_archive(published_at)", { ascending: false, nullsFirst: false })
      .limit(1),
  ]);

  const cache = cacheRes.data as { overview: string; sources: unknown; generated_at: string; latest_seen_at: string | null; refresh_after: string } | null;
  const newestPub = (newestRes.data?.[0] as any)?.content_archive?.published_at ?? null;
  const cacheHit = !!cache
    && (cache.refresh_after ? Date.parse(cache.refresh_after) > now : true)
    && (!newestPub || !cache.latest_seen_at || Date.parse(newestPub) <= Date.parse(cache.latest_seen_at));

  if (cacheHit && cache) {
    return new Response(JSON.stringify({
      ok: true, overview: cache.overview, sources: cache.sources ?? [],
      entity: { slug: entity.slug, name: entity.canonical_name, type: entity.type },
      cached: true,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "HIT" } });
  }

  // 3) Miss → generate from grounded articles.
  const articles = await loadGroundingArticles(sb, entity.id);
  if (articles.length === 0 && !(entity.description ?? "").trim()) {
    // Try a minimal deterministic overview from just entity metadata.
    const bare = deterministicOverview(entity, []);
    if (!bare) {
      return new Response(JSON.stringify({ ok: true, overview: null, entity: { slug: entity.slug, name: entity.canonical_name, type: entity.type } }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }
  const gen = await generateOverview(entity, articles);
  const overview = gen.text;
  if (!overview) {
    return new Response(JSON.stringify({ ok: true, overview: null, entity: { slug: entity.slug, name: entity.canonical_name, type: entity.type }, debug: gen.debug }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS-NULL" },
    });
  }

  const sources = articles.slice(0, 4).map((a) => ({
    title: a.title, url: a.original_url || a.url, publisher: a.publisher,
    published_at: a.published_at, official: !!(a.is_official_source || a.is_official_company_news),
  }));
  const latest = articles.reduce((m, a) => Math.max(m, Date.parse(a.published_at ?? "") || 0), 0);
  const refreshAfter = new Date(now + 30 * 86400_000).toISOString();

  // Persist in the background — DON'T block the response.
  const persist = sb.from("entity_overviews").upsert({
    entity_id: entity.id,
    overview,
    sources,
    latest_seen_at: latest > 0 ? new Date(latest).toISOString() : null,
    generated_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    refresh_after: refreshAfter,
  }, { onConflict: "entity_id" });
  const waitUntil = (globalThis as any)?.EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") waitUntil.call((globalThis as any).EdgeRuntime, persist.then(() => {}, () => {}));
  else await persist;

  return new Response(JSON.stringify({
    ok: true, overview, sources,
    entity: { slug: entity.slug, name: entity.canonical_name, type: entity.type },
    cached: false,
  }), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": "MISS" } });
});
