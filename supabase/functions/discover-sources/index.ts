// discover-sources — self-maintaining Official Source Discovery.
//
// For each AI company entity, resolve its official domain (learned from prior
// official articles, else guess + verify), crawl the homepage for a declared
// RSS/Atom feed (or probe common feed paths), and detect its blog / newsroom /
// press / docs / changelog / research / GitHub. Store everything on the entity +
// source_registry, and — when a feed is found — auto-create an OFFICIAL connector
// so the EXISTING ingestion pipeline monitors it. No manual connector lists; any
// future AI company is discovered and monitored automatically.
//
// Resumable (entities.official_sources_checked_at cursor) + time-bounded, so a
// cron can drain the backlog and re-crawl stale entities. Admin-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin_auth.ts";
import {
  candidateDomains, parseFeedLinks, nameMatchesPage, looksLikeFeed,
  RSS_PROBE_PATHS, SECTION_PROBES, CHANNEL_COLUMN, absoluteUrl,
} from "../_shared/source_discovery.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const SOFT_TIME_LIMIT_MS = 105_000;
const DEFAULT_BATCH = 5;
const FETCH_TIMEOUT_MS = 5_000;
const PER_ENTITY_MS = 22_000;   // hard budget per entity so one slow site can't stall the run
const RECHECK_DAYS = 30;             // re-crawl an entity at most this often
const UA = "signal-ai-discovery/1.0 (+https://signal.ai)";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function fetchText(url: string, method: "GET" | "HEAD" = "GET"): Promise<{ ok: boolean; status: number; finalUrl: string; body: string }> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*" } });
    const body = method === "GET" ? (await res.text().catch(() => "")).slice(0, 60_000) : "";
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, body };
  } catch {
    return { ok: false, status: 0, finalUrl: url, body: "" };
  } finally { clearTimeout(id); }
}

interface Entity { id: string; canonical_name: string; slug: string; official_domain: string | null; website: string | null }

interface Discovered {
  domain: string | null;
  channels: Record<string, string>;   // column -> url
  status: "ok" | "partial" | "none";
}

// Resolve the entity's official domain: prefer the learned one, else verify guesses.
async function resolveDomain(e: Entity): Promise<{ domain: string; homepage: string; html: string } | null> {
  const tryDomain = async (domain: string): Promise<{ domain: string; homepage: string; html: string } | null> => {
    for (const scheme of ["https://", "http://"]) {
      const res = await fetchText(`${scheme}${domain}`);
      if (res.ok && res.body && (e.official_domain === domain || nameMatchesPage(res.body, e.canonical_name))) {
        return { domain, homepage: res.finalUrl, html: res.body };
      }
    }
    return null;
  };
  if (e.official_domain) { const r = await tryDomain(e.official_domain); if (r) return r; }
  for (const cand of candidateDomains(e.canonical_name)) {
    const r = await tryDomain(cand);
    if (r) return r;
  }
  return null;
}

async function discoverForEntity(e: Entity, deadline: number): Promise<Discovered> {
  const resolved = await resolveDomain(e);
  if (!resolved) return { domain: null, channels: {}, status: "none" };
  const { domain, homepage, html } = resolved;
  const channels: Record<string, string> = {};
  const overBudget = () => Date.now() > deadline;

  // 1) RSS: declared <link> feeds first, else probe common paths (budget-bounded).
  let feed = parseFeedLinks(html, homepage)[0] ?? "";
  if (!feed) {
    for (const path of RSS_PROBE_PATHS) {
      if (overBudget()) break;
      const res = await fetchText(absoluteUrl(`https://${domain}`, path));
      if (res.ok && looksLikeFeed(res.body)) { feed = res.finalUrl; break; }
    }
  }
  if (feed) channels[CHANNEL_COLUMN.rss] = feed;

  // 2) Section channels: first path that resolves (and isn't a soft-404 to home).
  for (const { key, paths } of SECTION_PROBES) {
    if (overBudget()) break;
    for (const path of paths) {
      if (overBudget()) break;
      const res = await fetchText(absoluteUrl(`https://${domain}`, path), "HEAD");
      const finalPath = (() => { try { return new URL(res.finalUrl).pathname.replace(/\/$/, ""); } catch { return ""; } })();
      if (res.ok && finalPath.length > 1) { channels[CHANNEL_COLUMN[key]] = `https://${domain}${path}`; break; }
    }
  }

  // 3) GitHub org (guess + verify).
  if (!overBudget()) {
    const ghSlug = e.canonical_name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (ghSlug.length >= 2) {
      const gh = await fetchText(`https://github.com/${ghSlug}`, "HEAD");
      if (gh.ok && /github\.com\//.test(gh.finalUrl) && !/\/(404|search)/.test(gh.finalUrl)) {
        channels[CHANNEL_COLUMN.github] = `https://github.com/${ghSlug}`;
      }
    }
  }

  const status: Discovered["status"] = Object.keys(channels).length ? (channels[CHANNEL_COLUMN.rss] ? "ok" : "partial") : "partial";
  return { domain, channels, status };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const adminError = requireAdmin(req, corsHeaders);
  if (adminError) return adminError;

  let batch = DEFAULT_BATCH;
  try { const b = await req.json(); if (b?.batch) batch = Math.min(20, Math.max(1, Number(b.batch) || DEFAULT_BATCH)); } catch { /* default */ }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const t0 = Date.now();
  const staleBefore = new Date(Date.now() - RECHECK_DAYS * 864e5).toISOString();

  // Unchecked entities first, then the stalest — only AI companies.
  const { data, error } = await sb
    .from("entities")
    .select("id,canonical_name,slug,official_domain,website")
    .eq("is_ai", true).eq("type", "company")
    .or(`official_sources_checked_at.is.null,official_sources_checked_at.lt.${staleBefore}`)
    .order("official_sources_checked_at", { ascending: true, nullsFirst: true })
    .limit(batch);
  if (error) return json({ ok: false, error: error.message }, 500);
  const entities = (data ?? []) as Entity[];

  let processed = 0, withFeed = 0, withDomain = 0, connectorsCreated = 0;

  for (const e of entities) {
    if (Date.now() - t0 > SOFT_TIME_LIMIT_MS) break;
    try {
      const d = await discoverForEntity(e, Date.now() + PER_ENTITY_MS);
      const patch: Record<string, unknown> = {
        official_sources_checked_at: new Date().toISOString(),
        official_discovery_status: d.status,
      };
      if (d.domain) { patch.official_domain = d.domain; withDomain++; }
      for (const [col, url] of Object.entries(d.channels)) patch[col] = url;
      await sb.from("entities").update(patch).eq("id", e.id);

      if (d.domain) {
        await sb.rpc("upsert_source_registry", {
          p_publisher: e.canonical_name, p_domain: d.domain, p_source_type: "OFFICIAL_BLOG",
          p_trust: 100, p_company_id: e.id, p_website: `https://${d.domain}`,
          p_rss: d.channels[CHANNEL_COLUMN.rss] ?? null,
        });
      }

      // Auto-create an OFFICIAL connector so ingestion monitors the feed — this is
      // what makes the system self-maintaining (no manual connectors).
      const feed = d.channels[CHANNEL_COLUMN.rss];
      if (feed) {
        withFeed++;
        const connectorId = `official_${e.slug}`.slice(0, 60);
        const { error: cErr } = await sb.from("source_connectors").upsert({
          source: connectorId,
          source_label: `${e.canonical_name} (Official)`,
          source_kind: "official",
          tier: "fast",
          source_weight: 1.6,
          trust_score: 100,
          rss_url: feed,
          news_query: null,
          enabled: true,
        }, { onConflict: "source" });
        if (!cErr) connectorsCreated++;
      }
      processed++;
    } catch (err) {
      console.error("[discover-sources] entity failed", { id: e.id, name: e.canonical_name, message: err instanceof Error ? err.message : String(err) });
      await sb.from("entities").update({ official_sources_checked_at: new Date().toISOString(), official_discovery_status: "error" }).eq("id", e.id);
    }
  }

  const { count: remaining } = await sb.from("entities").select("id", { count: "exact", head: true })
    .eq("is_ai", true).eq("type", "company")
    .or(`official_sources_checked_at.is.null,official_sources_checked_at.lt.${staleBefore}`);

  return json({
    ok: true, processed, with_domain: withDomain, with_feed: withFeed, connectors_created: connectorsCreated,
    remaining: remaining ?? 0, done: (remaining ?? 0) === 0, ms: Date.now() - t0,
    next: (remaining ?? 0) === 0 ? "all entities crawled" : "re-invoke to continue",
  });
});
