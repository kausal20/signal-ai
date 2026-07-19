// Compare AI — curated model/tool ratings for the Compare page.
// Presentation only. Scores are 0..100 where higher = better on that axis
// (Price = value-for-money, not raw cost). Not authoritative benchmarks.
import type { SourceKey } from "@/ui-v2/shared/types";

export const CATEGORIES = [
  "Coding", "Reasoning", "Speed", "Price", "Images", "Video", "Context",
  "API", "Tool Calling", "MCP", "Enterprise", "Students", "Business", "Security",
] as const;
export type Category = (typeof CATEGORIES)[number];

export interface CompareModel {
  id: string;
  name: string;
  maker: string;
  sourceKey?: SourceKey;
  blurb: string;
  scores: Record<Category, number>;
}

const s = (v: Partial<Record<Category, number>>): Record<Category, number> => {
  const out = {} as Record<Category, number>;
  for (const c of CATEGORIES) out[c] = v[c] ?? 50;
  return out;
};

export const MODELS: CompareModel[] = [
  {
    id: "gpt", name: "GPT-5.5", maker: "OpenAI", sourceKey: "openai",
    blurb: "Broad, reliable all-rounder with strong tools + realtime.",
    scores: s({ Coding: 92, Reasoning: 93, Speed: 82, Price: 70, Images: 88, Video: 74, Context: 84, API: 95, "Tool Calling": 94, MCP: 88, Enterprise: 92, Students: 80, Business: 90, Security: 88 }),
  },
  {
    id: "claude", name: "Claude Opus 4.8", maker: "Anthropic", sourceKey: "anthropic",
    blurb: "Best-in-class agentic coding and long, careful reasoning.",
    scores: s({ Coding: 96, Reasoning: 95, Speed: 78, Price: 66, Images: 78, Video: 40, Context: 92, API: 90, "Tool Calling": 93, MCP: 96, Enterprise: 90, Students: 82, Business: 88, Security: 92 }),
  },
  {
    id: "gemini", name: "Gemini 3 Ultra", maker: "Google", sourceKey: "google",
    blurb: "Massive context, strong multimodal, deep Google integration.",
    scores: s({ Coding: 88, Reasoning: 90, Speed: 85, Price: 78, Images: 92, Video: 90, Context: 98, API: 88, "Tool Calling": 86, MCP: 80, Enterprise: 88, Students: 84, Business: 86, Security: 86 }),
  },
  {
    id: "grok", name: "Grok 4", maker: "xAI",
    blurb: "Fast, current-events aware, strong reasoning momentum.",
    scores: s({ Coding: 84, Reasoning: 88, Speed: 90, Price: 74, Images: 80, Video: 66, Context: 82, API: 80, "Tool Calling": 82, MCP: 70, Enterprise: 74, Students: 78, Business: 78, Security: 76 }),
  },
  {
    id: "mistral", name: "Mistral Large 3", maker: "Mistral",
    blurb: "Efficient, open-friendly, strong price-performance in the EU.",
    scores: s({ Coding: 80, Reasoning: 82, Speed: 88, Price: 88, Images: 60, Video: 30, Context: 78, API: 84, "Tool Calling": 80, MCP: 72, Enterprise: 80, Students: 82, Business: 80, Security: 82 }),
  },
  {
    id: "deepseek", name: "DeepSeek V4", maker: "DeepSeek",
    blurb: "Open weights, excellent value, strong reasoning for the price.",
    scores: s({ Coding: 86, Reasoning: 88, Speed: 82, Price: 96, Images: 55, Video: 30, Context: 84, API: 78, "Tool Calling": 76, MCP: 68, Enterprise: 70, Students: 90, Business: 74, Security: 72 }),
  },
  {
    id: "perplexity", name: "Perplexity", maker: "Perplexity", sourceKey: "perplexity",
    blurb: "Answer engine — best for sourced research and search.",
    scores: s({ Coding: 66, Reasoning: 82, Speed: 84, Price: 80, Images: 60, Video: 40, Context: 78, API: 74, "Tool Calling": 70, MCP: 60, Enterprise: 72, Students: 88, Business: 78, Security: 78 }),
  },
  {
    id: "cursor", name: "Cursor", maker: "Anysphere", sourceKey: "cursor",
    blurb: "AI-native IDE — the fastest way to ship code with models.",
    scores: s({ Coding: 95, Reasoning: 80, Speed: 88, Price: 74, Images: 20, Video: 10, Context: 86, API: 60, "Tool Calling": 88, MCP: 90, Enterprise: 82, Students: 86, Business: 80, Security: 82 }),
  },
  {
    id: "lovable", name: "Lovable", maker: "Lovable",
    blurb: "Prompt-to-app builder — ship full-stack products fast.",
    scores: s({ Coding: 84, Reasoning: 70, Speed: 90, Price: 72, Images: 40, Video: 20, Context: 72, API: 55, "Tool Calling": 74, MCP: 70, Enterprise: 70, Students: 88, Business: 82, Security: 74 }),
  },
  {
    id: "bolt", name: "Bolt", maker: "StackBlitz",
    blurb: "In-browser full-stack AI builder with instant preview.",
    scores: s({ Coding: 82, Reasoning: 68, Speed: 92, Price: 74, Images: 35, Video: 15, Context: 70, API: 52, "Tool Calling": 70, MCP: 64, Enterprise: 66, Students: 86, Business: 78, Security: 72 }),
  },
];
