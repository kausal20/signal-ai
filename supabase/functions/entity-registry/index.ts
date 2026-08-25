// supabase/functions/entity-registry/index.ts
// ---------------------------------------------------------------------------
// Master Entity Registry — reusable CRUD / merge / find / search / import API.
// Admin-gated (service_role or admin JWT). Thin, deterministic wrappers over
// the DB RPCs (upsert_entity, resolve_entity, entity_suggest, merge_entities,
// find_duplicate_entities, set_entity_identifier). Validation + normalization
// come from the shared _shared/entity_registry.ts so client, importer, and DB
// agree on one set of rules.
//
// POST JSON: { "action": "...", ... }
//   get      { id | slug | name }                      → entity + aliases + identifiers + metrics
//   find     { q }                                     → best-match entity (resolve_entity)
//   search   { q, types?, limit? }                     → prefix/fuzzy suggestions (entity_suggest)
//   create   { name, type?, aliases?, website?, ... }  → create-or-update, returns entity
//   update   { id, patch: {...} }                      → partial update
//   delete   { id, hard? }                             → soft-archive (default) or hard delete
//   merge    { keeper, loser }                         → merge_entities (DESTRUCTIVE)
//   duplicates { min_sim?, limit? }                    → find_duplicate_entities (report only)
//   import   { format: "json"|"csv", data, mode? }     → bulk create/update/merge/skip
// ---------------------------------------------------------------------------
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { requireAdmin } from "../_shared/admin_auth.ts";
import {
  validateEntity, parseImport, type EntityInput,
} from "../_shared/entity_registry.ts";
import {
  resolveCandidates, resolveMulti, entityFull, splitMultiEntityQuery,
} from "../_shared/entity_resolver.ts";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

// deno-lint-ignore no-explicit-any
type SB = any;

// resolve_entity is a set-returning function (RETURNS TABLE) → supabase-js
// hands back an array of rows. Extract the single best-match id.
async function resolveEntityId(sb: SB, q: string): Promise<string | null> {
  if (!q || !q.trim()) return null;
  const { data } = await sb.rpc("resolve_entity", { q_raw: q });
  const row = Array.isArray(data) ? data[0] : data;
  return row?.entity_id ?? null;
}

// Load a full entity view (entity + aliases + identifiers + metrics).
async function loadEntity(sb: SB, id: string) {
  const { data: entity } = await sb.from("entities").select("*").eq("id", id).maybeSingle();
  if (!entity) return null;
  const [{ data: aliases }, { data: identifiers }, { data: metrics }] = await Promise.all([
    sb.from("entity_aliases").select("alias, normalized_alias, source").eq("entity_id", id),
    sb.from("entity_identifiers").select("kind, value, verified, source").eq("entity_id", id),
    sb.from("entity_metrics").select("*").eq("entity_id", id).maybeSingle(),
  ]);
  return { ...entity, aliases: aliases ?? [], identifiers: identifiers ?? [], metrics: metrics ?? null };
}

// Resolve an entity id from id | slug | name.
async function resolveId(sb: SB, ref: { id?: string; slug?: string; name?: string }): Promise<string | null> {
  if (ref.id) return ref.id;
  if (ref.slug) {
    const { data } = await sb.from("entities").select("id").eq("slug", ref.slug).maybeSingle();
    return data?.id ?? null;
  }
  if (ref.name) return resolveEntityId(sb, ref.name);
  return null;
}

// Create-or-update one entity from validated input; returns entity id.
async function upsertEntity(sb: SB, input: EntityInput): Promise<{ id: string | null; errors: string[] }> {
  const v = validateEntity(input);
  if (!v.valid || !v.clean) return { id: null, errors: v.errors };
  const c = v.clean;

  // Base upsert via the existing RPC (handles slug/normalized_name/aliases).
  const { error: upErr } = await sb.rpc("upsert_entity", {
    p_name: c.name, p_type: c.type, p_aliases: input.aliases ?? [],
    p_is_ai: input.is_ai ?? true, p_website: c.website, p_description: input.description ?? null,
  });
  if (upErr) return { id: null, errors: [upErr.message] };

  const id = await resolveEntityId(sb, c.name);
  if (!id) return { id: null, errors: ["entity not found after upsert"] };

  // Apply the MER-specific columns the RPC doesn't cover.
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (c.official_domain) patch.official_domain = c.official_domain;
  if (input.short_description != null) patch.short_description = input.short_description;
  if (input.country != null) patch.country = input.country;
  if (input.headquarters != null) patch.headquarters = input.headquarters;
  if (c.founded_year != null) patch.founded_year = c.founded_year;
  if (input.status != null) patch.status = c.status;
  await sb.from("entities").update(patch).eq("id", id);

  // Identifiers (canonicalized in validateEntity).
  for (const ident of c.identifiers) {
    await sb.rpc("set_entity_identifier", {
      p_entity: id, p_kind: ident.kind, p_value: ident.value, p_verified: false, p_source: "api",
    });
  }
  return { id, errors: [] };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const adminErr = requireAdmin(req, cors);
  if (adminErr) return adminErr;

  const sb: SB = createClient(SUPABASE_URL, SERVICE_KEY);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const action = String(body.action ?? "");

  try {
    switch (action) {
      case "get": {
        const id = await resolveId(sb, body as { id?: string; slug?: string; name?: string });
        if (!id) return json({ ok: false, error: "not found" }, 404);
        return json({ ok: true, entity: await loadEntity(sb, id) });
      }

      case "find": {
        const q = String(body.q ?? "");
        if (!q) return json({ ok: false, error: "q required" }, 400);
        const id = await resolveEntityId(sb, q);
        if (!id) return json({ ok: true, entity: null });
        return json({ ok: true, entity: await loadEntity(sb, id) });
      }

      case "search": {
        const q = String(body.q ?? "");
        const types = Array.isArray(body.types) ? body.types.map(String) : null;
        const limit = Math.min(Number(body.limit ?? 8), 50);
        const { data, error } = await sb.rpc("entity_suggest", { p_prefix: q, p_types: types, max_results: limit });
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, results: data ?? [] });
      }

      case "create": {
        const { id, errors } = await upsertEntity(sb, body as unknown as EntityInput);
        if (!id) return json({ ok: false, errors }, 400);
        return json({ ok: true, entity: await loadEntity(sb, id) });
      }

      case "update": {
        const id = await resolveId(sb, body as { id?: string; slug?: string; name?: string });
        if (!id) return json({ ok: false, error: "not found" }, 404);
        const patch = (body.patch ?? {}) as EntityInput & Record<string, unknown>;
        // Re-validate any changed website/type/status/founded_year/identifiers.
        const merged: EntityInput = { name: String(patch.name ?? (await sb.from("entities").select("canonical_name").eq("id", id).maybeSingle()).data?.canonical_name ?? ""), ...patch };
        const v = validateEntity(merged);
        if (!v.valid) return json({ ok: false, errors: v.errors }, 400);
        const col: Record<string, unknown> = { updated_at: new Date().toISOString() };
        for (const k of ["short_description", "country", "headquarters", "description", "logo_url", "website", "parent_company"]) {
          if (patch[k] !== undefined) col[k] = patch[k];
        }
        if (patch.type !== undefined) col.type = v.clean!.type;
        if (patch.status !== undefined) col.status = v.clean!.status;
        if (patch.founded_year !== undefined) col.founded_year = v.clean!.founded_year;
        if (patch.official_domain !== undefined) col.official_domain = v.clean!.official_domain;
        await sb.from("entities").update(col).eq("id", id);
        for (const ident of v.clean!.identifiers) {
          await sb.rpc("set_entity_identifier", { p_entity: id, p_kind: ident.kind, p_value: ident.value, p_verified: false, p_source: "api" });
        }
        return json({ ok: true, entity: await loadEntity(sb, id) });
      }

      case "delete": {
        const id = await resolveId(sb, body as { id?: string });
        if (!id) return json({ ok: false, error: "not found" }, 404);
        if (body.hard === true) {
          await sb.from("entities").delete().eq("id", id);
          return json({ ok: true, deleted: id, mode: "hard" });
        }
        // Soft delete = archive (preserves links/relationships/history).
        await sb.from("entities").update({ status: "archived", updated_at: new Date().toISOString() }).eq("id", id);
        return json({ ok: true, deleted: id, mode: "archived" });
      }

      case "merge": {
        const keeper = String(body.keeper ?? "");
        const loser = String(body.loser ?? "");
        if (!keeper || !loser) return json({ ok: false, error: "keeper and loser required" }, 400);
        const { error } = await sb.rpc("merge_entities", { p_keeper: keeper, p_loser: loser });
        if (error) return json({ ok: false, error: error.message }, 400);
        return json({ ok: true, merged: { keeper, loser }, entity: await loadEntity(sb, keeper) });
      }

      case "duplicates": {
        const minSim = Number(body.min_sim ?? 0.6);
        const limit = Math.min(Number(body.limit ?? 200), 1000);
        const { data, error } = await sb.rpc("find_duplicate_entities", { p_min_sim: minSim, max_results: limit });
        if (error) return json({ ok: false, error: error.message }, 500);
        return json({ ok: true, candidates: data ?? [] });
      }

      case "import": {
        const format = body.format === "csv" ? "csv" : "json";
        const mode = String(body.mode ?? "upsert"); // upsert | skip_existing
        let rows: EntityInput[];
        try { rows = parseImport(body.data, format); }
        catch (e) { return json({ ok: false, error: `parse failed: ${e instanceof Error ? e.message : e}` }, 400); }

        const summary = { total: rows.length, created: 0, updated: 0, skipped: 0, failed: 0, errors: [] as string[] };
        for (const row of rows) {
          try {
            const existedId = await resolveEntityId(sb, row.name);
            if (existedId && mode === "skip_existing") { summary.skipped++; continue; }
            const { id, errors } = await upsertEntity(sb, row);
            if (!id) { summary.failed++; summary.errors.push(`${row.name}: ${errors.join("; ")}`); continue; }
            existedId ? summary.updated++ : summary.created++;
          } catch (e) {
            summary.failed++; summary.errors.push(`${row.name}: ${e instanceof Error ? e.message : e}`);
          }
        }
        return json({ ok: true, summary });
      }

      // ── Entity Resolution Engine (Phase 2) ──────────────────────────────
      case "resolve": {
        // Best single match with confidence. Optional types filter + min conf.
        const q = String(body.q ?? "");
        if (!q) return json({ ok: false, error: "q required" }, 400);
        const cands = await resolveCandidates(sb, q, {
          limit: 1,
          types: Array.isArray(body.types) ? body.types.map(String) : undefined,
          minConfidence: body.min_confidence != null ? Number(body.min_confidence) : undefined,
        });
        const winner = cands[0] ?? null;
        // When we have a winner, include the full payload so callers don't need
        // a second round-trip for parent/children/identifiers.
        const full = winner ? await entityFull(sb, winner.entity_id) : null;
        return json({ ok: true, resolved: winner, full });
      }

      case "candidates": {
        // Top-N with confidence + ambiguity flag; used by disambiguation UIs.
        const q = String(body.q ?? "");
        if (!q) return json({ ok: false, error: "q required" }, 400);
        const cands = await resolveCandidates(sb, q, {
          limit: Math.min(Number(body.limit ?? 5), 25),
          types: Array.isArray(body.types) ? body.types.map(String) : undefined,
          minConfidence: body.min_confidence != null ? Number(body.min_confidence) : undefined,
        });
        return json({ ok: true, candidates: cands, is_ambiguous: cands[0]?.is_ambiguous ?? false });
      }

      case "resolve_multi": {
        // Split "A vs B" / "A and B" and resolve each segment.
        const q = String(body.q ?? "");
        if (!q) return json({ ok: false, error: "q required" }, 400);
        const segments = await resolveMulti(sb, q, {
          limit: Math.min(Number(body.per_segment ?? 3), 10),
          minConfidence: body.min_confidence != null ? Number(body.min_confidence) : undefined,
        });
        return json({ ok: true, split: splitMultiEntityQuery(q), segments });
      }

      case "confidence": {
        // Cheap: return only the top confidence + entity_id.
        const q = String(body.q ?? "");
        if (!q) return json({ ok: false, error: "q required" }, 400);
        const cands = await resolveCandidates(sb, q, { limit: 1 });
        const top = cands[0];
        return json({ ok: true, entity_id: top?.entity_id ?? null, confidence: top?.confidence ?? 0, is_ambiguous: top?.is_ambiguous ?? false });
      }

      default:
        return json({ ok: false, error: `unknown action "${action}"` }, 400);
    }
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
