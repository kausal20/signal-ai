// relationship-extract — Phase 3B knowledge-graph population.
//
// Admin-only, manually invoked. Runs a SMALL sample batch: picks a handful of
// already entity-linked articles, extracts evidence-backed relationships
// between their already-resolved entities, and writes accepted candidates
// through link_entity_relationship() (centralized merged-entity resolution,
// self-ref/archived rejection, dedup). Nothing is wired into the automatic
// ingestion pipeline yet — this is a controlled, on-demand tool only.
//
// POST JSON: { "action": "sample", "limit"?: number }  (limit clamped to 1..30)
//
// Call with the service_role key (or an admin JWT) as Bearer.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin_auth.ts";
import {
  extractRelationships, type EntityRef, type ValidatedCandidate, type RejectedCandidate,
} from "../_shared/relationship_extract.ts";
import { isConfigured } from "../_shared/ai_provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const DEFAULT_LIMIT = 15;
const MAX_LIMIT = 30;            // hard cap — this is a sample tool, not a backfill
const CANDIDATE_POOL = 80;       // articles scanned to find ones with >=2 linked entities
const SOURCE_LABEL = "relationship_extract_llm_sample";

// deno-lint-ignore no-explicit-any
type SB = any;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ArticleRow {
  id: string;
  title: string;
  summary: string | null;
  full_content: string | null;
}

// Pick `limit` recent, already entity-linked articles that have >=2 distinct
// live (non-archived) resolved entities. Small client-side scan over a
// bounded pool — this is a sample tool, not meant to scale.
async function pickSampleArticles(sb: SB, limit: number): Promise<{ article: ArticleRow; entities: EntityRef[] }[]> {
  const { data: articles, error: articlesErr } = await sb
    .from("content_archive")
    .select("id,title,summary,full_content")
    .eq("entity_status", "done")
    .order("created_at", { ascending: false })
    .limit(CANDIDATE_POOL);
  if (articlesErr || !articles?.length) return [];

  const ids = (articles as ArticleRow[]).map((a) => a.id);
  const { data: links, error: linksErr } = await sb
    .from("entity_article_links")
    .select("article_id, entities!inner(id, canonical_name, type, status)")
    .in("article_id", ids)
    .neq("entities.status", "archived");
  if (linksErr || !links?.length) return [];

  const byArticle = new Map<string, EntityRef[]>();
  for (const row of links as Array<{ article_id: string; entities: { id: string; canonical_name: string; type: string } }>) {
    const e = row.entities;
    if (!e?.id) continue;
    const list = byArticle.get(row.article_id) ?? [];
    if (!list.some((x) => x.id === e.id)) list.push({ id: e.id, name: e.canonical_name, type: e.type });
    byArticle.set(row.article_id, list);
  }

  const articleMap = new Map((articles as ArticleRow[]).map((a) => [a.id, a]));
  const out: { article: ArticleRow; entities: EntityRef[] }[] = [];
  for (const id of ids) {
    const entities = byArticle.get(id);
    if (!entities || entities.length < 2) continue;
    const article = articleMap.get(id);
    if (!article) continue;
    out.push({ article, entities });
    if (out.length >= limit) break;
  }
  return out;
}

interface ExampleReport {
  article_id: string;
  from: string;
  to: string;
  type: string;
  confidence: number;
  evidence: string;
}

async function runSample(sb: SB, limit: number): Promise<Response> {
  if (!isConfigured()) {
    return json({
      ok: false, action: "sample",
      error: "AI provider not configured (MESH_API_KEY / DEFAULT_AI_MODEL) — no relationships were extracted.",
    }, 200);
  }

  const batch = await pickSampleArticles(sb, limit);
  if (!batch.length) {
    return json({
      ok: true, action: "sample", articles_scanned: 0, articles_with_candidates: 0,
      detected: 0, accepted: 0, rejected: 0,
      note: "No entity-linked articles with 2+ resolved entities found in the recent pool.",
    });
  }

  let detected = 0;
  let acceptedCount = 0;
  const rejectedByReason: Record<string, number> = {};
  const confidenceBuckets = { "0.0-0.4": 0, "0.4-0.75": 0, "0.75-0.9": 0, "0.9-1.0": 0 };
  const examples: ExampleReport[] = [];
  const writeFailures: Array<{ article_id: string; error: string }> = [];
  let articlesWithCandidates = 0;

  for (const { article, entities } of batch) {
    const result = await extractRelationships(
      { id: article.id, title: article.title, summary: article.summary, full_content: article.full_content },
      entities,
    );
    if (result.candidatesRaw.length > 0) articlesWithCandidates++;
    detected += result.candidatesRaw.length;

    for (const c of result.candidatesRaw) {
      const conf = Number(c.confidence);
      if (Number.isFinite(conf)) {
        if (conf < 0.4) confidenceBuckets["0.0-0.4"]++;
        else if (conf < 0.75) confidenceBuckets["0.4-0.75"]++;
        else if (conf < 0.9) confidenceBuckets["0.75-0.9"]++;
        else confidenceBuckets["0.9-1.0"]++;
      }
    }

    for (const r of result.rejected as RejectedCandidate[]) {
      rejectedByReason[r.reason] = (rejectedByReason[r.reason] ?? 0) + 1;
    }

    for (const acc of result.accepted as ValidatedCandidate[]) {
      const { error } = await sb.rpc("link_entity_relationship", {
        p_from: acc.fromId, p_to: acc.toId, p_type: acc.type,
        p_confidence: acc.confidence, p_article_id: article.id, p_source: SOURCE_LABEL,
      });
      if (error) {
        writeFailures.push({ article_id: article.id, error: error.message ?? String(error) });
        continue;
      }
      acceptedCount++;
      if (examples.length < 8) {
        examples.push({
          article_id: article.id, from: acc.fromName, to: acc.toName,
          type: acc.type, confidence: acc.confidence, evidence: acc.evidence,
        });
      }
    }
  }

  const rejectedCount = Object.values(rejectedByReason).reduce((a, b) => a + b, 0);
  const falsePositiveConcerns: string[] = [];
  if ((rejectedByReason["evidence_not_grounded"] ?? 0) > 0) {
    falsePositiveConcerns.push(`${rejectedByReason["evidence_not_grounded"]} candidate(s) rejected for ungrounded/paraphrased evidence — the model claimed a quote that wasn't verbatim in the article.`);
  }
  if ((rejectedByReason["ambiguous"] ?? 0) > 0) {
    falsePositiveConcerns.push(`${rejectedByReason["ambiguous"]} candidate(s) rejected as ambiguous (confidence between ${0.4} and ${0.75}) — worth spot-checking if this bucket is large.`);
  }
  if (writeFailures.length > 0) {
    falsePositiveConcerns.push(`${writeFailures.length} accepted candidate(s) failed to write via link_entity_relationship — see write_failures.`);
  }
  if (falsePositiveConcerns.length === 0 && detected > 0) {
    falsePositiveConcerns.push("No suspicious rejection patterns observed in this sample.");
  }

  return json({
    ok: true,
    action: "sample",
    articles_scanned: batch.length,
    articles_with_candidates: articlesWithCandidates,
    detected,
    accepted: acceptedCount,
    rejected: rejectedCount,
    rejected_by_reason: rejectedByReason,
    confidence_distribution: confidenceBuckets,
    accepted_examples: examples,
    write_failures: writeFailures,
    false_positive_concerns: falsePositiveConcerns,
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const adminError = requireAdmin(req, corsHeaders);
  if (adminError) return adminError;

  let action = "sample";
  let limit = DEFAULT_LIMIT;
  try {
    const body = await req.json();
    if (body?.action) action = String(body.action);
    if (body?.limit) limit = Math.min(MAX_LIMIT, Math.max(1, Number(body.limit) || DEFAULT_LIMIT));
  } catch { /* defaults */ }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    if (action === "sample") return await runSample(sb, limit);
    return json({ ok: false, error: `unknown action "${action}"` }, 400);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[relationship-extract] failed", { action, message });
    return json({ ok: false, action, error: message }, 500);
  }
});
