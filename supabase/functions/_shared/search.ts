// Signal Search — pure search intelligence (no DB, no network here).
//
// The brain behind the `search` edge function: query normalization, fuzzy +
// alias expansion, per-field relevance scoring, multi-factor ranking, "did you
// mean" suggestions, and related-topic derivation. Deterministic + testable.
//
// Ranking order: Relevance → Freshness → Signal Score → Popularity.
// Coverage is time-agnostic (entire archive); recency is a ranking boost, not a
// hard filter — so search never stops at "today".

// ── Types ───────────────────────────────────────────────────────────────────
export interface SearchCandidate {
  id: string;
  title: string;
  summary?: string;
  why_it_matters?: string;
  what_happened?: string;
  source?: string;
  source_label?: string;
  tag?: string;
  category?: string;
  content_category?: string;
  trend_entities?: string[];
  score?: number;        // Signal Score 0..100
  engagement?: number;   // popularity
  published_at?: string; // ISO
}

export interface ScoredResult<T extends SearchCandidate = SearchCandidate> {
  item: T;
  relevance: number;         // 0..~100 term-match strength
  rank: number;              // final composite ranking score
  matched_fields: string[];
}

// ── Aliases / keyword expansion ─────────────────────────────────────────────
// Maps a canonical concept to every phrasing + adjacent term a user might type.
const ALIASES: Record<string, string[]> = {
  gpt: ["gpt", "gpt-5", "gpt5", "gpt-5.5", "gpt5.5", "gpt-4", "chatgpt", "openai", "o1", "o3", "llm", "language model"],
  openai: ["openai", "open ai", "gpt", "chatgpt", "sora", "dall-e"],
  claude: ["claude", "claude 5", "claude sonnet", "claude opus", "sonnet", "opus", "anthropic"],
  anthropic: ["anthropic", "claude", "sonnet", "opus", "mcp"],
  gemini: ["gemini", "google", "bard", "deepmind", "gemini 3"],
  google: ["google", "gemini", "deepmind", "bard"],
  grok: ["grok", "xai", "x ai", "grok 4"],
  mistral: ["mistral", "mixtral", "le chat"],
  deepseek: ["deepseek", "deep seek", "deepseek v4"],
  cursor: ["cursor", "cursor ai", "anysphere"],
  llama: ["llama", "meta", "meta ai"],
  meta: ["meta", "llama", "meta ai"],
  perplexity: ["perplexity", "pplx", "answer engine"],
  mcp: ["mcp", "model context protocol", "context protocol", "anthropic"],
  agent: ["agent", "agents", "agentic", "ai agent", "autonomous"],
  agents: ["agents", "agent", "agentic", "ai agent"],
  rag: ["rag", "retrieval", "retrieval augmented"],
  api: ["api", "sdk", "endpoint"],
  llm: ["llm", "language model", "foundation model", "gpt", "claude", "gemini"],
};

const KNOWN_VOCAB = Array.from(
  new Set(Object.values(ALIASES).flat().concat(Object.keys(ALIASES))),
);

/** Lowercase, strip punctuation that splits model names, collapse whitespace. */
export function normalizeQuery(q: string): string {
  return (q ?? "")
    .toLowerCase()
    .replace(/[_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Split a query into meaningful tokens (keeps model-version tokens intact). */
export function tokenize(q: string): string[] {
  const norm = normalizeQuery(q);
  // Treat "gpt-5", "gpt5", "gpt 5" as the same family token "gpt5".
  const collapsed = norm.replace(/\b([a-z]+)[\s-]?(\d+(?:\.\d+)?)\b/g, "$1$2");
  return Array.from(new Set(collapsed.split(/[^a-z0-9.]+/).filter((t) => t.length >= 2)));
}

/** Expand a query into all fuzzy/alias variants used for matching + fallback. */
export function expandQuery(q: string): string[] {
  const norm = normalizeQuery(q);
  const out = new Set<string>([norm]);
  tokenize(q).forEach((t) => out.add(t));
  // Alias lookup on the normalized query and each token.
  const keys = [norm.replace(/[\s-]/g, ""), ...tokenize(q)];
  for (const k of keys) {
    const direct = ALIASES[k];
    if (direct) direct.forEach((a) => out.add(a));
    // Prefix family: "gpt5" matches alias group "gpt".
    for (const [base, list] of Object.entries(ALIASES)) {
      if (k.startsWith(base) || base.startsWith(k)) list.forEach((a) => out.add(a));
    }
  }
  return Array.from(out).filter(Boolean);
}

// ── Field weights for relevance ─────────────────────────────────────────────
const FIELD_WEIGHT: Record<string, number> = {
  title: 10, source: 7, source_label: 7, trend_entities: 6,
  tag: 5, category: 5, content_category: 4, summary: 4,
  why_it_matters: 2, what_happened: 2,
};

function fieldText(item: SearchCandidate, field: string): string {
  if (field === "trend_entities") return (item.trend_entities ?? []).join(" ");
  return ((item as any)[field] ?? "").toString();
}

/** Score one candidate against expanded query terms; collect matched fields. */
export function scoreCandidate(item: SearchCandidate, terms: string[]): { relevance: number; matched_fields: string[] } {
  const matched = new Set<string>();
  let score = 0;
  const lowTerms = terms.map((t) => t.toLowerCase()).filter((t) => t.length >= 2);
  for (const field of Object.keys(FIELD_WEIGHT)) {
    const hay = fieldText(item, field).toLowerCase();
    if (!hay) continue;
    let fieldHit = 0;
    for (const term of lowTerms) {
      if (!hay.includes(term)) continue;
      matched.add(field);
      // Whole-word / exact-title hits weigh more than substring hits.
      const whole = new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(hay);
      fieldHit += whole ? 1 : 0.5;
      if (field === "title" && hay.trim() === term) fieldHit += 1.5;
    }
    score += fieldHit * FIELD_WEIGHT[field];
  }
  return { relevance: score, matched_fields: Array.from(matched) };
}

// ── Ranking: relevance → freshness → signal score → popularity ──────────────
function freshnessBoost(publishedAt?: string, now = Date.now()): number {
  if (!publishedAt) return 0;
  const t = new Date(publishedAt).getTime();
  if (Number.isNaN(t)) return 0;
  const ageDays = Math.max(0, (now - t) / 86_400_000);
  // Smooth decay: ~today ≈ 20, 1wk ≈ 12, 30d ≈ 5, older tapers toward 0.
  return 20 * Math.exp(-ageDays / 21);
}

export function rankResults<T extends SearchCandidate>(items: T[], query: string, now = Date.now()): ScoredResult<T>[] {
  const terms = expandQuery(query);
  const scored = items.map((item) => {
    const { relevance, matched_fields } = scoreCandidate(item, terms);
    const rank =
      relevance * 1.0 +
      freshnessBoost(item.published_at, now) +
      (item.score ?? 0) * 0.08 +
      Math.min(10, (item.engagement ?? 0) * 0.02);
    return { item, relevance, rank, matched_fields };
  });
  return scored.sort((a, b) => b.rank - a.rank);
}

// ── "Did you mean" suggestions (edit distance over known vocab) ─────────────
function editDistance(a: string, b: string): number {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}

export function didYouMean(query: string, vocab: string[] = KNOWN_VOCAB, max = 3): string[] {
  const q = normalizeQuery(query);
  if (!q || q.length < 3) return [];
  const scored = vocab
    .filter((w) => w.length >= 3 && !w.includes(" "))
    .map((w) => ({ w, d: editDistance(q, w.toLowerCase()) }))
    .filter((x) => x.d > 0 && x.d <= Math.max(1, Math.floor(q.length / 3)))
    .sort((a, b) => a.d - b.d);
  return Array.from(new Set(scored.map((s) => s.w))).slice(0, max);
}

// ── Related topics (adjacent terms for the query) ───────────────────────────
export function relatedTopics(query: string, max = 6): string[] {
  const expanded = expandQuery(query).filter((t) => t.length >= 3 && t !== normalizeQuery(query));
  return Array.from(new Set(expanded)).slice(0, max);
}

/** Postgres websearch tsquery-safe OR string from expanded terms. */
export function toTsQuery(query: string): string {
  const terms = expandQuery(query)
    .map((t) => t.replace(/[^a-z0-9. ]/gi, " ").trim())
    .filter((t) => t.length >= 2)
    .map((t) => t.split(/\s+/).join(" <-> "));   // phrase for multiword
  return Array.from(new Set(terms)).join(" | ");
}
