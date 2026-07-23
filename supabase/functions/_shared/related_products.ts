// Related Products — derived dynamically from Entity Intelligence.
// Given a query, find co-mentioned entities in the entity_article_links graph
// (products > models > companies > frameworks) and rank by co-occurrence.
// Falls back to related companies, then related technologies. Never returns a
// hardcoded list; every entity comes from the live registry + article links.

export interface RelatedItem { name: string; type: string; slug: string; }

const PRODUCT_TYPES = new Set(["product", "model", "open_source", "framework"]);
const COMPANY_TYPES = new Set(["company", "organization", "lab"]);
const GENERIC_NAMES = new Set([
  "ai", "artificial intelligence", "llm", "chatbot", "api", "sdk", "github",
  "aws", "azure", "google cloud", "amazon", "microsoft", "youtube", "twitter",
  "linkedin", "reddit", "hacker news", "twitter/x", "x",
]);

function isGeneric(name: string): boolean {
  return GENERIC_NAMES.has(name.toLowerCase().trim());
}

// Resolve the query to an entity_id (canonical_name, slug, or alias). Tries
// exact first, then prefix, then contains — so "gpt-5" matches "GPT-5.6".
async function resolveEntityId(sb: any, query: string): Promise<{ id: string; name: string } | null> {
  const q = query.trim();
  if (!q) return null;
  const qLower = q.toLowerCase();
  const esc = q.replace(/[%_,]/g, (c) => `\\${c}`);
  // Exact.
  const { data: exact } = await sb.from("entities")
    .select("id,canonical_name")
    .or(`canonical_name.ilike.${esc},slug.ilike.${esc},normalized_name.ilike.${qLower}`)
    .order("last_seen", { ascending: false })
    .limit(1);
  if (exact?.[0]?.id) return { id: exact[0].id, name: exact[0].canonical_name };
  // Alias exact.
  const { data: alias } = await sb.from("entity_aliases")
    .select("entity_id,alias")
    .or(`alias.ilike.${esc},normalized_alias.ilike.${qLower}`)
    .limit(1);
  if (alias?.[0]?.entity_id) {
    const { data: e } = await sb.from("entities").select("id,canonical_name").eq("id", alias[0].entity_id).limit(1);
    if (e?.[0]) return { id: e[0].id, name: e[0].canonical_name };
  }
  // Prefix / contains match — pick the highest-signal entity first.
  const { data: partial } = await sb.from("entities")
    .select("id,canonical_name,last_seen")
    .or(`canonical_name.ilike.${esc}%,slug.ilike.${esc}%,canonical_name.ilike.%${esc}%`)
    .order("last_seen", { ascending: false })
    .limit(1);
  if (partial?.[0]?.id) return { id: partial[0].id, name: partial[0].canonical_name };
  return null;
}

// Rank co-mentioned entities by (co-occurrence count) × (type weight).
function typeWeight(type: string): number {
  if (PRODUCT_TYPES.has(type)) return 1.0;
  if (COMPANY_TYPES.has(type)) return 0.75;
  return 0.5;
}

/**
 * Derive Related Products for a query. Returns up to `max` items ranked by
 * co-mention strength. Types are: product > model > open_source > framework
 * (Related Products), then company > organization > lab (Related Companies),
 * then everything else (Related Technologies) — caller chooses the label.
 */
export async function relatedProducts(
  sb: any, query: string, max = 8,
): Promise<{ items: RelatedItem[]; fallback: "products" | "companies" | "technologies" | "none" }> {
  const resolved = await resolveEntityId(sb, query);
  if (!resolved) return { items: [], fallback: "none" };
  const entityId = resolved.id;
  // Names to exclude from results — the query text + the resolved entity name +
  // common variants so "cursor" query doesn't surface "Cursor" in results.
  const excludeNames = new Set<string>([
    query.trim().toLowerCase(),
    resolved.name.toLowerCase(),
    resolved.name.toLowerCase().replace(/[^a-z0-9]+/g, ""),
  ]);

  // Articles this entity appears in.
  const { data: myArticles } = await sb.from("entity_article_links")
    .select("article_id")
    .eq("entity_id", entityId)
    .limit(500);
  const articleIds = (myArticles ?? []).map((r: any) => r.article_id).filter(Boolean);
  if (articleIds.length === 0) return { items: [], fallback: "none" };

  // Co-mentioned entities in those articles.
  const { data: coRows } = await sb.from("entity_article_links")
    .select("entity_id")
    .in("article_id", articleIds)
    .neq("entity_id", entityId)
    .limit(5000);
  if (!coRows?.length) return { items: [], fallback: "none" };

  const counts = new Map<string, number>();
  for (const r of coRows) counts.set(r.entity_id, (counts.get(r.entity_id) ?? 0) + 1);

  const topIds = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, max * 6).map(([id]) => id);
  const { data: ents } = await sb.from("entities")
    .select("id,canonical_name,slug,type")
    .in("id", topIds);
  if (!ents?.length) return { items: [], fallback: "none" };

  const enriched = ents.map((e: any) => ({
    e,
    score: (counts.get(e.id) ?? 0) * typeWeight(e.type),
  })).filter((r: any) => !isGeneric(r.e.canonical_name)
      && !excludeNames.has(String(r.e.canonical_name).toLowerCase())
      && !excludeNames.has(String(r.e.canonical_name).toLowerCase().replace(/[^a-z0-9]+/g, "")));

  const pick = (allowed: Set<string>): RelatedItem[] =>
    enriched
      .filter((r: any) => allowed.has(r.e.type))
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, max)
      .map((r: any) => ({ name: r.e.canonical_name as string, type: r.e.type as string, slug: r.e.slug as string }));

  const products = pick(PRODUCT_TYPES);
  if (products.length >= 3) return { items: products, fallback: "products" };
  const companies = pick(COMPANY_TYPES);
  if (companies.length >= 3) return { items: companies, fallback: "companies" };
  const others = enriched
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, max)
    .map((r: any) => ({ name: r.e.canonical_name as string, type: r.e.type as string, slug: r.e.slug as string }));
  if (others.length > 0) return { items: others, fallback: "technologies" };
  return { items: [], fallback: "none" };
}
