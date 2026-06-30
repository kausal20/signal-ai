// V4 CAP 1 — pgvector persistence + retrieval helpers. All writes happen in
// background jobs; reads are cheap (batched select + JS cosine).

import { dbWrite } from "./reliability.ts";
import {
  getEmbeddingProvider, toVectorLiteral, parseVector, centroid, cosine,
  type EmbeddingProvider,
} from "./embeddings.ts";

export async function embedAndStoreStories(
  sb: any,
  stories: Array<{ id: string; text: string }>,
  provider?: EmbeddingProvider,
): Promise<number> {
  if (stories.length === 0) return 0;
  const p = provider ?? getEmbeddingProvider();
  const vecs = await p.embed(stories.map((s) => s.text.slice(0, 6000)));
  const rows = stories.map((s, i) => ({
    feed_item_id: s.id, embedding: toVectorLiteral(vecs[i] ?? []), model: p.name, created_at: new Date().toISOString(),
  }));
  await dbWrite("story_embeddings.upsert", () => sb.from("story_embeddings").upsert(rows, { onConflict: "feed_item_id" }));
  return rows.length;
}

export async function embedAndStoreConcepts(
  sb: any,
  concepts: Array<{ concept: string; text: string }>,
  provider?: EmbeddingProvider,
): Promise<number> {
  if (concepts.length === 0) return 0;
  const p = provider ?? getEmbeddingProvider();
  const vecs = await p.embed(concepts.map((c) => c.text.slice(0, 2000)));
  const rows = concepts.map((c, i) => ({
    concept: c.concept, embedding: toVectorLiteral(vecs[i] ?? []), model: p.name, updated_at: new Date().toISOString(),
  }));
  await dbWrite("concept_embeddings.upsert", () => sb.from("concept_embeddings").upsert(rows, { onConflict: "concept" }));
  return rows.length;
}

export async function loadStoryVectors(sb: any, ids: string[]): Promise<Map<string, number[]>> {
  const m = new Map<string, number[]>();
  if (ids.length === 0) return m;
  try {
    const { data } = await sb.from("story_embeddings").select("feed_item_id,embedding").in("feed_item_id", ids);
    for (const r of data ?? []) m.set(r.feed_item_id, parseVector(r.embedding));
  } catch (e) { console.error("loadStoryVectors", e); }
  return m;
}

export async function loadUserEmbedding(sb: any, clientId: string): Promise<{ vec: number[]; count: number } | null> {
  try {
    const { data } = await sb.from("user_embeddings").select("embedding,sample_count").eq("client_id", clientId).maybeSingle();
    if (!data) return null;
    return { vec: parseVector(data.embedding), count: data.sample_count ?? 0 };
  } catch { return null; }
}

// Rebuild a user's interest centroid from the stories they engaged with.
// Uses already-stored story vectors — no embedding API call.
export async function updateUserEmbedding(
  sb: any, clientId: string, engagedVectors: number[][],
): Promise<number[] | null> {
  if (engagedVectors.length === 0) return null;
  const c = centroid(engagedVectors);
  await dbWrite("user_embeddings.upsert", () => sb.from("user_embeddings").upsert({
    client_id: clientId, embedding: toVectorLiteral(c), sample_count: engagedVectors.length, updated_at: new Date().toISOString(),
  }, { onConflict: "client_id" }));
  return c;
}

// Vector relevance of each candidate story to the user centroid (0..1).
export function vectorRelevance(userVec: number[], storyVecs: Map<string, number[]>, id: string): number {
  const sv = storyVecs.get(id);
  if (!sv || sv.length === 0 || userVec.length === 0) return 0;
  return Math.max(0, cosine(userVec, sv));
}
