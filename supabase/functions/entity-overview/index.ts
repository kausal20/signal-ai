// Signal AI Overview — the Entity Intelligence Layer.
//
// ENTITY-FIRST: the overview describes WHAT THE SEARCHED ENTITY IS, generated
// from the Knowledge Graph (entity metadata / evergreen definition) — NEVER from
// article headlines or search results. It reads like the first paragraph of a
// Wikipedia entry and stays accurate months later.
//
// Priority: entity.description (KG) → entity-first LLM over metadata → a
// deterministic evergreen definition from entity type + creator. Articles are
// NOT used to write the overview (only, optionally, listed as supporting
// sources). Cache is keyed on the entity's metadata version (entity.updated_at),
// so it invalidates when the Knowledge Graph changes — not on every news item.
//
// POST { query: string } → { ok, overview?, entity?, sources?, cached? }
// verify_jwt=false (public read).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { completeChat, isConfigured } from "../_shared/ai_provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface EntityRow {
  id: string; slug: string; type: string; canonical_name: string; normalized_name: string;
  description: string | null; website: string | null; official_domain: string | null;
  official_docs_url: string | null; official_blog_url: string | null;
  is_ai: boolean; updated_at: string | null;
}

const OVERVIEW_KINDS = new Set(["company", "product", "model", "framework", "technology", "person", "lab", "organization", "library", "api", "programming_language", "research_lab"]);

function normalize(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, " ").replace(/[.\-_]+/g, "-");
}

const ENTITY_COLS = "id,slug,type,canonical_name,normalized_name,description,website,official_domain,official_docs_url,official_blog_url,is_ai,updated_at";

async function resolveEntity(sb: any, query: string): Promise<EntityRow | null> {
  const q = query.trim();
  if (!q || q.length < 2 || q.length > 60) return null;
  const norm = normalize(q);

  const exact = await sb.from("entities").select(ENTITY_COLS)
    .or(`slug.eq.${norm},normalized_name.eq.${q.toLowerCase().replace(/[^a-z0-9]/g, "")}`).limit(5);
  if (exact.data && exact.data.length > 0) {
    const preferred = (exact.data as EntityRow[]).find((r) => OVERVIEW_KINDS.has(r.type)) ?? exact.data[0];
    if (OVERVIEW_KINDS.has(preferred.type)) return preferred;
  }

  const alias = await sb.from("entity_aliases")
    .select("entity_id, entities!inner(" + ENTITY_COLS + ")")
    .eq("normalized_alias", q.toLowerCase().replace(/[^a-z0-9]/g, "")).limit(1);
  if (alias.data && alias.data.length > 0) {
    const e = (alias.data[0] as any).entities as EntityRow;
    if (e && OVERVIEW_KINDS.has(e.type)) return e;
  }

  const like = await sb.from("entities").select(ENTITY_COLS)
    .ilike("canonical_name", `${q}%`).in("type", [...OVERVIEW_KINDS])
    .order("last_seen", { ascending: false, nullsFirst: false }).limit(1);
  if (like.data && like.data.length > 0) return like.data[0] as EntityRow;

  return null;
}

// ── Evergreen text hygiene ──────────────────────────────────────────────────
function cleanText(s: string): string {
  return s
    .replace(/&nbsp;| /gi, " ").replace(/&amp;/gi, "&").replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Cap to ≤3 sentences / ~70 words while keeping whole sentences.
function shape(text: string): string | null {
  const t = cleanText(text);
  if (t.length < 25) return null;
  const sents = t.split(/(?<=[.!?])\s+(?=[A-Z“"‘'(])/).map((s) => s.trim()).filter(Boolean);
  let out: string[] = [];
  let words = 0;
  for (const s of sents.slice(0, 3)) {
    const w = s.split(/\s+/).length;
    if (out.length > 0 && words + w > 72) break;
    out.push(s); words += w;
    if (words >= 55) break;
  }
  let joined = (out.length ? out : [sents[0]]).join(" ").trim();
  if (words > 78) joined = joined.split(/\s+/).slice(0, 72).join(" ").replace(/[,;:]?\s*\S*$/, "") + ".";
  if (!/[.!?]$/.test(joined)) joined += ".";
  return joined.length >= 25 ? joined : null;
}

// Reject any text that reads like NEWS rather than a definition (defence in depth
// against a stray article-derived string ever reaching the overview).
const NEWSY = /\b(vs\.?|versus|launch(es|ed|ing)?|raises?|raised|funding|valuation|series [a-e]\b|acquir|acqui|partners?(hip)?|announc|unveil|beats?|outperform|breaking|today|yesterday|this week|report(s|ed)?|according to|\$\d)/i;

function looksLikeNews(s: string): boolean {
  // A definition almost always starts "<Name> is …". News rarely does.
  return NEWSY.test(s) && !/\bis (an?|the) /i.test(s.slice(0, 60));
}

// ── Deterministic evergreen (no LLM, no articles) ───────────────────────────
const CREATOR_HINT: Record<string, string> = {
  chatgpt: "OpenAI", gpt: "OpenAI", sora: "OpenAI", codex: "OpenAI",
  claude: "Anthropic", gemini: "Google DeepMind", bard: "Google",
  llama: "Meta", grok: "xAI", copilot: "Microsoft", codewhisperer: "Amazon",
};

function kindPhrase(type: string): string {
  switch (type) {
    case "company": return "an artificial-intelligence company";
    case "organization": return "an organization in the AI industry";
    case "lab": case "research_lab": return "an AI research lab";
    case "person": return "a figure in the AI field";
    case "model": return "an AI model";
    case "product": return "an AI product";
    case "framework": return "an AI development framework";
    case "library": return "a software library used in AI development";
    case "api": return "an AI API";
    case "programming_language": return "a programming language";
    case "technology": return "an AI technology";
    default: return "an entity in the AI ecosystem";
  }
}

function deterministicEvergreen(e: EntityRow): string {
  const name = e.canonical_name;
  const kind = kindPhrase(e.type);
  let creator: string | null = null;
  const slug = (e.slug + " " + e.normalized_name).toLowerCase();
  for (const [k, v] of Object.entries(CREATOR_HINT)) if (slug.includes(k)) { creator = v; break; }
  const by = creator && creator.toLowerCase() !== name.toLowerCase() ? `, developed by ${creator},` : "";
  return `${name} is ${kind}${by} tracked by Signal as part of the AI ecosystem.`;
}

// ── Entity-first LLM (metadata only; NEVER article headlines) ───────────────
const SYSTEM_PROMPT = `You write the "Signal AI Overview" — a single evergreen definition of an AI entity, like the first sentence of a Wikipedia article. Explain ONLY: what the entity is, who created it (if known), its primary purpose, and one distinguishing capability.
HARD RULES:
- 1–3 sentences, 50–70 words, neutral and factual.
- It must still be accurate six months from now.
- FORBIDDEN: news, launches, funding, valuations, ARR, acquisitions, partnerships, comparisons, the word "vs", competitor names, article titles, opinions, dates, "recently/today", marketing hype.
- Start with the entity name: "<Name> is …".
- Use ONLY the provided entity metadata. If it is insufficient to define the entity, output exactly: NO_OVERVIEW.
Return ONLY the definition text.`;

async function llmEvergreen(e: EntityRow): Promise<string | null> {
  if (!isConfigured()) return null;
  const meta = {
    name: e.canonical_name, type: e.type,
    website: e.website ?? (e.official_domain ? `https://${e.official_domain}` : ""),
    docs: e.official_docs_url ?? "", blog: e.official_blog_url ?? "",
    existing_description: e.description ?? "",
  };
  const res = await completeChat<any>({
    feature: "entity-overview",
    messages: [{ role: "system", content: SYSTEM_PROMPT }, { role: "user", content: JSON.stringify(meta) }],
    timeoutMs: 18_000,
  });
  if (!res.success) return null;
  const raw = String(res.data.choices?.[0]?.message?.content ?? "").trim();
  if (!raw || /NO_OVERVIEW/.test(raw)) return null;
  const shaped = shape(raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, ""));
  if (!shaped || looksLikeNews(shaped)) return null;
  return shaped;
}

// Overview priority: KG description → entity-first LLM → deterministic evergreen.
async function buildOverview(e: EntityRow): Promise<{ text: string; source: string }> {
  const desc = (e.description ?? "").trim();
  if (desc.length >= 25 && !looksLikeNews(desc)) {
    const shaped = shape(desc);
    if (shaped) return { text: shaped, source: "knowledge_graph" };
  }
  const llm = await llmEvergreen(e);
  if (llm) return { text: llm, source: "llm_metadata" };
  return { text: deterministicEvergreen(e), source: "deterministic" };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  let body: any = {};
  try { body = await req.json(); } catch { /* empty */ }
  const query = String(body?.query ?? "").slice(0, 60);
  const ok = (payload: unknown, cache = "MISS") =>
    new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json", "X-Cache": cache } });

  if (!query.trim()) return ok({ ok: true, overview: null });

  // 1) Entity detection + resolution (Knowledge Graph). Unknown → no overview.
  const entity = await resolveEntity(sb, query);
  if (!entity) return ok({ ok: true, overview: null, entity: null });

  const metaVersion = entity.updated_at ?? null;

  // 2) Cache — keyed on the entity's METADATA version, not article freshness.
  const { data: cache } = await sb.from("entity_overviews")
    .select("overview,sources,meta_version,refresh_after").eq("entity_id", entity.id).maybeSingle();
  const now = Date.now();
  const cacheHit = !!cache
    && (cache.refresh_after ? Date.parse(cache.refresh_after) > now : true)
    && (metaVersion ? cache.meta_version === metaVersion : !!cache.meta_version);
  if (cacheHit && cache) {
    return ok({
      ok: true, overview: cache.overview, sources: cache.sources ?? [],
      entity: { slug: entity.slug, name: entity.canonical_name, type: entity.type }, cached: true,
    }, "HIT");
  }

  // 3) Generate ENTITY-FIRST (never from articles).
  const { text: overview, source } = await buildOverview(entity);

  // Supporting sources ONLY (official channels) — never the overview text.
  const sources = [
    entity.official_domain ? { type: "website", url: `https://${entity.official_domain}` } : null,
    entity.official_docs_url ? { type: "docs", url: entity.official_docs_url } : null,
    entity.official_blog_url ? { type: "blog", url: entity.official_blog_url } : null,
  ].filter(Boolean);

  // Persist (background) — invalidates only when entity metadata changes.
  const persist = sb.from("entity_overviews").upsert({
    entity_id: entity.id, overview, sources, model: source,
    meta_version: metaVersion, generated_at: new Date(now).toISOString(),
    updated_at: new Date(now).toISOString(),
    refresh_after: new Date(now + 90 * 86400_000).toISOString(),
  }, { onConflict: "entity_id" });
  const waitUntil = (globalThis as any)?.EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") waitUntil.call((globalThis as any).EdgeRuntime, persist.then(() => {}, () => {}));
  else await persist;

  return ok({
    ok: true, overview, sources, source,
    entity: { slug: entity.slug, name: entity.canonical_name, type: entity.type }, cached: false,
  });
});
