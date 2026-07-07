// signal-ui-v2 · shared/types.ts
// ---------------------------------------------------------------------------
// Shared, backend-agnostic prop shapes. These describe the DATA the production
// app is expected to pass in. They contain NO business logic — they are the
// contract between your data layer and this UI layer.
//
// Map your existing domain models (Supabase rows, recommendation-engine output,
// etc.) onto these shapes at the call site. Nothing here fetches or computes.
// ---------------------------------------------------------------------------

export type SignalTag = "tool" | "news" | "prompt" | "use-case";

export type SourceKey =
  | "github"
  | "reddit"
  | "producthunt"
  | "arxiv"
  | "hackernews"
  | "openai"
  | "anthropic"
  | "apple"
  | "azure"
  | "google"
  | "huggingface"
  | "langchain"
  | "meta"
  | "microsoft"
  | "mistral"
  | "cursor"
  | "nvidia"
  | "perplexity"
  | "runway";

/** A single feed item / signal. */
export interface Signal {
  id: string;
  title: string;
  source: string;          // display label, e.g. "OpenAI"
  sourceKey?: SourceKey;    // optional key for the brand logo
  score: number;           // 0–100 Signal Score
  tag?: SignalTag;
  timeAgo?: string;        // pre-formatted, e.g. "3h ago"
  takeaway?: string;      // one-line "why it matters"
  critical?: boolean;
  saved?: boolean;
}

/** The single Advisor recommendation of the day. */
export interface Recommendation {
  id: string;
  type: string;            // "skill" | "tool" | "paper" | … — drives the CTA label
  title: string;
  reason?: string;        // conversational "why I'm telling you this"
  conviction: number;      // 0–100
  ctaLabel: string;        // e.g. "Start Learning" (production maps type → label)
  destinationLabel?: string;
  saved?: boolean;
}

/** A step in the Advisor "today's plan" timeline. */
export interface PlanStep {
  id: string;
  time: string;            // e.g. "20 min"
  title: string;
  done?: boolean;
}

/** A "Continue Building" project. */
export interface Project {
  id: string;
  title: string;
  yesterday?: string;
  today?: string;
  tomorrow?: string;
  streakDays?: number;
  progress?: number;       // 0–100
}

export interface TrendingTerm {
  rank: number;
  term: string;
  signals: string;         // pre-formatted count, e.g. "1,240"
  momentum: string;        // e.g. "340%"
  rising: boolean;
}

export interface Collection {
  id: string;
  title: string;
  subtitle?: string;
  stat: string;            // e.g. "128"
  statLabel?: string;      // e.g. "signals this week"
  sparkline?: number[];    // small series for the mini chart
}

export interface SourceSummary {
  key: SourceKey;
  name: string;
  count: string;           // pre-formatted, e.g. "312"
}

/** A learned-topic strength row on the Settings / AI-identity screen. */
export interface LearnedTopic {
  topic: string;
  strength: "Strong" | "Growing" | "Emerging";
  fraction: number;        // 0–1 for the bar
}

export interface UserProfile {
  name: string;
  role?: string;
  level?: string;
  initials?: string;
  confidence?: number;     // 0–100 "how well Signal knows you"
}

export type SectionKey = "home" | "search" | "advisor" | "saved" | "settings";
