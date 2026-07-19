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
//
// Admin-only. Call with the service_role key (or an admin JWT) as Bearer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin_auth.ts";
import { extractStoryEntities, toEntityLinks } from "../_shared/entity_extract.ts";
import { isConfigured } from "../_shared/ai_provider.ts";
import { toTsQuery } from "../_shared/search.ts";
import { classifyContentType, splitPublisherSuffix, type ContentType } from "../_shared/content_type.ts";
import { classifyEditorial } from "../_shared/editorial.ts";

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
  "GitHub", "Perplexity", "Cursor", "Lovable", "Higgsfield",
  "Firecrawl", "Runway", "DeepSeek", "Mistral",
];

interface ArchiveRow {
  id: string;
  title: string;
  summary: string | null;
  full_content: string | null;
}

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

// Extract + link one archived article. Returns true if it produced >= 1 link.
async function processArticle(sb: any, row: ArchiveRow): Promise<boolean> {
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
      .select("id,title,summary,source,url,original_url,publisher,content_type")
      .or("content_type.is.null,event_type.is.null")
      .order("id", { ascending: true })
      .limit(chunk);
    if (error) return json({ ok: false, action: "classify", error: error.message, processed }, 500);
    const rows = (data ?? []) as Array<{ id: string; title: string; summary: string | null; source: string | null; url: string; original_url: string | null; publisher: string | null; content_type: string | null }>;
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
          is_official_company_news: editorial.isOfficialCompanyNews,
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

// ── action: verify ───────────────────────────────────────────────────────────
async function runVerify(sb: any): Promise<Response> {
  const results: Array<{ term: string; results: number; sample: string[]; error?: string }> = [];
  for (const term of VERIFY_TERMS) {
    try {
      const { data, error } = await sb.rpc("signal_search", { q_ts: toTsQuery(term), q_raw: term, max_results: 5 });
      if (error) { results.push({ term, results: 0, sample: [], error: error.message }); continue; }
      const rows = (data ?? []) as Array<{ title: string }>;
      results.push({ term, results: rows.length, sample: rows.slice(0, 3).map((r) => r.title) });
    } catch (e) {
      results.push({ term, results: 0, sample: [], error: e instanceof Error ? e.message : String(e) });
    }
  }
  const passing = results.filter((r) => r.results > 0).length;
  console.info("[backfill-entities] verify", { passing, total: VERIFY_TERMS.length });
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
          const produced = await processArticle(sb, r);
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
  try {
    const body = await req.json();
    if (body?.action) action = String(body.action);
    if (body?.chunk) chunk = Math.min(200, Math.max(1, Number(body.chunk) || DEFAULT_CHUNK));
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
    return await runProcess(sb, chunk, t0);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[backfill-entities] slice failed", { action, message });
    await saveProgress(sb, { status: "error", last_error: message });
    return json({ ok: false, action, status: "error", error: message }, 500);
  }
});
