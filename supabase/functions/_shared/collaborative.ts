// V4 CAP 2 — Collaborative learning over anonymous behavioural clusters.
// Users are clustered by their interest-embedding centroid. A story near a
// cluster's centroid is boosted for members of that cluster — so cold-start
// users immediately benefit from what similar users engage with. No identities.

import { cosine, parseVector } from "./embeddings.ts";

export interface ClusterProfile { cluster_id: number; centroid: number[]; member_count: number; top_concepts: string[]; }

export async function loadClusterProfiles(sb: any): Promise<ClusterProfile[]> {
  try {
    const { data } = await sb.from("cluster_profiles").select("cluster_id,centroid,member_count,top_concepts");
    return (data ?? []).map((r: any) => ({
      cluster_id: r.cluster_id, centroid: parseVector(r.centroid),
      member_count: r.member_count ?? 0, top_concepts: r.top_concepts ?? [],
    }));
  } catch { return []; }
}

export async function loadUserCluster(sb: any, clientId: string): Promise<{ cluster_id: number; similarity: number } | null> {
  try {
    const { data } = await sb.from("user_clusters").select("cluster_id,similarity").eq("client_id", clientId).maybeSingle();
    return data ? { cluster_id: data.cluster_id, similarity: Number(data.similarity ?? 0) } : null;
  } catch { return null; }
}

// Nearest cluster to a user/interest vector.
export function assignCluster(userVec: number[], clusters: ClusterProfile[]): { cluster_id: number; similarity: number } | null {
  if (userVec.length === 0 || clusters.length === 0) return null;
  let best: { cluster_id: number; similarity: number } | null = null;
  for (const c of clusters) {
    if (c.centroid.length === 0) continue;
    const sim = cosine(userVec, c.centroid);
    if (!best || sim > best.similarity) best = { cluster_id: c.cluster_id, similarity: sim };
  }
  return best;
}

// Collaborative relevance of a story to the user's cluster (0..1).
export function collaborativeRelevance(storyVec: number[], cluster: ClusterProfile | undefined): number {
  if (!cluster || cluster.centroid.length === 0 || storyVec.length === 0) return 0;
  return Math.max(0, cosine(storyVec, cluster.centroid));
}

// ---- k-means (used only by the cluster-users background job) --------------
export function kmeans(vectors: number[][], k: number, iters = 12): { assignments: number[]; centroids: number[][] } {
  const n = vectors.length;
  if (n === 0) return { assignments: [], centroids: [] };
  const dim = vectors[0].length;
  k = Math.max(1, Math.min(k, n));
  // init: spread initial centroids across the data.
  const centroids: number[][] = [];
  for (let i = 0; i < k; i++) centroids.push([...vectors[Math.floor((i * n) / k)]]);
  const assignments = new Array(n).fill(0);

  for (let it = 0; it < iters; it++) {
    let moved = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestSim = -Infinity;
      for (let c = 0; c < k; c++) {
        const s = cosine(vectors[i], centroids[c]);
        if (s > bestSim) { bestSim = s; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; moved = true; }
    }
    const sums = Array.from({ length: k }, () => new Array(dim).fill(0));
    const counts = new Array(k).fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i]; counts[c]++;
      for (let d = 0; d < dim; d++) sums[c][d] += vectors[i][d];
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) continue;
      for (let d = 0; d < dim; d++) sums[c][d] /= counts[c];
      let norm = 0; for (const x of sums[c]) norm += x * x; norm = Math.sqrt(norm) || 1;
      centroids[c] = sums[c].map((x) => x / norm);
    }
    if (!moved && it > 0) break;
  }
  return { assignments, centroids };
}
