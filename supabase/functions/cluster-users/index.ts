// V4 CAP 2 — anonymous user clustering (background, daily cron).
// Loads all user interest-embeddings, runs k-means, writes cluster_profiles +
// user_clusters. No identities stored — only vectors and cluster ids.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseVector, toVectorLiteral } from "../_shared/embeddings.ts";
import { kmeans } from "../_shared/collaborative.ts";
import { acquireLock, releaseLock } from "../_shared/reliability.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  const holder = crypto.randomUUID();
  if (!(await acquireLock(sb, "cluster-users", 290, holder))) {
    return new Response(JSON.stringify({ ok: true, skipped: "locked" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    const { data, error } = await sb.from("user_embeddings").select("client_id,embedding").limit(50000);
    if (error) throw error;
    const users = (data ?? []).map((r: any) => ({ client_id: r.client_id, vec: parseVector(r.embedding) }))
      .filter((u: any) => u.vec.length > 0);

    if (users.length < 4) {
      await releaseLock(sb, "cluster-users");
      return new Response(JSON.stringify({ ok: true, users: users.length, clusters: 0, note: "not enough users" }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Scale k with population (sqrt heuristic), capped.
    const k = Math.max(2, Math.min(24, Math.round(Math.sqrt(users.length / 2))));
    const { assignments, centroids } = kmeans(users.map((u: any) => u.vec), k);

    const counts = new Array(centroids.length).fill(0);
    for (const a of assignments) counts[a]++;

    const clusterRows = centroids.map((c, i) => ({
      cluster_id: i, centroid: toVectorLiteral(c), member_count: counts[i], top_concepts: [], updated_at: new Date().toISOString(),
    })).filter((_, i) => counts[i] > 0);
    await sb.from("cluster_profiles").upsert(clusterRows, { onConflict: "cluster_id" });

    // Write user→cluster assignments in chunks.
    const userRows = users.map((u: any, i: number) => ({
      client_id: u.client_id, cluster_id: assignments[i], similarity: 0, updated_at: new Date().toISOString(),
    }));
    for (let i = 0; i < userRows.length; i += 500) {
      await sb.from("user_clusters").upsert(userRows.slice(i, i + 500), { onConflict: "client_id" });
    }

    await releaseLock(sb, "cluster-users");
    return new Response(JSON.stringify({ ok: true, users: users.length, clusters: clusterRows.length, k }, null, 2), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    await releaseLock(sb, "cluster-users");
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
