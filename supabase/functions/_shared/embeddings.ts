// V4 CAP 1 — embeddings. Provider-swappable (OpenAI text-embedding-3-large /
// Voyage AI), normalized to 1536 dims for pgvector. Graceful hash fallback so
// the system never blocks when no embedding key is configured. Generation runs
// in background jobs only — never on the personalization request path.

import { fetchWithTimeout } from "./text.ts";

export const EMBED_DIM = 1536;

export interface EmbeddingProvider {
  name: string;
  embed(texts: string[]): Promise<number[][]>;
}

class OpenAIProvider implements EmbeddingProvider {
  name = "openai:text-embedding-3-large";
  constructor(private key: string) {}
  async embed(texts: string[]): Promise<number[][]> {
    const resp = await fetchWithTimeout("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "text-embedding-3-large", dimensions: EMBED_DIM, input: texts }),
    }, 30000);
    if (!resp.ok) throw new Error(`openai embeddings ${resp.status}`);
    const j = await resp.json();
    return (j.data ?? []).map((d: any) => d.embedding as number[]);
  }
}

class VoyageProvider implements EmbeddingProvider {
  name = "voyage:voyage-3";
  constructor(private key: string) {}
  async embed(texts: string[]): Promise<number[][]> {
    const resp = await fetchWithTimeout("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: "voyage-3", input: texts }),
    }, 30000);
    if (!resp.ok) throw new Error(`voyage embeddings ${resp.status}`);
    const j = await resp.json();
    return (j.data ?? []).map((d: any) => fitDim(d.embedding as number[]));
  }
}

// Deterministic bag-of-hashed-tokens pseudo-embedding. Not semantically rich,
// but stable and dependency-free; keeps the pipeline alive without a key.
class HashProvider implements EmbeddingProvider {
  name = "hash:fallback";
  embed(texts: string[]): Promise<number[][]> {
    return Promise.resolve(texts.map((t) => {
      const v = new Array(EMBED_DIM).fill(0);
      const toks = t.toLowerCase().match(/[a-z0-9]+/g) ?? [];
      for (const tok of toks) {
        let h = 2166136261;
        for (let i = 0; i < tok.length; i++) { h ^= tok.charCodeAt(i); h = Math.imul(h, 16777619); }
        const idx = Math.abs(h) % EMBED_DIM;
        v[idx] += 1;
      }
      return normalize(v);
    }));
  }
}

export function getEmbeddingProvider(): EmbeddingProvider {
  const oa = Deno.env.get("OPENAI_API_KEY");
  const vo = Deno.env.get("VOYAGE_API_KEY");
  if (oa) return new OpenAIProvider(oa);
  if (vo) return new VoyageProvider(vo);
  return new HashProvider();
}

function fitDim(v: number[]): number[] {
  if (v.length === EMBED_DIM) return v;
  if (v.length > EMBED_DIM) return v.slice(0, EMBED_DIM);
  return [...v, ...new Array(EMBED_DIM - v.length).fill(0)];
}

export function normalize(v: number[]): number[] {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => x / n);
}

export function cosine(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

export function centroid(vectors: number[][]): number[] {
  if (vectors.length === 0) return new Array(EMBED_DIM).fill(0);
  const out = new Array(EMBED_DIM).fill(0);
  for (const v of vectors) for (let i = 0; i < EMBED_DIM && i < v.length; i++) out[i] += v[i];
  for (let i = 0; i < EMBED_DIM; i++) out[i] /= vectors.length;
  return normalize(out);
}

// pgvector returns embeddings as a string "[0.1,0.2,...]"; parse to number[].
export function parseVector(raw: unknown): number[] {
  if (Array.isArray(raw)) return raw as number[];
  if (typeof raw === "string") {
    try { return JSON.parse(raw); } catch { return []; }
  }
  return [];
}

export function toVectorLiteral(v: number[]): string {
  return `[${v.join(",")}]`;
}
