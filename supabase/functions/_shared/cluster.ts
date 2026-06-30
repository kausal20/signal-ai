// Stage 4-6: duplicate detection, story clustering, full article extraction.

import { titleTokens, jaccard, entityKey, cleanText, wordCount, fetchWithTimeout, hash } from "./text.ts";
import { MAJOR_CAPABILITY_RX, BUSINESS_RX, BUILDER_RX, RESEARCH_RX, MARKETING_RX, MINOR_UPDATE_RX, LOW_VALUE_LAUNCH_RX, NOISE_RX } from "./regex.ts";
import type { RawItem, StoryCluster } from "./types.ts";

// Stage 4: hard URL dedup happens at write time. Soft dedup (similar titles
// from different URLs) is handled by the cluster pass below.
export function dedupeByCanonicalUrl(items: RawItem[]): RawItem[] {
  const byUrl = new Map<string, RawItem>();
  for (const i of items) {
    const existing = byUrl.get(i.canonicalUrl);
    if (!existing) {
      byUrl.set(i.canonicalUrl, i);
      continue;
    }
    // Prefer the higher-weight / higher-engagement copy.
    if (
      i.sourceWeight > existing.sourceWeight ||
      (i.sourceWeight === existing.sourceWeight && i.engagement > existing.engagement)
    ) {
      byUrl.set(i.canonicalUrl, i);
    }
  }
  return [...byUrl.values()];
}

// Stage 5: cluster by URL identity, headline similarity, entity overlap.
export function clusterRaw(items: RawItem[]): StoryCluster[] {
  const clusters: StoryCluster[] = [];
  const sorted = [...items].sort((a, b) =>
    (b.sourceWeight - a.sourceWeight) || (b.engagement - a.engagement) || (a.hoursOld - b.hoursOld),
  );

  for (const item of sorted) {
    const tokens = titleTokens(`${item.rawTitle} ${item.rawText}`);
    const ent = entityKey(`${item.rawTitle} ${item.rawText}`);
    let match: StoryCluster | undefined;

    for (const c of clusters) {
      const sameUrl = c.members.some((m) => m.canonicalUrl === item.canonicalUrl);
      const titleOverlap = jaccard(c.tokens, tokens);
      const sameEntity = ent && ent === c.entityKey && titleOverlap >= 0.32;
      if (sameUrl || titleOverlap >= 0.54 || sameEntity) {
        match = c;
        break;
      }
    }

    if (!match) {
      clusters.push({
        id: `story_${hash(item.canonicalUrl || item.rawTitle)}`,
        primary: item,
        members: [item],
        tokens,
        entityKey: ent,
      });
      continue;
    }

    match.members.push(item);
    for (const t of tokens) match.tokens.add(t);
    if (!match.entityKey && ent) match.entityKey = ent;
    const current = match.primary;
    if (
      item.sourceWeight > current.sourceWeight ||
      (item.sourceWeight === current.sourceWeight && item.engagement > current.engagement)
    ) {
      match.primary = item;
    }
  }

  return clusters;
}

// Stage 5: cluster priority (which clusters get sent to the AI editor).
export function clusterPriority(c: StoryCluster): number {
  const p = c.primary;
  const blob = `${p.rawTitle} ${p.rawText}`;
  const major = MAJOR_CAPABILITY_RX.test(blob) ? 32 : 0;
  const business = BUSINESS_RX.test(blob) ? 16 : 0;
  const builder = BUILDER_RX.test(blob) ? 14 : 0;
  const research = p.sourceKind === "research" && RESEARCH_RX.test(blob) ? 10 : 0;
  const duplicateBoost = Math.min(24, (c.members.length - 1) * 7);
  const officialCorrob = c.members.some((m) => m.sourceKind === "official") && c.members.length >= 2 ? 8 : 0;
  const engagement = Math.min(18, Math.log10(Math.max(10, p.engagement)) * 6);
  const freshness = Math.max(0, 18 - p.hoursOld / 10);
  let penalty = 0;
  if (MARKETING_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) penalty += 12;
  if (MINOR_UPDATE_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) penalty += 14;
  if (LOW_VALUE_LAUNCH_RX.test(blob)) penalty += 14;
  return p.sourceWeight * 36 + major + business + builder + research + duplicateBoost + officialCorrob + engagement + freshness - penalty;
}

// Stage 5: outbound `source_urls` array attached to every published story.
export function sourceUrlsFor(cluster: StoryCluster): Array<{ label: string; url: string; source: string }> {
  const seen = new Set<string>();
  const urls: Array<{ label: string; url: string; source: string }> = [];
  for (const m of cluster.members.sort((a, b) => b.sourceWeight - a.sourceWeight)) {
    const key = m.canonicalUrl;
    if (seen.has(key)) continue;
    seen.add(key);
    urls.push({ label: m.sourceLabel, url: m.url, source: m.source });
    if (urls.length >= 5) break;
  }
  return urls;
}

// -------------------------------------------------------------------------
// Stage 6: Full article extraction — strip nav/ads/footer, prefer
// <article>/<main>, collect paragraph-ish text. Keeps the editor reasoning
// over real content instead of one-line RSS snippets.
// -------------------------------------------------------------------------
export function extractArticleText(html: string): string {
  let s = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<header\b[\s\S]*?<\/header>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ");

  const main = s.match(/<article\b[\s\S]*?<\/article>/i)?.[0]
    || s.match(/<main\b[\s\S]*?<\/main>/i)?.[0]
    || s;

  const paras = (main.match(/<(p|h1|h2|h3|li)\b[^>]*>([\s\S]*?)<\/\1>/gi) || [])
    .map((blk) => cleanText(blk))
    .filter((t) => t.length >= 40 && wordCount(t) >= 8);

  const joined = paras.join(" ");
  const text = cleanText(joined || main);
  return text.slice(0, 4000);
}

export async function fetchArticleText(url: string): Promise<string> {
  try {
    const r = await fetchWithTimeout(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; signal-ai/3.0; +https://signal.app)",
        Accept: "text/html,application/xhtml+xml",
      },
    }, 8000);
    if (!r.ok) return "";
    const ct = r.headers.get("content-type") || "";
    if (!ct.includes("html")) return "";
    return extractArticleText(await r.text());
  } catch {
    return "";
  }
}

export async function enrichClusters(clusters: StoryCluster[], limit: number): Promise<void> {
  const targets = clusters.slice(0, limit);
  await Promise.all(targets.map(async (c) => {
    const p = c.primary;
    if (wordCount(p.rawText) >= 80) return;
    if (p.source === "reddit" || p.source === "github") return;
    const full = await fetchArticleText(p.url);
    if (full && wordCount(full) > wordCount(p.rawText)) {
      p.rawText = full.slice(0, 4000);
    }
  }));
}

// Stage 4 (companion): blob-level reject pass — drops obvious noise before
// clustering so the editor never wastes a slot on it.
export function rejectRaw(i: RawItem): string | null {
  const blob = `${i.rawTitle} ${i.rawText}`;
  if (!i.canonicalUrl) return "invalid-url";
  if (/^(re:|update:|daily thread|weekly thread|who is hiring|ask hn:)/i.test(i.rawTitle)) return "discussion-thread";
  if (NOISE_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) return "generic-content";
  if (MINOR_UPDATE_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) return "minor-update";
  if (MARKETING_RX.test(blob) && i.sourceWeight < 1.25 && !MAJOR_CAPABILITY_RX.test(blob)) return "marketing-announcement";
  if (LOW_VALUE_LAUNCH_RX.test(blob) && !BUSINESS_RX.test(blob)) return "low-value-launch";
  if (i.source === "github") {
    if (i.engagement < 300) return "trivial-github-repository";
    if (/awesome|curated list|papers?|datasets?|cookbook|tutorial|examples?|boilerplate|starter/i.test(blob)) return "github-list-or-tutorial";
    if (!BUILDER_RX.test(blob) && !BUSINESS_RX.test(blob)) return "unclear-builder-value";
  }
  if (i.source === "arxiv") {
    if (!RESEARCH_RX.test(blob) || /survey|position paper|dataset/i.test(blob)) return "low-impact-research";
  }
  if (i.sourceKind === "launch" && i.engagement < 400 && !BUILDER_RX.test(blob) && !BUSINESS_RX.test(blob)) {
    return "weak-launch-signal";
  }
  return null;
}
