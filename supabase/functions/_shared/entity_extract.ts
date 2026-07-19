// Dynamic entity extraction — the engine behind Signal's self-discovering
// company registry. For each published story it pulls out companies, products,
// models, people, organizations, labs, frameworks, open-source projects,
// funding rounds, and acquisitions. NO hardcoded company list drives this: the
// primary path is an AI extraction call through the shared provider; a regex
// pass over the curated builtin dictionary is the deterministic fallback when
// the provider is unconfigured or fails, so ingestion never blocks.
//
// Output is normalized and deduped, ready for `link_article_entities`.

import { generateContent, isConfigured } from "./ai_provider.ts";
import { detectEntities } from "./trends.ts";

export interface ExtractedCompany {
  name: string;
  aliases?: string[];
  is_ai?: boolean;
  confidence?: number;                     // 0..1
  mention_type?: "primary" | "mentioned" | "product" | "funding" | "acquisition";
}

export interface ExtractedEntities {
  companies: ExtractedCompany[];
  products: string[];
  models: string[];
  people: string[];
  organizations: string[];
  labs: string[];
  frameworks: string[];
  open_source: string[];
  funding: string[];
  acquisitions: string[];
  source: "ai" | "fallback";
}

export interface StoryForExtraction {
  id: string;
  title: string;
  summary?: string;
  what_happened?: string;
  why_it_matters?: string;
}

const EMPTY = (): ExtractedEntities => ({
  companies: [], products: [], models: [], people: [], organizations: [],
  labs: [], frameworks: [], open_source: [], funding: [], acquisitions: [], source: "fallback",
});

function cleanName(v: unknown): string {
  return typeof v === "string"
    ? v.replace(/\s+/g, " ").trim().replace(/^[\s"'`.,-]+|[\s"'`.,-]+$/g, "")
    : "";
}

function uniqStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const name = cleanName(raw);
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(name);
  }
  return out;
}

function normalizeCompanies(values: unknown): ExtractedCompany[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: ExtractedCompany[] = [];
  for (const raw of values) {
    const obj = (raw && typeof raw === "object") ? raw as Record<string, unknown> : { name: raw };
    const name = cleanName(obj.name);
    if (!name || name.length > 80) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const conf = Number(obj.confidence);
    const mention = String(obj.mention_type ?? "").toLowerCase();
    out.push({
      name,
      aliases: uniqStrings(obj.aliases),
      is_ai: obj.is_ai === undefined ? true : Boolean(obj.is_ai),
      confidence: Number.isFinite(conf) ? Math.max(0, Math.min(1, conf)) : 0.9,
      mention_type: ["primary", "mentioned", "product", "funding", "acquisition"].includes(mention)
        ? mention as ExtractedCompany["mention_type"] : "mentioned",
    });
  }
  return out;
}

// Deterministic fallback: map the curated builtin regex dictionary onto the
// extraction shape. Company- and product-kind entries become companies (most
// "products" here are also the companies that ship them); frameworks stay
// frameworks. Never throws, never calls the network.
function regexFallback(text: string): ExtractedEntities {
  const result = EMPTY();
  for (const e of detectEntities(text)) {
    if (e.kind === "company" || e.kind === "product") {
      result.companies.push({ name: e.label, is_ai: true, confidence: 0.6, mention_type: "mentioned" });
    } else if (e.kind === "framework") {
      result.frameworks.push(e.label);
    }
  }
  return result;
}

const SYSTEM = `You are an information-extraction engine for an AI-industry intelligence platform.
Extract named entities from a single news story. Return ONLY entities that are explicitly named in the text — never infer, never add well-known names that are not mentioned.

Rules:
- companies: every organization/startup/lab named. For each: {"name","aliases","is_ai","confidence","mention_type"}.
  - name: the canonical brand name as commonly written (e.g. "Hugging Face", "DeepSeek", "GitHub").
  - aliases: alternate spellings actually implied (e.g. ["Github","Git Hub"] for GitHub). [] if none.
  - is_ai: true if it is an AI/ML company, lab, or an AI product's maker; false for non-AI orgs (banks, generic partners).
  - confidence: 0..1 that this is a correctly identified company.
  - mention_type: "primary" if the story is chiefly about it, else "mentioned"; "funding" if it raised money here; "acquisition" if acquired/acquirer; "product" if it is named only as a product's vendor.
- products, models, people, organizations, labs, frameworks, open_source, funding, acquisitions: arrays of short strings actually named in the text ([] if none).
- Deduplicate. Keep names short (no descriptions).

Output a single JSON object exactly:
{"companies":[],"products":[],"models":[],"people":[],"organizations":[],"labs":[],"frameworks":[],"open_source":[],"funding":[],"acquisitions":[]}`;

/**
 * Extract entities for one story. AI-first with a deterministic regex fallback.
 * Always resolves (never throws); on any provider failure returns the fallback.
 */
export async function extractStoryEntities(story: StoryForExtraction): Promise<ExtractedEntities> {
  const text = [story.title, story.summary, story.what_happened, story.why_it_matters]
    .filter(Boolean).join(". ").slice(0, 2000);
  if (!text.trim()) return EMPTY();

  if (!isConfigured()) return regexFallback(text);

  try {
    const res = await generateContent<Record<string, unknown>>({
      feature: "entity-extract",
      systemInstruction: { parts: [{ text: SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: `STORY:\n${text}` }] }],
      generationConfig: { temperature: 0, maxOutputTokens: 700, responseMimeType: "application/json" },
      timeoutMs: 20_000,
    });
    if (!res.success || !res.data || typeof res.data !== "object") return regexFallback(text);

    const d = res.data as Record<string, unknown>;
    const out: ExtractedEntities = {
      companies:     normalizeCompanies(d.companies),
      products:      uniqStrings(d.products),
      models:        uniqStrings(d.models),
      people:        uniqStrings(d.people),
      organizations: uniqStrings(d.organizations),
      labs:          uniqStrings(d.labs),
      frameworks:    uniqStrings(d.frameworks),
      open_source:   uniqStrings(d.open_source),
      funding:       uniqStrings(d.funding),
      acquisitions:  uniqStrings(d.acquisitions),
      source: "ai",
    };
    // If the model returned nothing usable, fall back so we never lose a story's
    // obvious builtin entities.
    if (out.companies.length === 0 && out.products.length === 0 && out.frameworks.length === 0) {
      const fb = regexFallback(text);
      if (fb.companies.length || fb.frameworks.length) return fb;
    }
    return out;
  } catch {
    return regexFallback(text);
  }
}

// ── Registry payload ─────────────────────────────────────────────────────────
// Flattens every extracted type into the shape `link_article_entities` expects:
// {name, type, aliases?, is_ai?, confidence?, mention_type?}. Deduped on
// (type + lowercased name). Entities pulled from an AI story are AI-relevant by
// default; generic organizations (banks, non-AI partners) are flagged is_ai=false
// so they stay searchable but never surface as AI entities on Home/autocomplete.
export interface EntityLinkInput {
  name: string;
  type: string;
  aliases?: string[];
  is_ai?: boolean;
  confidence?: number;
  mention_type?: string;
}

export function toEntityLinks(e: ExtractedEntities): EntityLinkInput[] {
  const out: EntityLinkInput[] = [];
  const seen = new Set<string>();
  const add = (name: string, type: string, is_ai: boolean, opts: Partial<EntityLinkInput> = {}) => {
    const clean = cleanName(name);
    if (!clean || clean.length > 80) return;
    const key = `${type}:${clean.toLowerCase()}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ name: clean, type, is_ai, confidence: opts.confidence ?? 0.8, mention_type: opts.mention_type ?? "mentioned", aliases: opts.aliases });
  };

  for (const c of e.companies) {
    add(c.name, "company", c.is_ai ?? true, { aliases: c.aliases, confidence: c.confidence, mention_type: c.mention_type });
  }
  e.products.forEach((n) => add(n, "product", true));
  e.models.forEach((n) => add(n, "model", true));
  e.labs.forEach((n) => add(n, "lab", true));
  e.frameworks.forEach((n) => add(n, "framework", true));
  e.open_source.forEach((n) => add(n, "open_source", true));
  e.people.forEach((n) => add(n, "person", true));
  e.organizations.forEach((n) => add(n, "organization", false));
  e.funding.forEach((n) => add(n, "funding", true));
  e.acquisitions.forEach((n) => add(n, "acquisition", true));
  return out;
}
