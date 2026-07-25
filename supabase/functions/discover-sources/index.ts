// discover-sources — Official Source Discovery Engine (v2).
//
// For each AI entity: resolve its official domain (learned → guessed → verified),
// then run MULTIPLE discovery methods — declared <link> feeds, robots.txt →
// sitemap feeds, common feed-path probes, section probes (blog/newsroom/press/
// docs/changelog/research), subdomain probes, GitHub org + releases atom — and
// verify with HTTPS + brand-name match + feed validity → a confidence score.
//
// Everything verified is written to the KNOWLEDGE GRAPH + REGISTRIES:
//   • entities.official_*        (channel URLs)
//   • official_publishers        (domain → entity; THE authority for Official News)
//   • source_registry            (publisher metadata)
//   • source_connectors          (entity-linked, per-channel, crawl_frequency)
// so new entities become fully ingested + classified with no manual config.
//
// Resumable (official_sources_checked_at cursor) + time-bounded. Admin-only.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin_auth.ts";
import {
  candidateDomains, parseFeedLinks, nameMatchesPage, looksLikeFeed,
  RSS_PROBE_PATHS_EXT, SECTION_PROBES, SUBDOMAIN_PROBES, CHANNEL_COLUMN, CHANNEL_FREQUENCY,
  absoluteUrl, hostOf, parseRobotsSitemaps, parseSitemapFeeds, extractPublisherName,
  githubFeeds, verificationConfidence, type OfficialChannel,
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
const PER_ENTITY_MS = 24_000;
const RECHECK_DAYS = 30;
const UA = "signal-ai-discovery/2.0 (+https://signal.ai)";

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

async function fetchText(url: string, method: "GET" | "HEAD" = "GET"): Promise<{ ok: boolean; status: number; finalUrl: string; body: string }> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { method, redirect: "follow", signal: ctrl.signal, headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/xml,application/rss+xml,*/*" } });
    const body = method === "GET" ? (await res.text().catch(() => "")).slice(0, 80_000) : "";
    return { ok: res.ok, status: res.status, finalUrl: res.url || url, body };
  } catch {
    return { ok: false, status: 0, finalUrl: url, body: "" };
  } finally { clearTimeout(id); }
}

interface Entity { id: string; canonical_name: string; slug: string; official_domain: string | null; website: string | null }

interface Discovered {
  domain: string | null;
  homepage: string;
  channels: Record<string, string>;      // column -> url
  feeds: { url: string; channel: OfficialChannel | "github" }[];  // ingestable feeds
  // UOCAE — scored acquisition sources (primary + fallbacks) with connector type.
  sources: { type: string; url: string; url_pattern?: string; score: number }[];
  nameMatch: boolean;
  feedValid: boolean;
  confidence: number;
  status: "ok" | "partial" | "none";
}

// UOCAE Source Scoring (task-defined). Highest score wins the primary slot;
// the rest become fallbacks that the maintenance job can promote when the
// primary dies.
const TYPE_SCORE: Record<string, number> = {
  rss: 100, atom: 98, api: 96, sitemap: 95, blog: 94, newsroom: 93,
  changelog: 92, docs: 90, releases: 88, github: 88, static: 72,
};

async function resolveDomain(e: Entity): Promise<{ domain: string; homepage: string; html: string; learned: boolean } | null> {
  const tryDomain = async (domain: string, learned: boolean) => {
    for (const scheme of ["https://", "http://"]) {
      const res = await fetchText(`${scheme}${domain}`);
      if (res.ok && res.body && (learned || nameMatchesPage(res.body, e.canonical_name))) {
        return { domain, homepage: res.finalUrl, html: res.body, learned };
      }
    }
    return null;
  };
  if (e.official_domain) { const r = await tryDomain(e.official_domain, true); if (r) return r; }
  for (const cand of candidateDomains(e.canonical_name)) {
    const r = await tryDomain(cand, false);
    if (r) return r;
  }
  return null;
}

async function discoverForEntity(e: Entity, deadline: number): Promise<Discovered> {
  const resolved = await resolveDomain(e);
  if (!resolved) return { domain: null, homepage: "", channels: {}, feeds: [], sources: [], nameMatch: false, feedValid: false, confidence: 0, status: "none" };
  const { domain, homepage, html, learned } = resolved;
  const channels: Record<string, string> = {};
  const feeds: { url: string; channel: OfficialChannel | "github" }[] = [];
  const sources: Discovered["sources"] = [];
  const overBudget = () => Date.now() > deadline;
  const nameMatch = nameMatchesPage(html, e.canonical_name) || !!extractPublisherName(html);

  // Method 3 — declared <link rel=alternate> feeds.
  let feed = parseFeedLinks(html, homepage)[0] ?? "";

  // Methods 1+2 — robots.txt → sitemap.xml → feed URLs.
  if (!feed && !overBudget()) {
    const robots = await fetchText(`https://${domain}/robots.txt`);
    if (robots.ok) {
      for (const sm of parseRobotsSitemaps(robots.body)) {
        if (overBudget()) break;
        const smRes = await fetchText(sm);
        const smFeeds = smRes.ok ? parseSitemapFeeds(smRes.body, `https://${domain}`) : [];
        for (const f of smFeeds) {
          const fr = await fetchText(f);
          if (fr.ok && looksLikeFeed(fr.body)) { feed = fr.finalUrl; break; }
        }
        if (feed) break;
      }
    }
  }

  // Method 8 — probe common feed paths.
  if (!feed) {
    for (const path of RSS_PROBE_PATHS_EXT) {
      if (overBudget()) break;
      const res = await fetchText(absoluteUrl(`https://${domain}`, path));
      if (res.ok && looksLikeFeed(res.body)) { feed = res.finalUrl; break; }
    }
  }
  let feedValid = false;
  if (feed) {
    channels[CHANNEL_COLUMN.rss] = feed; feeds.push({ url: feed, channel: "blog" }); feedValid = true;
    sources.push({ type: /\.atom(\.xml)?$/i.test(feed) ? "atom" : "rss", url: feed, score: TYPE_SCORE.rss });
  }

  // UOCAE — SITEMAP fallback: when no RSS exists, a working sitemap.xml is the
  // next-best acquisition source. Universal: works for any brand-new site that
  // ships a sitemap (SPA blogs, static sites, Next.js apps, etc.).
  if (!overBudget()) {
    const sm = await fetchText(`https://${domain}/sitemap.xml`);
    if (sm.ok && sm.body && (/<sitemapindex|<urlset/i.test(sm.body.slice(0, 800)))) {
      sources.push({ type: "sitemap", url: sm.finalUrl, url_pattern: "*/blog/*", score: TYPE_SCORE.sitemap });
    }
  }

  // Section channels (blog/newsroom/press/docs/changelog/research) — path then subdomain.
  for (const { key, paths } of SECTION_PROBES) {
    if (overBudget()) break;
    if (channels[CHANNEL_COLUMN[key]]) continue;
    for (const path of paths) {
      if (overBudget()) break;
      const res = await fetchText(absoluteUrl(`https://${domain}`, path), "HEAD");
      const finalPath = (() => { try { return new URL(res.finalUrl).pathname.replace(/\/$/, ""); } catch { return ""; } })();
      if (res.ok && finalPath.length > 1) {
        const abs = `https://${domain}${path}`;
        channels[CHANNEL_COLUMN[key]] = abs;
        // UOCAE — a working /blog or /changelog is a valid static acquisition
        // source (last-resort static crawl if RSS + sitemap are both absent).
        if (["blog", "newsroom", "changelog", "docs"].includes(key)) {
          sources.push({ type: key === "changelog" ? "changelog" : key === "docs" ? "docs" : key === "newsroom" ? "newsroom" : "blog",
            url: abs, url_pattern: `${path}/*`, score: TYPE_SCORE[key] ?? TYPE_SCORE.static });
        }
        break;
      }
    }
  }
  for (const { key, sub } of SUBDOMAIN_PROBES) {
    if (overBudget()) break;
    if (channels[CHANNEL_COLUMN[key]]) continue;
    const res = await fetchText(`https://${sub}.${domain}`, "HEAD");
    if (res.ok) channels[CHANNEL_COLUMN[key]] = `https://${sub}.${domain}`;
  }

  // Method 7 — GitHub org + releases atom feed.
  if (!overBudget()) {
    const ghSlug = e.canonical_name.toLowerCase().replace(/[^a-z0-9]+/g, "");
    if (ghSlug.length >= 2) {
      const gh = await fetchText(`https://github.com/${ghSlug}`, "HEAD");
      if (gh.ok && /github\.com\//.test(gh.finalUrl) && !/\/(404|search)/.test(gh.finalUrl)) {
        channels[CHANNEL_COLUMN.github] = `https://github.com/${ghSlug}`;
        feeds.push({ url: githubFeeds(ghSlug).releases, channel: "github" });
      }
    }
  }

  const confidence = verificationConfidence({
    https: homepage.startsWith("https://"), nameMatch, feedValid, learnedDomain: learned, entityMatch: true,
  });
  const status: Discovered["status"] = Object.keys(channels).length ? (feedValid ? "ok" : "partial") : "partial";
  return { domain, homepage, channels, feeds, nameMatch, feedValid, confidence, status };
}

// Shared platforms owned by no single entity — never per-entity publishers.
const SHARED_PLATFORMS = new Set([
  "github.com", "gitlab.com", "medium.com", "substack.com", "youtube.com", "youtu.be",
  "twitter.com", "x.com", "linkedin.com", "notion.site", "notion.so", "wordpress.com",
  "blogspot.com", "tumblr.com", "facebook.com", "instagram.com", "reddit.com",
  "discord.com", "discord.gg", "t.me", "telegram.org", "google.com", "sites.google.com",
  "docs.google.com", "news.google.com", "wikipedia.org", "producthunt.com",
]);

// Map an entities.official_* column back to an official_publishers.publisher_type.
const COL_TO_PTYPE: Record<string, string> = {
  official_blog_url: "blog", official_newsroom_url: "newsroom", official_press_url: "newsroom",
  official_docs_url: "docs", official_changelog_url: "changelog", official_research_url: "research",
  official_github_url: "github", official_rss_url: "blog",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const adminError = requireAdmin(req, corsHeaders);
  if (adminError) return adminError;

  let batch = DEFAULT_BATCH;
  try { const b = await req.json(); if (b?.batch) batch = Math.min(20, Math.max(1, Number(b.batch) || DEFAULT_BATCH)); } catch { /* default */ }

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const t0 = Date.now();
  const staleBefore = new Date(Date.now() - RECHECK_DAYS * 864e5).toISOString();

  const { data, error } = await sb
    .from("entities")
    .select("id,canonical_name,slug,official_domain,website")
    .eq("is_ai", true).in("type", ["company", "organization", "lab", "research_lab"])
    .or(`official_sources_checked_at.is.null,official_sources_checked_at.lt.${staleBefore}`)
    .order("official_sources_checked_at", { ascending: true, nullsFirst: true })
    .limit(batch);
  if (error) return json({ ok: false, error: error.message }, 500);
  const entities = (data ?? []) as Entity[];

  let processed = 0, withDomain = 0, withFeed = 0, connectorsCreated = 0, publishersWritten = 0;

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

      if (d.domain && d.confidence >= 40) {
        // (A) official_publishers — the authority that classifies Official News.
        //     Root company domain + every discovered channel host, deduped.
        //     NEVER register shared platforms (github.com, medium…) as an entity's
        //     publisher — they are owned by no single entity. GitHub content is an
        //     ingesting FEED (releases atom), not a publisher domain.
        const pubRows = new Map<string, { domain: string; ptype: string }>();
        pubRows.set(d.domain, { domain: d.domain, ptype: "company" });
        for (const [col, url] of Object.entries(d.channels)) {
          const h = hostOf(url);
          if (h && !pubRows.has(h) && !SHARED_PLATFORMS.has(h)) pubRows.set(h, { domain: h, ptype: COL_TO_PTYPE[col] ?? "blog" });
        }
        for (const { domain: dom, ptype } of pubRows.values()) {
          const { error: pErr } = await sb.from("official_publishers").upsert({
            entity_id: e.id, domain: dom, publisher_name: e.canonical_name,
            publisher_type: ptype, verified: d.confidence >= 60, priority: ptype === "company" ? 100 : 85,
            updated_at: new Date().toISOString(),
          }, { onConflict: "domain" });
          if (!pErr) publishersWritten++;
        }

        // (B) source_registry metadata.
        await sb.rpc("upsert_source_registry", {
          p_publisher: e.canonical_name, p_domain: d.domain, p_source_type: "OFFICIAL_BLOG",
          p_trust: 100, p_company_id: e.id, p_website: `https://${d.domain}`,
          p_rss: d.channels[CHANNEL_COLUMN.rss] ?? null,
        }).then(() => {}, () => {});

        // (C) UOCAE Connector Factory — pick the HIGHEST-scored source as the
        //     primary connector, and register the rest as fallback connectors
        //     (disabled by default; the self-healing job promotes one when the
        //     primary dies). Every connector carries the SAME interface, so the
        //     universal factory + ingest dispatcher route by connector_type.
        //     GitHub releases atom is also registered when we found the org.
        //     PRIMARY sources[] entries are the ranked list; feeds[] adds the
        //     github releases atom if present.
        const ranked = [...d.sources].sort((a, b) => b.score - a.score);
        // Attach a GitHub releases fallback when we detected a real org.
        for (const f of d.feeds) if (f.channel === "github") ranked.push({ type: "releases", url: f.url, score: TYPE_SCORE.releases });
        const freqToTier: Record<string, string> = { breaking: "fast", github: "fast", blog: "fast", press: "medium", docs: "slow", research: "slow", support: "slow" };
        const CHANNEL_OF_TYPE: Record<string, string> = { rss: "blog", atom: "blog", sitemap: "blog", blog: "blog", newsroom: "newsroom", changelog: "changelog", docs: "docs", releases: "github", github: "github", static: "blog" };
        for (let i = 0; i < ranked.length && i < 4; i++) {
          const s = ranked[i];
          try {
            const channel = CHANNEL_OF_TYPE[s.type] ?? "blog";
            const freq = CHANNEL_FREQUENCY[channel] ?? "blog";
            const cid = `official_${e.slug}_${s.type}`.slice(0, 60);
            const { error: cErr } = await sb.from("source_connectors").upsert({
              source: cid, source_label: `${e.canonical_name} (Official ${s.type})`,
              source_kind: "official",
              tier: freqToTier[freq] ?? "fast",
              source_weight: 1.6, trust_score: 100,
              rss_url: s.type === "rss" || s.type === "atom" ? s.url : null,
              feed_url: s.url,
              url_pattern: s.url_pattern ?? null,
              connector_type: s.type,
              news_query: null,
              enabled: i === 0,
              entity_id: e.id, channel_type: channel, crawl_frequency: freq,
              discovered_by: i === 0 ? "primary" : "fallback",
              confidence: d.confidence,
              source_score: s.score,
              publisher_domain: d.domain,
              health_status: "unknown",
              needs_rediscovery: false,
            }, { onConflict: "source" });
            if (cErr) console.error("[uocae] connector upsert", cid, cErr.message);
            else { connectorsCreated++; if (i === 0) withFeed++; }
          } catch (err) {
            console.error("[uocae] connector loop", s.type, err instanceof Error ? err.message : err);
          }
        }
      }
      processed++;
    } catch (err) {
      console.error("[discover-sources] entity failed", { id: e.id, name: e.canonical_name, message: err instanceof Error ? err.message : String(err) });
      await sb.from("entities").update({ official_sources_checked_at: new Date().toISOString(), official_discovery_status: "error" }).eq("id", e.id);
    }
  }

  const { count: remaining } = await sb.from("entities").select("id", { count: "exact", head: true })
    .eq("is_ai", true).in("type", ["company", "organization", "lab", "research_lab"])
    .or(`official_sources_checked_at.is.null,official_sources_checked_at.lt.${staleBefore}`);

  // Observability: every discovery run leaves a structured row in source_ops_log
  // (logs are the operational surface — there is no dashboard).
  await sb.from("source_ops_log").insert({
    op: "discovery",
    status: processed > 0 ? "ok" : "skip",
    counts: { processed, with_domain: withDomain, with_feed: withFeed, connectors_created: connectorsCreated, publishers_written: publishersWritten, remaining: remaining ?? 0 },
    detail: (remaining ?? 0) === 0 ? "backlog drained" : "more entities pending",
    ms: Date.now() - t0,
  }).then(() => {}, () => {});

  return json({
    ok: true, processed, with_domain: withDomain, with_feed: withFeed,
    connectors_created: connectorsCreated, publishers_written: publishersWritten,
    remaining: remaining ?? 0, done: (remaining ?? 0) === 0, ms: Date.now() - t0,
    next: (remaining ?? 0) === 0 ? "all entities crawled" : "re-invoke to continue",
  });
});
