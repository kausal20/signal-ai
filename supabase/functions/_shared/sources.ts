// Stage 1-3: Source discovery, content collection, normalization.
// Each connector is independently testable. Source registry comes from
// `source_connectors` (DB) so the connector list can change without
// redeploying edge functions.

import {
  cleanText, hash, canonicalizeUrl, isCJK, isMostlyEnglish,
  fetchWithTimeout,
} from "./text.ts";
import { withRetry, httpRetryable } from "./reliability.ts";
import type { RawItem, SourceConnector, SourceKind, SourceTier } from "./types.ts";

// -------------------------------------------------------------------------
// Stage 3: Normalization — single function that produces a clean RawItem.
// -------------------------------------------------------------------------
export function makeRaw(args: {
  id: string;
  rawTitle: string;
  rawText: string;
  url: string;
  source: string;
  sourceLabel: string;
  sourceKind: SourceKind;
  sourceWeight: number;
  engagement?: number;
  published_at: string;
}): RawItem | null {
  const canonicalUrl = canonicalizeUrl(args.url);
  if (!canonicalUrl) return null;
  const publishedAt = new Date(args.published_at);
  const hoursOld = (Date.now() - publishedAt.getTime()) / 3600_000;
  if (!Number.isFinite(hoursOld) || hoursOld < -24) return null;
  const title = cleanText(args.rawTitle).slice(0, 260);
  const text = cleanText(args.rawText).slice(0, 1200);
  if (!title || title.length < 8) return null;
  return {
    id: args.id,
    rawTitle: title,
    rawText: text,
    url: args.url,
    canonicalUrl,
    source: args.source,
    sourceLabel: args.sourceLabel,
    sourceKind: args.sourceKind,
    sourceWeight: args.sourceWeight,
    engagement: Math.max(0, Math.round(args.engagement ?? 0)),
    published_at: publishedAt.toISOString(),
    hoursOld,
    needsTranslation: isCJK(title) || (!isMostlyEnglish(title + " " + text) && title.length > 20),
  };
}

function parseFeed(xml: string): Array<{ title: string; link: string; date: string; desc: string }> {
  const out: Array<{ title: string; link: string; date: string; desc: string }> = [];
  const blocks = xml.match(/<(item|entry)\b[\s\S]*?<\/\1>/gi) || [];
  for (const block of blocks) {
    const title = cleanText(block.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "");
    let link = block.match(/<link[^>]*href="([^"]+)"/i)?.[1]
      || block.match(/<link[^>]*>([\s\S]*?)<\/link>/i)?.[1]
      || "";
    link = cleanText(link);
    const date = cleanText(block.match(/<(pubDate|updated|published)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || "");
    const desc = cleanText(block.match(/<(description|summary|content|content:encoded)[^>]*>([\s\S]*?)<\/\1>/i)?.[2] || "");
    if (title && link) out.push({ title, link, date, desc });
  }
  return out;
}

// -------------------------------------------------------------------------
// Stage 2: collection — connector fetchers (one per pattern).
// -------------------------------------------------------------------------
export async function fetchRSS(
  url: string,
  source: string,
  sourceLabel: string,
  sourceKind: SourceKind,
  sourceWeight: number,
  maxAgeH: number,
  baseEngagement = 1000,
): Promise<RawItem[]> {
  const r = await fetchWithTimeout(url, {
    headers: { "User-Agent": "signal-ai/3.0", Accept: "application/rss+xml, application/atom+xml, */*" },
  });
  if (!r.ok) throw new Error(`${source} ${r.status}`);
  const entries = parseFeed(await r.text());
  const out: RawItem[] = [];
  for (const e of entries) {
    const pub = e.date ? new Date(e.date) : new Date();
    const ageH = (Date.now() - pub.getTime()) / 3600_000;
    if (!Number.isFinite(ageH) || ageH > maxAgeH) continue;
    const raw = makeRaw({
      id: `${source}_${hash(e.link)}`,
      rawTitle: e.title,
      rawText: e.desc,
      url: e.link,
      source, sourceLabel, sourceKind, sourceWeight,
      engagement: baseEngagement,
      published_at: pub.toISOString(),
    });
    if (raw) out.push(raw);
  }
  return out;
}

export function googleNewsUrl(query: string): string {
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
}

export async function fetchGoogleNews(
  query: string,
  source: string,
  sourceLabel: string,
  sourceKind: SourceKind,
  sourceWeight: number,
  maxAgeH: number,
): Promise<RawItem[]> {
  return fetchRSS(googleNewsUrl(query), source, sourceLabel, sourceKind, sourceWeight, maxAgeH, 850);
}

export async function fetchWithFallback(
  rssUrl: string | null | undefined,
  newsQuery: string,
  source: string,
  sourceLabel: string,
  sourceKind: SourceKind,
  sourceWeight: number,
  maxAgeH: number,
  baseEngagement = 1100,
): Promise<RawItem[]> {
  if (rssUrl) {
    try {
      const items = await fetchRSS(rssUrl, source, sourceLabel, sourceKind, sourceWeight, maxAgeH, baseEngagement);
      if (items.length > 0) return items;
    } catch (e) {
      console.error("rss fallback", source, e instanceof Error ? e.message : e);
    }
  }
  if (!newsQuery) return [];
  return fetchGoogleNews(newsQuery, source, `${sourceLabel} coverage`, sourceKind, Math.max(1, sourceWeight - 0.2), maxAgeH);
}

export async function fetchReddit(): Promise<RawItem[]> {
  const subs = [
    "OpenAI", "ClaudeAI", "ChatGPT", "LocalLLaMA", "singularity", "ArtificialInteligence",
    "AI_Agents", "MachineLearning", "artificial", "SaaS", "startups",
  ];
  const out: RawItem[] = [];
  await Promise.all(subs.map(async (sub) => {
    try {
      const r = await fetchWithTimeout(`https://www.reddit.com/r/${sub}/top.json?t=week&limit=18`, {
        headers: { "User-Agent": "signal-ai/3.0" },
      });
      if (!r.ok) return;
      const j = await r.json();
      for (const c of j.data?.children ?? []) {
        const d = c.data;
        if (d.stickied || d.over_18 || d.score < 40) continue;
        const title = String(d.title || "");
        if (/meme|funny|lol|joke|shitpost|drama|hot take/i.test(title)) continue;
        const ageH = (Date.now() / 1000 - d.created_utc) / 3600;
        if (ageH > 24 * 7) continue;
        const raw = makeRaw({
          id: `reddit_${d.id}`,
          rawTitle: title,
          rawText: String(d.selftext || "").slice(0, 1200),
          url: `https://reddit.com${d.permalink}`,
          source: "reddit", sourceLabel: `r/${sub}`,
          sourceKind: "community", sourceWeight: 0.92,
          engagement: d.score,
          published_at: new Date(d.created_utc * 1000).toISOString(),
        });
        if (raw) out.push(raw);
      }
    } catch (e) {
      console.error("reddit", sub, e);
    }
  }));
  return out;
}

async function fetchHNQuery(query: string, source: string, sourceLabel: string, minPoints: number, maxAgeH: number): Promise<RawItem[]> {
  const url = `https://hn.algolia.com/api/v1/search_by_date?tags=story&query=${encodeURIComponent(query)}&hitsPerPage=40`;
  const r = await fetchWithTimeout(url);
  if (!r.ok) throw new Error(`${source} ${r.status}`);
  const j = await r.json();
  const out: RawItem[] = [];
  for (const h of j.hits ?? []) {
    if (!h.url || (h.points ?? 0) < minPoints) continue;
    const ageH = (Date.now() - new Date(h.created_at).getTime()) / 3600_000;
    if (ageH > maxAgeH) continue;
    const title = String(h.title || "");
    const raw = makeRaw({
      id: `${source}_${h.objectID}`,
      rawTitle: title,
      rawText: `${title}. HN discussion with ${h.points ?? 0} points and ${h.num_comments ?? 0} comments.`,
      url: h.url, source, sourceLabel,
      sourceKind: source.startsWith("yc") ? "startup" : "community",
      sourceWeight: source.startsWith("yc") ? 1.08 : 1.02,
      engagement: Number(h.points ?? 0) + Number(h.num_comments ?? 0),
      published_at: h.created_at,
    });
    if (raw) out.push(raw);
  }
  return out;
}

export async function fetchHN(): Promise<RawItem[]> {
  const batches = await Promise.all([
    fetchHNQuery("AI OR LLM OR GPT OR Claude OR Gemini OR agents", "hn_ai", "Hacker News", 45, 72),
    fetchHNQuery("OpenAI Anthropic Google AI Meta AI Microsoft AI", "hn_frontier", "Hacker News", 35, 96),
  ]);
  return batches.flat();
}

export async function fetchYCDiscussions(): Promise<RawItem[]> {
  const batches = await Promise.all([
    fetchHNQuery("Launch HN AI", "yc_discussions", "YC / HN founders", 20, 24 * 14),
    fetchHNQuery("YC AI startup founder", "yc_discussions", "YC / HN founders", 20, 24 * 14),
    fetchHNQuery("AI startup revenue automation", "yc_discussions", "YC / HN founders", 20, 24 * 14),
  ]);
  return batches.flat();
}

export async function fetchGithub(): Promise<RawItem[]> {
  const since = new Date(Date.now() - 14 * 24 * 3600_000).toISOString().slice(0, 10);
  const queries = [
    `topic:artificial-intelligence stars:>300 pushed:>${since}`,
    `topic:llm stars:>300 pushed:>${since}`,
    `topic:ai-agents stars:>150 pushed:>${since}`,
    `agentic-ai stars:>150 pushed:>${since}`,
    `llm agent automation stars:>200 pushed:>${since}`,
  ];
  const out: RawItem[] = [];
  const seen = new Set<string>();
  for (const q of queries) {
    try {
      const url = `https://api.github.com/search/repositories?q=${encodeURIComponent(q)}&sort=stars&order=desc&per_page=20`;
      const r = await fetchWithTimeout(url, {
        headers: { "User-Agent": "signal-ai/3.0", Accept: "application/vnd.github+json" },
      });
      if (!r.ok) continue;
      const j = await r.json();
      for (const repo of j.items ?? []) {
        if (seen.has(String(repo.id))) continue;
        seen.add(String(repo.id));
        const desc = String(repo.description || "");
        if (repo.stargazers_count < 150) continue;
        const text = `${desc} Language: ${repo.language || "unknown"}. Stars: ${repo.stargazers_count}. Forks: ${repo.forks_count ?? 0}.`;
        const raw = makeRaw({
          id: `github_${repo.id}`,
          rawTitle: repo.full_name || repo.name,
          rawText: text, url: repo.html_url,
          source: "github", sourceLabel: "GitHub AI projects",
          sourceKind: "launch",
          sourceWeight: repo.stargazers_count >= 1500 ? 1.0 : 0.9,
          engagement: repo.stargazers_count,
          published_at: repo.pushed_at || repo.updated_at || repo.created_at,
        });
        if (raw) out.push(raw);
      }
    } catch (e) {
      console.error("github", q, e);
    }
  }
  return out;
}

export async function fetchArxiv(): Promise<RawItem[]> {
  const query = "cat:cs.AI OR cat:cs.CL OR cat:cs.LG OR cat:cs.CV";
  const url = `https://export.arxiv.org/api/query?search_query=${encodeURIComponent(query)}&sortBy=submittedDate&sortOrder=descending&max_results=40`;
  const r = await fetchWithTimeout(url, { headers: { "User-Agent": "signal-ai/3.0" } }, 12000);
  if (!r.ok) throw new Error(`arxiv ${r.status}`);
  const entries = parseFeed(await r.text());
  const out: RawItem[] = [];
  for (const e of entries) {
    const pub = e.date ? new Date(e.date) : new Date();
    const ageH = (Date.now() - pub.getTime()) / 3600_000;
    if (!Number.isFinite(ageH) || ageH > 24 * 10) continue;
    const raw = makeRaw({
      id: `arxiv_${hash(e.link)}`,
      rawTitle: e.title, rawText: e.desc, url: e.link,
      source: "arxiv", sourceLabel: "arXiv",
      sourceKind: "research", sourceWeight: 1.0,
      engagement: 700,
      published_at: pub.toISOString(),
    });
    if (raw) out.push(raw);
  }
  return out;
}

export async function fetchProductHunt(): Promise<RawItem[]> {
  const items = await fetchRSS(
    "https://www.producthunt.com/feed",
    "producthunt", "Product Hunt", "launch", 0.95, 24 * 7, 600,
  );
  return items.filter((i) =>
    /\b(ai|llm|agent|automation|prompt|chatgpt|claude|copilot|no-code|workflow|image|video|voice)\b/i
      .test(`${i.rawTitle} ${i.rawText}`),
  );
}

// -------------------------------------------------------------------------
// Stage 1: connector dispatch — turns a SourceConnector row into a fetch fn.
// -------------------------------------------------------------------------
function baseConnectorFetch(c: SourceConnector): () => Promise<RawItem[]> {
  switch (c.source) {
    case "github":         return fetchGithub;
    case "hn":             return fetchHN;
    case "reddit":         return fetchReddit;
    case "arxiv":          return fetchArxiv;
    case "producthunt":    return fetchProductHunt;
    case "yc_discussions": return fetchYCDiscussions;
  }
  // Generic RSS-or-Google-News connector for everything in the registry.
  const maxAge =
    c.source.endsWith("_news") ? 24 * 14 :
    c.tier === "fast" ? 24 * 14 :
    c.tier === "medium" ? 24 * 7 :
    24 * 10;
  return () => fetchWithFallback(
    c.rss_url ?? null,
    c.news_query ?? "",
    c.source,
    c.source_label,
    c.source_kind,
    c.source_weight,
    maxAge,
  );
}

// Public connector fetch wrapped with exponential-backoff retry for transient
// network / RSS / API failures (Phase 5).
export function connectorFetch(c: SourceConnector): () => Promise<RawItem[]> {
  const base = baseConnectorFetch(c);
  return () => withRetry(base, {
    attempts: 3,
    baseDelayMs: 600,
    maxDelayMs: 5000,
    label: `connector:${c.source}`,
    retryOn: (err) => httpRetryable(err),
  });
}

export function defaultConnectors(): SourceConnector[] {
  // Used only if the DB registry is unreachable at runtime.
  return [
    { source: "openai", source_label: "OpenAI", source_kind: "official", tier: "fast", source_weight: 1.55, rss_url: "https://openai.com/news/rss.xml", news_query: "OpenAI GPT model release OR ChatGPT agents when:14d", trust_score: 95, enabled: true },
    { source: "anthropic", source_label: "Anthropic", source_kind: "official", tier: "fast", source_weight: 1.55, rss_url: "https://www.anthropic.com/rss.xml", news_query: "Anthropic Claude model release when:14d", trust_score: 95, enabled: true },
    { source: "github", source_label: "GitHub AI projects", source_kind: "launch", tier: "medium", source_weight: 1.0, rss_url: null, news_query: null, trust_score: 70, enabled: true },
    { source: "hn", source_label: "Hacker News", source_kind: "community", tier: "medium", source_weight: 1.02, rss_url: null, news_query: null, trust_score: 76, enabled: true },
    { source: "arxiv", source_label: "arXiv", source_kind: "research", tier: "slow", source_weight: 1.0, rss_url: null, news_query: null, trust_score: 78, enabled: true },
  ];
}

export async function loadConnectors(sb: any, tier?: SourceTier): Promise<SourceConnector[]> {
  try {
    let q = sb.from("source_connectors").select("*").eq("enabled", true);
    if (tier) q = q.eq("tier", tier);
    const { data } = await q;
    if (data && data.length > 0) return data as SourceConnector[];
  } catch (e) {
    console.error("loadConnectors", e);
  }
  return defaultConnectors().filter((c) => !tier || c.tier === tier);
}
