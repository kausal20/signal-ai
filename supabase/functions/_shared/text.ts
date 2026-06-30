// Text + URL + scoring utilities shared across the pipeline.

const STOP = new Set(
  "a an the and or for of to in on with is are was were be been being this that these those new from at by it its as we you i our your they them their how why what when where which can could should would may might via just now today release releases launch launches launching introduces introducing announces announcing update updates ai artificial intelligence llm llms model models"
    .split(" "),
);

export function isMostlyEnglish(text: string): boolean {
  if (!text) return false;
  const latin = (text.match(/[a-zA-Z]/g) || []).length;
  return latin >= Math.max(8, text.length * 0.45);
}

export function isCJK(text: string): boolean {
  return /[぀-ヿ㐀-䶿一-鿿가-힯]/.test(text);
}

export function decodeHtml(text: string): string {
  return text
    .replace(/<!\[CDATA\[|\]\]>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'");
}

export function cleanText(text: string): string {
  return decodeHtml(text)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function hash(s: string): string {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h).toString(36);
}

export function canonicalizeUrl(rawUrl: string): string {
  try {
    const u = new URL(rawUrl);
    if (!["http:", "https:"].includes(u.protocol)) return "";
    for (const key of [...u.searchParams.keys()]) {
      if (/^(utm_|ref|fbclid|gclid|mc_cid|mc_eid|source|feature)$/i.test(key)) {
        u.searchParams.delete(key);
      }
    }
    u.hash = "";
    u.hostname = u.hostname.replace(/^www\./, "").toLowerCase();
    const path = u.pathname.replace(/\/$/, "");
    return `${u.protocol}//${u.hostname}${path}${u.search}`;
  } catch {
    return "";
  }
}

export function titleTokens(s: string): Set<string> {
  return new Set(
    s.toLowerCase()
      .replace(/https?:\/\/\S+/g, " ")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !STOP.has(w)),
  );
}

export function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const KNOWN_ENTITIES = [
  "openai", "chatgpt", "gpt", "anthropic", "claude", "google", "deepmind", "gemini",
  "meta", "llama", "microsoft", "copilot", "hugging face", "mistral", "xai", "grok",
  "perplexity", "cursor", "replit", "windsurf", "lovable", "runway", "midjourney",
  "elevenlabs", "nvidia", "yc", "y combinator", "v0", "bolt.new", "suno", "pika", "luma",
  "n8n", "langchain", "crewai", "autogen",
];

export function entityKey(text: string): string {
  const t = text.toLowerCase();
  const entities = KNOWN_ENTITIES.filter((e) => t.includes(e));
  return [...new Set(entities)].sort().join("|");
}

export function wordCount(s: string): number {
  return (s.trim().match(/\S+/g) ?? []).length;
}

export function trimWords(s: string, maxWords: number): string {
  const words = cleanText(s).split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return words.join(" ");
  return words.slice(0, maxWords).join(" ").replace(/[,.!?;:]?$/, "") + "...";
}

export function clampScore(n: unknown): number {
  const v = Math.round(Number(n) || 0);
  return Math.max(0, Math.min(100, v));
}

export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 9000,
): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(id);
  }
}
