// Stage 10: Trend memory — recurring entities across the rolling 14-day window.
// Recomputed by `update-trends` and attached to stories at publish time.

import type { TrendEntity } from "./types.ts";

interface EntityDef {
  id: string;
  label: string;
  kind: TrendEntity["kind"];
  match: RegExp;
}

// Curated trend dictionary. New entities can be added without redeploy by
// inserting rows into trend_entities — the regex falls back to label.
const BUILTIN_ENTITIES: EntityDef[] = [
  // Frontier labs
  { id: "openai", label: "OpenAI", kind: "company", match: /\b(openai|chatgpt|gpt[- ]?[45])\b/i },
  { id: "anthropic", label: "Anthropic", kind: "company", match: /\b(anthropic|claude(\s*(opus|sonnet|haiku))?)\b/i },
  { id: "deepmind", label: "Google DeepMind", kind: "company", match: /\b(deepmind|google\s*deepmind|gemini)\b/i },
  { id: "meta_ai", label: "Meta AI", kind: "company", match: /\b(meta\s*ai|llama)\b/i },
  { id: "microsoft", label: "Microsoft AI", kind: "company", match: /\b(microsoft\s*ai|copilot|azure\s*ai)\b/i },
  { id: "xai", label: "xAI", kind: "company", match: /\b(xai|grok)\b/i },
  { id: "mistral", label: "Mistral", kind: "company", match: /\bmistral\b/i },
  // Builder tools
  { id: "cursor", label: "Cursor", kind: "product", match: /\bcursor\b/i },
  { id: "perplexity", label: "Perplexity", kind: "product", match: /\bperplexity\b/i },
  { id: "windsurf", label: "Windsurf", kind: "product", match: /\bwindsurf\b/i },
  { id: "lovable", label: "Lovable", kind: "product", match: /\blovable\b/i },
  { id: "replit", label: "Replit", kind: "product", match: /\breplit\b/i },
  { id: "v0", label: "v0", kind: "product", match: /\bv0\b/i },
  { id: "bolt", label: "bolt.new", kind: "product", match: /\bbolt\.new\b/i },
  // Creative
  { id: "runway", label: "Runway", kind: "product", match: /\brunway\b/i },
  { id: "elevenlabs", label: "ElevenLabs", kind: "product", match: /\belevenlabs\b/i },
  { id: "midjourney", label: "Midjourney", kind: "product", match: /\bmidjourney\b/i },
  { id: "suno", label: "Suno", kind: "product", match: /\bsuno\b/i },
  { id: "pika", label: "Pika", kind: "product", match: /\bpika\b/i },
  { id: "luma", label: "Luma", kind: "product", match: /\bluma\b/i },
  // Frameworks
  { id: "langchain", label: "LangChain", kind: "framework", match: /\blangchain\b/i },
  { id: "crewai", label: "CrewAI", kind: "framework", match: /\bcrewai\b/i },
  { id: "autogen", label: "AutoGen", kind: "framework", match: /\bautogen\b/i },
  { id: "n8n", label: "n8n", kind: "framework", match: /\bn8n\b/i },
  { id: "mcp", label: "MCP", kind: "framework", match: /\bmcp\b/i },
  // Modalities / topics
  { id: "agents", label: "AI Agents", kind: "topic", match: /\bagents?\b/i },
  { id: "voice_ai", label: "Voice AI", kind: "topic", match: /\b(voice\s*ai|tts|stt|realtime\s*api|speech)\b/i },
  { id: "video_ai", label: "Video AI", kind: "topic", match: /\b(video\s*ai|veo|sora|gen-?[34])\b/i },
  { id: "robotics", label: "Robotics AI", kind: "topic", match: /\brobotics?\b/i },
  { id: "reasoning_models", label: "Reasoning Models", kind: "topic", match: /\b(reasoning\s*model|o1|o3|chain[- ]of[- ]thought)\b/i },
  { id: "long_context", label: "Long Context", kind: "topic", match: /\b(long\s*context|million\s*token|1m\s*token|2m\s*token)\b/i },
  { id: "open_weights", label: "Open Weights", kind: "topic", match: /\b(open\s*weights?|open[- ]source\s*model|apache\s*2\.0)\b/i },
  { id: "browser_use", label: "Browser Use", kind: "topic", match: /\bbrowser\s*use\b/i },
  { id: "computer_use", label: "Computer Use", kind: "topic", match: /\bcomputer\s*use\b/i },
  { id: "coding_assistants", label: "Coding Assistants", kind: "topic", match: /\b(coding\s*assistant|code\s*assistant|ai\s*pair\s*programm|autocomplete|code\s*completion)\b/i },
  { id: "memory", label: "AI Memory", kind: "topic", match: /\b(persistent\s*memory|long[- ]term\s*memory|agent\s*memory|memory\s*layer|vector\s*memory)\b/i },
  { id: "inference", label: "Inference", kind: "topic", match: /\b(inference\s*(speed|cost|engine|stack)|tokens?\/sec|tokens?\s*per\s*second|throughput|vllm|tensorrt|quantization)\b/i },
  { id: "image_gen", label: "Image Generation", kind: "topic", match: /\b(image\s*generation|text[- ]to[- ]image|diffusion\s*model|flux|stable\s*diffusion)\b/i },
];

export function detectEntities(text: string): { id: string; label: string; kind: TrendEntity["kind"] }[] {
  const out: { id: string; label: string; kind: TrendEntity["kind"] }[] = [];
  const seen = new Set<string>();
  for (const e of BUILTIN_ENTITIES) {
    if (seen.has(e.id)) continue;
    if (e.match.test(text)) {
      out.push({ id: e.id, label: e.label, kind: e.kind });
      seen.add(e.id);
    }
  }
  return out;
}

// Convert (rolling_14d, rolling_7d) into a momentum score 0..100.
// Rising = recent activity strongly outweighs the older half.
export function computeMomentum(rolling7d: number, rolling14d: number): { momentum: number; state: TrendEntity["trend_state"] } {
  const older7 = Math.max(0, rolling14d - rolling7d);
  if (rolling14d === 0) return { momentum: 0, state: "dormant" };
  const ratio = rolling7d / Math.max(1, older7);
  const momentum = Math.max(0, Math.min(100, Math.round(50 + (ratio - 1) * 25 + Math.log10(1 + rolling14d) * 5)));
  let state: TrendEntity["trend_state"] = "flat";
  if (rolling7d === 0) state = "dormant";
  else if (ratio >= 1.5) state = "rising";
  else if (ratio <= 0.6) state = "declining";
  return { momentum, state };
}

// Per-story trend + momentum scores derived from the entities present in it.
export function storyTrendScore(
  entities: string[],
  trendIndex: Map<string, TrendEntity>,
): { trend_score: number; momentum_score: number } {
  if (entities.length === 0) return { trend_score: 0, momentum_score: 0 };
  let bestMomentum = 0;
  let avgMomentum = 0;
  let count = 0;
  for (const id of entities) {
    const t = trendIndex.get(id);
    if (!t) continue;
    avgMomentum += t.momentum;
    bestMomentum = Math.max(bestMomentum, t.momentum);
    count++;
  }
  if (count === 0) return { trend_score: 0, momentum_score: 0 };
  return {
    trend_score: Math.round((avgMomentum / count) * 0.6 + bestMomentum * 0.4),
    momentum_score: bestMomentum,
  };
}

export async function loadTrendIndex(sb: any): Promise<Map<string, TrendEntity>> {
  const idx = new Map<string, TrendEntity>();
  try {
    const { data } = await sb.from("trend_entities").select("*");
    for (const row of data ?? []) idx.set(row.id, row as TrendEntity);
  } catch (e) {
    console.error("loadTrendIndex", e);
  }
  return idx;
}

// Human-readable trend/company-memory note for a story, from its entities.
// e.g. "3rd Cursor signal this fortnight" / "AI Agents: fastest-rising category".
export function trendInsightFor(entities: string[], idx: Map<string, TrendEntity>): string {
  let best: TrendEntity | null = null;
  for (const id of entities) {
    const t = idx.get(id);
    if (!t) continue;
    if (!best || t.momentum > best.momentum || (t.momentum === best.momentum && t.rolling_7d > best.rolling_7d)) {
      best = t;
    }
  }
  if (!best) return "";
  const n = best.rolling_14d;
  if (best.trend_state === "rising" && best.rolling_7d >= 3) {
    return `${best.label} is the fastest-rising category right now — ${best.rolling_7d} signals this week.`;
  }
  if (n >= 3) {
    const ord = n === 3 ? "3rd" : n === 4 ? "4th" : `${n}th`;
    return `This is the ${ord} ${best.label} signal in the last two weeks.`;
  }
  if (best.trend_state === "declining") {
    return `${best.label} momentum is cooling — fewer signals than last week.`;
  }
  return "";
}
