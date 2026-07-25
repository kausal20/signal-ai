// article-summary — Signal Summary generator for a single article.
// Reads full_content (falls back to title+summary) from content_archive, asks
// the AI provider for a 3-4 line factual briefing, and caches it back on the
// row. Regeneration is gated on a content hash so unchanged articles never hit
// the AI again. On any AI failure the fn falls back to a deterministic summary
// derived from the article's first two grounded sentences (no hallucination).
//
// POST { article_id: string, refresh?: boolean }
//   → { ok, summary?, cached?, source: "cache"|"llm"|"deterministic"|"none" }

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { completeChat, isConfigured } from "../_shared/ai_provider.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SYSTEM_PROMPT = `You write "Signal Summary" — the AI briefing shown at the top of a Signal news card. Given the full article, produce a concise, neutral, factual 3-4 sentence summary that answers:
1) What the article is about.
2) The main takeaway.
3) Why a reader should care.
HARD RULES:
- 3-4 sentences, 40-70 words total.
- Do NOT copy sentences from the article verbatim.
- Do NOT include the article's opening/first paragraph as-is.
- Do NOT include opinions, hype, marketing language, or exaggeration.
- Do NOT start with "This article…" / "The article…".
- Neutral and evergreen. Never end mid-sentence.
- If the input is insufficient, output exactly: NO_SUMMARY.
Return ONLY the summary text.`;

// Deno's Web Crypto exposes SHA-1/256/384/512 but NOT MD5 — SHA-1 is fine here,
// we only need a stable hash of the article content for cache invalidation.
async function contentHash(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const h = await crypto.subtle.digest("SHA-1", buf);
  return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function stripHtml(s: string): string {
  return s.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&nbsp;| /gi, " ").replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'").replace(/&quot;/gi, '"').replace(/&lt;/gi, "<").replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ").trim();
}

function shape(text: string): string | null {
  const t = stripHtml(text);
  if (t.length < 40) return null;
  const sents = t.split(/(?<=[.!?])\s+(?=[A-Z“"‘'(])/).map((s) => s.trim()).filter(Boolean);
  const out: string[] = [];
  let words = 0;
  for (const s of sents.slice(0, 4)) {
    const w = s.split(/\s+/).length;
    if (out.length >= 3 && words + w > 72) break;
    out.push(s); words += w;
    if (words >= 60 && out.length >= 3) break;
  }
  if (out.length < 2) return null;
  let joined = out.join(" ").trim();
  if (!/[.!?]$/.test(joined)) joined += ".";
  return joined;
}

// Deterministic fallback when the AI provider is down. NEVER copies the title,
// paragraph 1, or a near-restatement of the title. Picks 2-3 grounded sentences
// that add NEW information and are readable on their own.
function tokenSet(s: string): Set<string> {
  const STOP = new Set(["the","a","an","and","or","of","for","in","on","to","is","are","was","were","be","by","with","as","that","this","it","its","at","from","but","not"]);
  return new Set(s.toLowerCase().split(/\W+/).filter((w) => w.length >= 4 && !STOP.has(w)));
}
function overlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let n = 0; for (const t of a) if (b.has(t)) n++;
  return n / Math.min(a.size, b.size);
}
function deterministicSummary(title: string, body: string): string | null {
  if (!body) return null;
  const cleaned = stripHtml(body);
  const titleTokens = tokenSet(title);
  const rawSents = cleaned.split(/(?<=[.!?])\s+(?=[A-Z“"‘'(])/).map((s) => s.trim()).filter((s) => s.length >= 40);
  const sents: string[] = [];
  for (let i = 0; i < rawSents.length; i++) {
    const s = rawSents[i];
    // Skip sentences that essentially restate the title (>=60% title-token
    // overlap) or contain the full title verbatim. Kills the "IDP plus RPA vs
    // …" echo problem where the article intro repeats the headline.
    const sTokens = tokenSet(s);
    if (title && s.toLowerCase().includes(title.toLowerCase().slice(0, 30))) continue;
    if (overlap(sTokens, titleTokens) >= 0.6) continue;
    // Drop paragraph-1 (spec: never reuse the intro).
    if (i === 0) continue;
    sents.push(s);
    if (sents.length >= 8) break;   // small candidate pool
  }
  if (sents.length === 0) return null;
  // Prefer sentences with meaningful new info (numbers / entities / short-ish).
  const scored = sents.map((s) => ({
    s,
    score:
      (/\b\d/.test(s) ? 2 : 0)                     // has a number/stat
      + (s.length >= 60 && s.length <= 220 ? 1 : 0) // readable length
      - Math.max(0, overlap(tokenSet(s), titleTokens) - 0.3) * 4,   // still penalise partial echoes
  })).sort((a, b) => b.score - a.score);

  const picked: string[] = [];
  const seen = new Set<string>();
  for (const { s } of scored) {
    const st = tokenSet(s);
    // Skip near-duplicates of already-picked lines.
    if (picked.some((p) => overlap(tokenSet(p), st) >= 0.55)) continue;
    if (seen.has(s)) continue;
    seen.add(s);
    picked.push(s);
    if (picked.length >= 3) break;
  }
  return shape(picked.join(" "));
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const t0 = Date.now();
  let body: any = {}; try { body = await req.json(); } catch { /* empty */ }
  const articleId = String(body?.article_id ?? "").slice(0, 120);
  const refresh = body?.refresh === true;
  const ok = (payload: unknown) =>
    new Response(JSON.stringify(payload), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  if (!articleId) return ok({ ok: false, error: "article_id required" });

  // Look up in content_archive first (has full_content); fall back to feed_items
  // (the curated Home feed uses cluster IDs that don't exist in the archive).
  const { data: archiveRow } = await sb.from("content_archive")
    .select("id,title,summary,full_content,ai_summary,ai_summary_hash,archive_status")
    .eq("id", articleId).maybeSingle();
  let row: any = archiveRow;
  let table: "content_archive" | "feed_items" = "content_archive";
  if (!row) {
    const { data: feedRow } = await sb.from("feed_items")
      .select("id,title,summary,what_happened,why_it_matters,ai_summary,ai_summary_hash")
      .eq("id", articleId).maybeSingle();
    if (feedRow) { row = feedRow; table = "feed_items"; }
  }
  if (!row) return ok({ ok: false, error: "not_found" });

  // NEVER include the title in the summary source — deterministic scoring
  // used to pick it back as a "high-overlap" sentence, producing summaries that
  // just echoed the headline. Only real body text goes in.
  const source = (row.full_content ?? "").length > 200
    ? row.full_content
    : [row.what_happened, row.summary, row.why_it_matters].filter(Boolean).join("\n\n");
  const hash = await contentHash(`${row.title}|${source.slice(0, 8000)}`);
  if (!refresh && row.ai_summary && row.ai_summary_hash === hash) {
    return ok({ ok: true, summary: row.ai_summary, cached: true, source: "cache", ms: Date.now() - t0 });
  }

  let generated: string | null = null;
  let genSource: "llm" | "deterministic" | "none" = "none";

  if (isConfigured()) {
    try {
      const res = await completeChat<any>({
        feature: "article-summary",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: `TITLE: ${row.title}\n\nARTICLE:\n${stripHtml(source).slice(0, 8000)}` },
        ],
        timeoutMs: 20_000,
      });
      if (res.success) {
        const raw = String(res.data.choices?.[0]?.message?.content ?? "").trim();
        if (raw && !/NO_SUMMARY/.test(raw)) {
          const shaped = shape(raw.replace(/^\s*(?:[-*•]|\d+[.)])\s+/gm, ""));
          if (shaped) { generated = shaped; genSource = "llm"; }
        }
      } else {
        console.warn("[article-summary] AI unavailable", res.code);
      }
    } catch (e) { console.error("[article-summary] AI error", e); }
  }

  if (!generated) {
    const det = deterministicSummary(row.title, source);
    if (det) { generated = det; genSource = "deterministic"; }
  }
  if (!generated) return ok({ ok: true, summary: null, source: "none", ms: Date.now() - t0 });

  // Persist off the response path (to whichever table the row came from).
  const patch = table === "content_archive"
    ? { ai_summary: generated, ai_summary_hash: hash, ai_summary_generated_at: new Date().toISOString() }
    : { ai_summary: generated, ai_summary_hash: hash };
  const persist = sb.from(table).update(patch).eq("id", articleId);
  const waitUntil = (globalThis as any)?.EdgeRuntime?.waitUntil;
  if (typeof waitUntil === "function") waitUntil.call((globalThis as any).EdgeRuntime, persist.then(() => {}, () => {}));
  else await persist;

  return ok({ ok: true, summary: generated, cached: false, source: genSource, ms: Date.now() - t0 });
});
