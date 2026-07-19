// AI Pulse — shared front-end types + a bundled sample dataset.
//
// The sample lets the flagship page render immediately (before MESH_API_KEY
// is configured / the edge function is deployed). When live data isn't
// available the page shows this sample behind a subtle "Preview" banner rather
// than a dead error screen. Presentation data only — no business logic.
import type { SourceKey } from "@/ui-v2/shared/types";

export interface PulseOverview {
  launches: number;
  funding_rounds: number;
  acquisitions: number;
  research_papers: number;
  open_source: number;
  model_launches: number;
  api_releases: number;
}

export interface PulseCompany {
  name: string;
  sourceKey?: SourceKey;
  latest_model: string;
  latest_release: string;   // e.g. "2d ago"
  activity_score: number;   // 0..100
  trend: "up" | "down" | "flat";
}

export interface PulseTrending {
  name: string;
  sourceKey?: SourceKey;
  note: string;
  change: number;           // percent, +/-
}

export interface PulseRelease {
  company: string;
  sourceKey?: SourceKey;
  title: string;
  when: string;             // relative time
  kind: string;             // Model / API / Open Source / Research
}

export interface PulseFunding {
  company: string;
  amount: string;           // "$40B"
  round: string;            // "Series F"
  investor?: string;
}

export interface PulsePartnership {
  a: string;
  b: string;
  note: string;
}

export interface PulseHeatCell {
  label: string;
  level: "green" | "yellow" | "red";
  note?: string;
}

export interface PulseAnalysis {
  industry_trend: string;
  key_insight: string;
  biggest_winner: string;
  biggest_loser: string;
  developer_impact: string;
  business_impact: string;
}

export interface PulseLeader {
  company: string;
  launches: number;
  partnerships: number;
  acquisitions: number;
}

export interface PulseData {
  overview: PulseOverview;
  leader: PulseLeader;
  companies: PulseCompany[];
  trending: PulseTrending[];
  releases: PulseRelease[];
  funding: PulseFunding[];
  partnerships: PulsePartnership[];
  heatmap: PulseHeatCell[];
  analysis: PulseAnalysis;
}

export const SAMPLE_PULSE: PulseData = {
  overview: {
    launches: 5, funding_rounds: 8, acquisitions: 1,
    research_papers: 34, open_source: 12, model_launches: 3, api_releases: 4,
  },
  leader: { company: "OpenAI", launches: 5, partnerships: 2, acquisitions: 1 },
  companies: [
    { name: "OpenAI", sourceKey: "openai", latest_model: "GPT-5.6", latest_release: "2d ago", activity_score: 96, trend: "up" },
    { name: "Anthropic", sourceKey: "anthropic", latest_model: "Claude Opus 4.8", latest_release: "4d ago", activity_score: 92, trend: "up" },
    { name: "Google", sourceKey: "google", latest_model: "Gemini 3 Ultra", latest_release: "1d ago", activity_score: 90, trend: "up" },
    { name: "Meta", sourceKey: "meta", latest_model: "Llama 4.1", latest_release: "6d ago", activity_score: 78, trend: "flat" },
    { name: "xAI", latest_model: "Grok 4", latest_release: "3d ago", activity_score: 74, trend: "up" },
    { name: "Perplexity", sourceKey: "perplexity", latest_model: "Sonar Pro", latest_release: "5d ago", activity_score: 68, trend: "flat" },
    { name: "Mistral", sourceKey: "mistral", latest_model: "Mistral Large 3", latest_release: "8d ago", activity_score: 61, trend: "down" },
    { name: "DeepSeek", latest_model: "DeepSeek V4", latest_release: "2d ago", activity_score: 65, trend: "up" },
  ],
  trending: [
    { name: "xAI", note: "Grok 4 tops reasoning boards", change: 18 },
    { name: "DeepSeek", sourceKey: undefined, note: "Open weights momentum", change: 12 },
    { name: "Google", sourceKey: "google", note: "Gemini 3 enterprise push", change: 9 },
    { name: "Mistral", sourceKey: "mistral", note: "Cooling after Q3", change: -6 },
  ],
  releases: [
    { company: "Google", sourceKey: "google", title: "Gemini 3 Ultra — 4M context", when: "1d ago", kind: "Model" },
    { company: "OpenAI", sourceKey: "openai", title: "Realtime API v2 (voice + vision)", when: "2d ago", kind: "API" },
    { company: "DeepSeek", title: "DeepSeek V4 open weights", when: "2d ago", kind: "Open Source" },
    { company: "Anthropic", sourceKey: "anthropic", title: "Claude Opus 4.8 — agentic coding", when: "4d ago", kind: "Model" },
    { company: "Meta", sourceKey: "meta", title: "Llama 4.1 vision update", when: "6d ago", kind: "Open Source" },
  ],
  funding: [
    { company: "Anthropic", amount: "$40B", round: "Series G", investor: "Multiple" },
    { company: "xAI", amount: "$12B", round: "Series C", investor: "Consortium" },
    { company: "Mistral", amount: "$2B", round: "Series C", investor: "EU funds" },
    { company: "Perplexity", amount: "$1B", round: "Series D", investor: "Growth" },
  ],
  partnerships: [
    { a: "OpenAI", b: "Microsoft", note: "Extended Azure compute pact" },
    { a: "Anthropic", b: "Amazon", note: "Trainium scale-up" },
    { a: "Google", b: "Samsung", note: "On-device Gemini nano" },
  ],
  heatmap: [
    { label: "Foundation models", level: "green", note: "Very active" },
    { label: "AI agents", level: "green", note: "Heating up" },
    { label: "Open source", level: "green", note: "Strong" },
    { label: "Funding", level: "yellow", note: "Selective" },
    { label: "Chips / compute", level: "yellow", note: "Constrained" },
    { label: "Consumer apps", level: "red", note: "Crowded" },
  ],
  analysis: {
    industry_trend: "The frontier race has shifted from raw benchmarks to agentic reliability and long-context reasoning.",
    key_insight: "Whoever ships dependable multi-step agents first captures the enterprise budget wave.",
    biggest_winner: "OpenAI — most launches + Realtime API traction",
    biggest_loser: "Mistral — momentum cooling amid tighter EU funding",
    developer_impact: "New realtime + long-context APIs make agent workflows far cheaper to build.",
    business_impact: "Enterprises are consolidating spend around 2–3 model providers with strong agent tooling.",
  },
};
