// backfill-entities — Content Archive entity processor + backfiller.
//
// Under the Content Archive architecture this function is BOTH:
//   • the ongoing async entity processor (cron): it drains content_archive rows
//     with entity_status='pending' — extract entities → link → mark done — so
//     every newly-ingested article becomes searchable without touching publish.
//   • the one-time backfill: `seed` copies the historical raw_items archive into
//     content_archive; then the default action processes it to completion.
//
// Design:
//   • Resumable  — processing state lives in content_archive.entity_status; the
//     seed cursor lives in entity_backfill_progress.cursor_id. Each invocation
//     returns before the edge wall-clock limit; the caller re-invokes.
//   • Idempotent — copy_raw_to_archive is ON CONFLICT DO NOTHING; upsert_entity
//     matches-or-creates; link_article_entities upserts. Re-runs never dupe.
//   • Resilient  — rows are claimed to 'processing'; stale claims (>20m) are
//     reclaimed; per-row try/catch + retry around the link RPC.
//   • Observable — progress persisted + logged after every page.
//
// Actions (POST JSON, default "backfill"):
//   { "action": "seed"     }  copy raw_items → content_archive (one time-slice)
//   { "action": "backfill" }  process pending content_archive rows (one slice)
//   { "action": "status"   }  counts only, no work
//   { "action": "reset"    }  requeue every archived row (entity_status→pending)
//   { "action": "verify"   }  signal_search the target companies, return counts
//   { "action": "fix_editorial" }  clear false-positive is_official_company_news on media rows
//   { "action": "sources", "reclassify": true }  upgrade linked rows to official after entity linking
//
// Admin-only. Call with the service_role key (or an admin JWT) as Bearer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin_auth.ts";
import { extractStoryEntities, toEntityLinks } from "../_shared/entity_extract.ts";
import { isConfigured } from "../_shared/ai_provider.ts";
import { toTsQuery } from "../_shared/search.ts";
import { classifyContentType, splitPublisherSuffix, domainOf, type ContentType } from "../_shared/content_type.ts";
import { classifyEditorial, isOfficialCompanyNewsForArchive } from "../_shared/editorial.ts";
import { classifySourceType, entityOwnsDomain } from "../_shared/source_type.ts";
import { decodeGoogleNewsUrl } from "../_shared/sources.ts";
import { normalizeUrl } from "../_shared/url.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOFT_TIME_LIMIT_MS = 110_000;   // stop a slice before the platform wall-clock cap
const DEFAULT_CHUNK = 40;              // archive rows processed per page
const SEED_CHUNK = 2000;              // raw_items copied per page
const CONCURRENCY = 4;                 // parallel extractions per page
const LINK_RETRIES = 3;
const STALE_PROCESSING_MS = 20 * 60_000; // reclaim window for interrupted claims

const VERIFY_TERMS = [
  "OpenAI", "Anthropic", "Google", "Meta", "Microsoft", "Mistral",
  "Perplexity", "Cursor", "Lovable", "Firecrawl", "Hugging Face", "Groq", "Runway", "xAI",
];

interface ArchiveRow {
  id: string;
  title: string;
  summary: string | null;
  full_content: string | null;
}

interface SourceArticleRow {
  id: string;
  publisher: string | null;
  publisher_domain: string | null;
  original_url: string | null;
  url: string;
  source: string | null;
}

interface PrimaryEntity {
  id: string;
  norms: string[];
}

const SUBTYPE_COLUMN: Record<string, string> = {
  OFFICIAL_BLOG: "official_blog_url",
  OFFICIAL_PRESS_RELEASE: "official_press_url",
  OFFICIAL_GITHUB: "official_github_url",
  OFFICIAL_CHANGELOG: "official_changelog_url",
  OFFICIAL_DOCUMENTATION: "official_docs_url",
  OFFICIAL_RESEARCH: "official_research_url",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function withRetry<T>(fn: () => Promise<T>, attempts = LINK_RETRIES): Promise<T> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try { if (i > 0) await sleep(400 * i); return await fn(); }
    catch (e) { lastErr = e; }
  }
  throw lastErr;
}

async function saveProgress(sb: any, patch: Record<string, unknown>): Promise<void> {
  await sb.from("entity_backfill_progress")
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq("id", 1);
}

async function countArchive(sb: any, entityStatus?: string): Promise<number> {
  let q = sb.from("content_archive").select("id", { count: "exact", head: true });
  if (entityStatus) q = q.eq("entity_status", entityStatus);
  const { count } = await q;
  return count ?? 0;
}

// Primary entity + normalized names/aliases for dynamic official-domain matching.
async function primaryEntityForArticle(sb: any, articleId: string): Promise<PrimaryEntity | null> {
  const { data: links } = await sb
    .from("entity_article_links")
    .select("mention_type, entities(id, normalized_name, entity_aliases(normalized_alias))")
    .eq("article_id", articleId);
  if (!links?.length) return null;

  let best: (PrimaryEntity & { rank: number }) | null = null;
  for (const l of links as Array<{ mention_type?: string; entities?: { id: string; normalized_name?: string; entity_aliases?: Array<{ normalized_alias?: string }> } }>) {
    const e = l.entities;
    if (!e?.id) continue;
    const rank = l.mention_type === "primary" ? 3 : l.mention_type === "product" ? 2 : 1;
    const norms = new Set<string>();
    if (e.normalized_name) norms.add(e.normalized_name);
    for (const a of e.entity_aliases ?? []) {
      if (a.normalized_alias) norms.add(a.normalized_alias);
    }
    const entry = { id: e.id, norms: [...norms], rank };
    if (!best || rank > best.rank) best = entry;
  }
  return best ? { id: best.id, norms: best.norms } : null;
}

async function loadConnectorKindMap(sb: any): Promise<Map<string, string>> {
  const { data: conns } = await sb.from("source_connectors").select("source,source_kind");
  return new Map<string, string>((conns ?? []).map((c: { source: string; source_kind: string }) => [c.source, c.source_kind]));
}

// Classify OFFICIAL vs MEDIA using entity-aware domain matching; catalog registry.
async function reclassifyArticleSource(
  sb: any,
  row: SourceArticleRow,
  kindMap: Map<string, string>,
  primary?: PrimaryEntity | null,
): Promise<boolean> {
  const link = primary ?? await primaryEntityForArticle(sb, row.id);
  const cls = classifySourceType({
    publisher: row.publisher,
    publisherDomain: row.publisher_domain,
    url: row.original_url ?? row.url,
    connectorSource: row.source,
    connectorKind: kindMap.get(row.source ?? ""),
    entityNorms: link?.norms ?? [],
  });

  await sb.from("content_archive").update({
    source_type: cls.sourceType,
    trust_score: cls.trustScore,
    is_official_source: cls.isOfficial,
    // Media must never carry the official-company-news flag (drives legacy search tiers).
    ...(cls.isOfficial ? {} : { is_official_company_news: false }),
  }).eq("id", row.id);

  const domain = (row.publisher_domain || domainOf(row.original_url ?? row.url ?? "")).toLowerCase();
  if (domain && domain !== "news.google.com") {
    await sb.rpc("upsert_source_registry", {
      p_publisher: row.publisher || domain,
      p_domain: domain,
      p_source_type: cls.sourceType,
      p_trust: cls.trustScore,
      p_company_id: cls.isOfficial ? (link?.id ?? null) : null,
      p_website: `https://${domain}`,
    });
    if (cls.isOfficial && link?.id && entityOwnsDomain(domain, link.norms)) {
      const patch: Record<string, unknown> = { official_domain: domain };
      const col = SUBTYPE_COLUMN[cls.sourceType];
      if (col) patch[col] = `https://${domain}`;
      await sb.from("entities").update(patch).eq("id", link.id);
    }
  }
  return cls.isOfficial;
}

// Extract + link one archived article, then reclassify source with entity norms.
async function processArticle(sb: any, row: ArchiveRow, kindMap: Map<string, string>): Promise<boolean> {
  const extracted = await extractStoryEntities({
    id: row.id,
    title: row.title,
    summary: row.summary ?? undefined,
    what_happened: row.full_content ?? undefined,
  });
  const links = toEntityLinks(extracted);
  if (!links.length) return false;

  const payload = links.map((l) => ({
    name: l.name, type: l.type ?? "company", aliases: l.aliases ?? [],
    is_ai: l.is_ai ?? true, confidence: l.confidence ?? 1.0, mention_type: l.mention_type ?? "mentioned",
  }));
  await withRetry(async () => {
    const { error } = await sb.rpc("link_article_entities", { p_article_id: row.id, p_entities: payload });
    if (error) throw new Error(error.message ?? String(error));
  });

  const { data: article } = await sb
    .from("content_archive")
    .select("id,publisher,publisher_domain,original_url,url,source")
    .eq("id", row.id)
    .single();
  if (article) await reclassifyArticleSource(sb, article as SourceArticleRow, kindMap);
  return true;
}

// ── action: classify — content_type + publisher for existing rows (no AI) ────
// Deterministic backfill: classifies content_type, recovers the real publisher
// from the "… - Publisher" title suffix (Google-News), and cleans the stored
// title. Idempotent: only touches rows with content_type IS NULL.
async function runClassify(sb: any, chunk: number, t0: number): Promise<Response> {
  let processed = 0;
  let updated = 0;
  while (true) {
    // Rows missing content_type OR the editorial verdict (event_type null).
    const { data, error } = await sb
      .from("content_archive")
      .select("id,title,summary,source,url,original_url,publisher,content_type,is_official_source")
      .or("content_type.is.null,event_type.is.null")
      .order("id", { ascending: true })
      .limit(chunk);
    if (error) return json({ ok: false, action: "classify", error: error.message, processed }, 500);
    const rows = (data ?? []) as Array<{ id: string; title: string; summary: string | null; source: string | null; url: string; original_url: string | null; publisher: string | null; content_type: string | null; is_official_source: boolean }>;
    if (rows.length === 0) break;

    for (let i = 0; i < rows.length; i += 10) {
      const batch = rows.slice(i, i + 10);
      await Promise.all(batch.map(async (r) => {
        const suffix = splitPublisherSuffix(r.title ?? "");
        const ct = (r.content_type as ContentType | null)
          ?? classifyContentType({ title: suffix.title, url: r.original_url ?? r.url, source: r.source ?? "", summary: r.summary ?? "" });
        const editorial = classifyEditorial({ title: suffix.title, summary: r.summary ?? "", contentType: ct });
        const patch: Record<string, unknown> = {
          content_type: ct,
          event_type: editorial.eventType,
          editorial_quality_score: editorial.qualityScore,
          is_official_company_news: isOfficialCompanyNewsForArchive(editorial, r.is_official_source === true),
        };
        if (suffix.title && suffix.title !== r.title) patch.title = suffix.title;      // clean stored headline
        if (!r.publisher && suffix.publisher) patch.publisher = suffix.publisher;       // recover real publisher
        try { await sb.from("content_archive").update(patch).eq("id", r.id); updated++; }
        catch (e) { console.error("[backfill-entities] classify row failed", { id: r.id, message: e instanceof Error ? e.message : String(e) }); }
      }));
    }
    processed += rows.length;
    console.info("[backfill-entities] classify page", { processed, updated });
    if (Date.now() - t0 > SOFT_TIME_LIMIT_MS) break;
  }
  const { count: remaining } = await sb.from("content_archive").select("id", { count: "exact", head: true }).or("content_type.is.null,event_type.is.null");
  const done = (remaining ?? 0) === 0;
  return json({ ok: true, action: "classify", done, processed, updated, remaining: remaining ?? 0,
    next: done ? "run action:backfill (entities) then action:verify" : "re-invoke action:classify to continue" });
}

// ── action: fix_editorial — strip false official flags from media + reclassify ─
async function runFixEditorial(sb: any, chunk: number, t0: number): Promise<Response> {
  let processed = 0;
  let cleared = 0;
  let retyped = 0;

  while (true) {
    const { data, error } = await sb
      .from("content_archive")
      .select("id,title,summary,source,url,original_url,publisher,content_type,is_official_source,is_official_company_news")
      .eq("is_official_company_news", true)
      .eq("is_official_source", false)
      .order("id", { ascending: true })
      .limit(chunk);
    if (error) return json({ ok: false, action: "fix_editorial", error: error.message, processed }, 500);
    const rows = (data ?? []) as Array<{
      id: string; title: string; summary: string | null; source: string | null;
      url: string; original_url: string | null; publisher: string | null;
      content_type: string | null; is_official_source: boolean; is_official_company_news: boolean;
    }>;
    if (rows.length === 0) break;

    for (let i = 0; i < rows.length; i += 10) {
      const batch = rows.slice(i, i + 10);
      await Promise.all(batch.map(async (r) => {
        const suffix = splitPublisherSuffix(r.title ?? "");
        const ct = classifyContentType({
          title: suffix.title, url: r.original_url ?? r.url, source: r.source ?? "", summary: r.summary ?? "",
        });
        const editorial = classifyEditorial({ title: suffix.title, summary: r.summary ?? "", contentType: ct });
        const patch: Record<string, unknown> = {
          is_official_company_news: false,
          content_type: ct,
          event_type: editorial.eventType,
          editorial_quality_score: editorial.qualityScore,
        };
        if (suffix.title && suffix.title !== r.title) patch.title = suffix.title;
        if (!r.publisher && suffix.publisher) patch.publisher = suffix.publisher;
        try {
          await sb.from("content_archive").update(patch).eq("id", r.id);
          cleared++;
          if (r.content_type !== ct) retyped++;
        } catch (e) {
          console.error("[backfill-entities] fix_editorial row failed", { id: r.id, message: e instanceof Error ? e.message : String(e) });
        }
      }));
    }
    processed += rows.length;
    console.info("[backfill-entities] fix_editorial page", { processed, cleared, retyped });
    if (Date.now() - t0 > SOFT_TIME_LIMIT_MS) break;
  }

  const { count: remaining } = await sb
    .from("content_archive")
    .select("id", { count: "exact", head: true })
    .eq("is_official_company_news", true)
    .eq("is_official_source", false);
  const done = (remaining ?? 0) === 0;
  return json({
    ok: true, action: "fix_editorial", done, processed, cleared, retyped,
    remaining: remaining ?? 0,
    next: done ? "run action:verify" : "re-invoke action:fix_editorial to continue",
  });
}

// ── action: sources — classify OFFICIAL vs MEDIA, build source_registry ──────
// Processes rows missing source_type OR already linked but still not marked
// official (Fix B backfill for articles classified at ingest without entity norms).
async function loadPrimaryEntityMap(sb: any, articleIds: string[]): Promise<Map<string, PrimaryEntity>> {
  if (!articleIds.length) return new Map();
  const { data: links } = await sb
    .from("entity_article_links")
    .select("article_id,mention_type,entities(id,normalized_name,entity_aliases(normalized_alias))")
    .in("article_id", articleIds);
  const out = new Map<string, PrimaryEntity & { rank: number }>();
  for (const l of (links ?? []) as Array<{ article_id: string; mention_type?: string; entities?: { id: string; normalized_name?: string; entity_aliases?: Array<{ normalized_alias?: string }> } }>) {
    const e = l.entities;
    if (!e?.id) continue;
    const rank = l.mention_type === "primary" ? 3 : l.mention_type === "product" ? 2 : 1;
    const norms = new Set<string>();
    if (e.normalized_name) norms.add(e.normalized_name);
    for (const a of e.entity_aliases ?? []) {
      if (a.normalized_alias) norms.add(a.normalized_alias);
    }
    const prev = out.get(l.article_id);
    if (!prev || rank > prev.rank) out.set(l.article_id, { id: e.id, norms: [...norms], rank });
  }
  const result = new Map<string, PrimaryEntity>();
  for (const [id, v] of out) result.set(id, { id: v.id, norms: v.norms });
  return result;
}

async function runSources(sb: any, chunk: number, t0: number, reclassify = false): Promise<Response> {
  const kindMap = await loadConnectorKindMap(sb);
  let processed = 0;
  let official = 0;
  let upgraded = 0;

  while (true) {
    // Default: rows never classified. With reclassify=true: linked rows that may
    // upgrade to official now that entity norms are available (one-time backfill).
    const query = sb
      .from("content_archive")
      .select("id,publisher,publisher_domain,original_url,url,source,source_type,is_official_source,entity_status")
      .order("id", { ascending: true })
      .limit(chunk);
    const { data, error } = reclassify
      ? await query.eq("entity_status", "done").eq("is_official_source", false).not("source_type", "is", null)
      : await query.is("source_type", null);
    if (error) return json({ ok: false, action: "sources", error: error.message, processed }, 500);
    const rows = (data ?? []) as Array<SourceArticleRow & { source_type: string | null; is_official_source: boolean; entity_status: string }>;
    if (rows.length === 0) break;

    const primaryMap = await loadPrimaryEntityMap(sb, rows.map((r) => r.id));

    for (let i = 0; i < rows.length; i += 8) {
      const batch = rows.slice(i, i + 8);
      await Promise.all(batch.map(async (r) => {
        const link = primaryMap.get(r.id);
        try {
          if (reclassify) {
            // Historical upgrade: needs entity links so domain can match the company.
            if (!link) return;
            const cls = classifySourceType({
              publisher: r.publisher,
              publisherDomain: r.publisher_domain,
              url: r.original_url ?? r.url,
              connectorSource: r.source,
              connectorKind: kindMap.get(r.source ?? ""),
              entityNorms: link.norms,
            });
            if (!cls.isOfficial) return;
          }
          const wasOfficial = r.is_official_source;
          const nowOfficial = await reclassifyArticleSource(sb, r, kindMap, link);
          if (nowOfficial) official++;
          if (!wasOfficial && nowOfficial) upgraded++;
        } catch (e) {
          console.error("[backfill-entities] sources row failed", { id: r.id, message: e instanceof Error ? e.message : String(e) });
        }
      }));
    }
    processed += rows.length;
    console.info("[backfill-entities] sources page", { processed, official, upgraded });
    if (Date.now() - t0 > SOFT_TIME_LIMIT_MS) break;
  }

  const { count: remainingNull } = await sb.from("content_archive").select("id", { count: "exact", head: true }).is("source_type", null);
  const done = reclassify ? processed === 0 : (remainingNull ?? 0) === 0;
  return json({
    ok: true, action: "sources", reclassify, done, processed, official, upgraded,
    remaining: reclassify ? 0 : (remainingNull ?? 0),
    next: done
      ? (reclassify ? "run action:verify" : "run action:sources with reclassify:true for historical upgrade, then verify")
      : "re-invoke action:sources to continue",
  });
}

// ── action: decode_urls — recover real article URLs on historical rows ──────
// Ingestion started capturing publisher/original_url later; older archive rows
// have url = news.google.com redirect and original_url = null. This pass decodes
// the base64 protobuf inside /articles/<...> and writes the real publisher URL
// so opening a hero (Advisor "My Pick", Top Story) goes to the real article.
async function resolveRealUrl(googleUrl: string): Promise<string | null> {
  // Try the cheap base64 decode first (works for older link format).
  const decoded = decodeGoogleNewsUrl(googleUrl);
  if (decoded) return decoded;
  // Current format: follow the redirect to the real publisher.
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), 7000);
  try {
    const res = await fetch(googleUrl, { redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": "signal-ai/1.0" } });
    const finalUrl = res.url || "";
    const host = (() => { try { return new URL(finalUrl).hostname; } catch { return ""; } })();
    // Reject Google-owned hosts (image CDN / consent / redirect) — not the article.
    if (finalUrl && host && !/(^|\.)(google\.com|googleusercontent\.com|gstatic\.com)$/.test(host)) return finalUrl;
    // Some responses embed the destination in a meta-refresh / <a>. Best effort.
    const html = (await res.text().catch(() => "")).slice(0, 4000);
    const m = html.match(/url=(https?:\/\/[^"'&]+)/i) || html.match(/href="(https?:\/\/(?!news\.google)[^"]+)"/i);
    return m?.[1] ?? null;
  } catch { return null; }
  finally { clearTimeout(id); }
}

async function runDecodeUrls(sb: any, chunk: number, t0: number): Promise<Response> {
  let processed = 0, decoded = 0, cursor = "";
  while (true) {
    // Keyset pagination by id so we ALWAYS advance, even when a row can't resolve
    // (fixes the infinite re-scan of the same rows).
    const { data, error } = await sb
      .from("content_archive")
      .select("id,url,original_url,publisher_domain")
      .is("original_url", null)
      .like("url", "%news.google.com%")
      .gt("id", cursor)
      .order("id", { ascending: true })
      .limit(chunk);
    if (error) return json({ ok: false, action: "decode_urls", error: error.message, processed }, 500);
    const rows = (data ?? []) as Array<{ id: string; url: string; publisher_domain: string | null }>;
    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].id;

    for (let i = 0; i < rows.length; i += 6) {
      const batch = rows.slice(i, i + 6);
      await Promise.all(batch.map(async (r) => {
        // Normalize the decoded link with the shared rules. If it still isn't a
        // real article (e.g. resolves back to a google shell), leave original_url
        // null rather than storing an invalid URL.
        const real = normalizeUrl(await resolveRealUrl(r.url));
        if (!real) return;
        let host = "";
        try { host = new URL(real).hostname.replace(/^www\./, "").toLowerCase(); } catch { /* ignore */ }
        const patch: Record<string, unknown> = { original_url: real };
        if (!r.publisher_domain && host) patch.publisher_domain = host;
        try { await sb.from("content_archive").update(patch).eq("id", r.id); decoded++; }
        catch (e) { console.error("[backfill-entities] decode row failed", { id: r.id, message: e instanceof Error ? e.message : String(e) }); }
      }));
    }
    processed += rows.length;
    console.info("[backfill-entities] decode_urls page", { processed, decoded, cursorTail: cursor.slice(-10) });
    if (Date.now() - t0 > SOFT_TIME_LIMIT_MS) break;
  }
  const { count: remaining } = await sb.from("content_archive").select("id", { count: "exact", head: true })
    .is("original_url", null).like("url", "%news.google.com%");
  return json({ ok: true, action: "decode_urls", done: rows_done(cursor, remaining), processed, decoded, remaining: remaining ?? 0 });
}
function rows_done(_cursor: string, remaining: number | null): boolean { return (remaining ?? 0) === 0; }

// ── action: verify ───────────────────────────────────────────────────────────
async function runVerify(sb: any): Promise<Response> {
  const results: Array<{
    term: string; results: number; official: number; media: number;
    sample: string[]; error?: string;
  }> = [];
  for (const term of VERIFY_TERMS) {
    try {
      const { data, error } = await sb.rpc("signal_search", { q_ts: toTsQuery(term), q_raw: term, max_results: 20 });
      if (error) { results.push({ term, results: 0, official: 0, media: 0, sample: [], error: error.message }); continue; }
      const rows = (data ?? []) as Array<{ title: string; section?: string; is_official_source?: boolean; publisher?: string }>;
      const official = rows.filter((r) => r.section === "official" || r.is_official_source).length;
      const media = rows.filter((r) => r.section === "analysis" && !r.is_official_source).length;
      results.push({
        term, results: rows.length, official, media,
        sample: rows.slice(0, 3).map((r) => `[${r.section ?? "?"}] ${r.publisher ?? ""}: ${r.title}`),
      });
    } catch (e) {
      results.push({ term, results: 0, official: 0, media: 0, sample: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  const passing = results.filter((r) => r.results > 0 && r.official > 0).length;
  console.info("[backfill-entities] verify", { passing, total: VERIFY_TERMS.length, results });
  return json({ ok: true, action: "verify", passing, total: VERIFY_TERMS.length, results });
}

// ── action: seed (copy raw_items → content_archive) ──────────────────────────
async function runSeed(sb: any, t0: number): Promise<Response> {
  const { data: prog } = await sb.from("entity_backfill_progress").select("cursor_id").eq("id", 1).single();
  let cursor: string = prog?.cursor_id ?? "";
  let copied = 0;
  let done = false;

  while (true) {
    const { data, error } = await sb.rpc("copy_raw_to_archive", { p_after: cursor, p_limit: SEED_CHUNK });
    if (error) {
      await saveProgress(sb, { status: "error", last_error: `seed: ${error.message}` });
      return json({ ok: false, action: "seed", error: error.message, copied, cursor }, 500);
    }
    const row = (Array.isArray(data) ? data[0] : data) as { copied: number; last_id: string | null } | undefined;
    const lastId = row?.last_id ?? null;
    copied += row?.copied ?? 0;
    if (!lastId) { done = true; break; }
    cursor = lastId;
    await saveProgress(sb, { cursor_id: cursor, status: "running" });
    console.info("[backfill-entities] seed page", { copied, cursorTail: cursor.slice(-12) });
    if (Date.now() - t0 > SOFT_TIME_LIMIT_MS) break;
  }

  if (done) await saveProgress(sb, { cursor_id: null, status: "idle" }); // ready for processing
  const pending = await countArchive(sb, "pending");
  return json({
    ok: true, action: "seed", done, copied, pending,
    next: done ? "run action:backfill to process pending" : "re-invoke action:seed to continue",
    ms: Date.now() - t0,
  });
}

// ── action: backfill (process pending content_archive rows) ──────────────────
async function runProcess(sb: any, chunk: number, t0: number): Promise<Response> {
  await saveProgress(sb, { status: "running", started_at: new Date().toISOString() });
  const kindMap = await loadConnectorKindMap(sb);
  const total = await countArchive(sb);
  let processed = 0;
  let linked = 0;
  let pages = 0;
  const nowIso = () => new Date().toISOString();

  while (true) {
    // Claim a page: pending rows, plus stale 'processing' rows to self-heal.
    const { data, error } = await sb
      .from("content_archive")
      .select("id,title,summary,full_content,entity_status,updated_at")
      .or(`entity_status.eq.pending,and(entity_status.eq.processing,updated_at.lt.${new Date(Date.now() - STALE_PROCESSING_MS).toISOString()})`)
      .order("id", { ascending: true })
      .limit(chunk);
    if (error) {
      await saveProgress(sb, { status: "error", last_error: error.message });
      return json({ ok: false, action: "backfill", error: error.message, processed, linked }, 500);
    }
    const rows = (data ?? []) as (ArchiveRow & { entity_status: string })[];
    if (rows.length === 0) break;

    const ids = rows.map((r) => r.id);
    await sb.from("content_archive").update({ entity_status: "processing", updated_at: nowIso() }).in("id", ids);

    const doneIds: string[] = [];
    const errorIds: string[] = [];
    for (let i = 0; i < rows.length; i += CONCURRENCY) {
      const batch = rows.slice(i, i + CONCURRENCY);
      await Promise.all(batch.map(async (r) => {
        try {
          const produced = await processArticle(sb, r, kindMap);
          if (produced) linked++;
          doneIds.push(r.id);
        } catch (e) {
          console.error("[backfill-entities] article failed", { id: r.id, message: e instanceof Error ? e.message : String(e) });
          errorIds.push(r.id);
        }
      }));
    }

    if (doneIds.length) await sb.from("content_archive").update({ entity_status: "done", updated_at: nowIso() }).in("id", doneIds);
    if (errorIds.length) await sb.from("content_archive").update({ entity_status: "error", updated_at: nowIso() }).in("id", errorIds);

    processed += rows.length;
    pages++;
    await saveProgress(sb, { processed, linked, total, status: "running" });
    console.info("[backfill-entities] page", { pages, processed, linked, total });

    if (Date.now() - t0 > SOFT_TIME_LIMIT_MS) break;
  }

  const pending = await countArchive(sb, "pending");
  const done = pending === 0;
  if (done) {
    try {
      await withRetry(async () => {
        const { error } = await sb.rpc("refresh_entity_metrics");
        if (error) throw new Error(error.message ?? String(error));
      });
    } catch (e) {
      console.error("[backfill-entities] metrics refresh failed", { message: e instanceof Error ? e.message : String(e) });
    }
    await saveProgress(sb, { status: "done", last_error: null });
    console.info("[backfill-entities] complete", { processed, linked, total });
  }

  return json({
    ok: true, action: "backfill", done, status: done ? "done" : "running",
    processed, linked, total, pending, pages,
    extraction: isConfigured() ? "ai" : "regex-fallback",
    ms: Date.now() - t0,
    next: done ? "run action:verify" : "re-invoke action:backfill to continue",
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const adminError = requireAdmin(req, corsHeaders);
  if (adminError) return adminError;

  let action = "backfill";
  let chunk = DEFAULT_CHUNK;
  let reclassify = false;
  try {
    const body = await req.json();
    if (body?.action) action = String(body.action);
    if (body?.chunk) chunk = Math.min(200, Math.max(1, Number(body.chunk) || DEFAULT_CHUNK));
    if (body?.reclassify === true) reclassify = true;
  } catch { /* default */ }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const t0 = Date.now();

  try {
    if (action === "status") {
      const [total, pending, done, errored] = await Promise.all([
        countArchive(sb), countArchive(sb, "pending"), countArchive(sb, "done"), countArchive(sb, "error"),
      ]);
      const { data: prog } = await sb.from("entity_backfill_progress").select("*").eq("id", 1).single();
      return json({ ok: true, action, archive: { total, pending, done, error: errored }, progress: prog });
    }

    if (action === "reset") {
      await sb.from("content_archive").update({ entity_status: "pending", updated_at: new Date().toISOString() }).neq("entity_status", "pending");
      await saveProgress(sb, { cursor_id: null, processed: 0, linked: 0, total: null, status: "idle", last_error: null, started_at: null });
      console.info("[backfill-entities] reset (all rows requeued)");
      return json({ ok: true, action, message: "all archived rows requeued to pending" });
    }

    if (action === "verify") return await runVerify(sb);
    if (action === "seed") return await runSeed(sb, t0);
    if (action === "classify") return await runClassify(sb, chunk, t0);
    if (action === "fix_editorial") return await runFixEditorial(sb, chunk, t0);
    if (action === "sources") return await runSources(sb, chunk, t0, reclassify);
    if (action === "decode_urls") return await runDecodeUrls(sb, chunk, t0);
    return await runProcess(sb, chunk, t0);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[backfill-entities] slice failed", { action, message });
    await saveProgress(sb, { status: "error", last_error: message });
    return json({ ok: false, action, status: "error", error: message }, 500);
  }
});
