export type FeedTag = "tool" | "news" | "prompt" | "use-case";
export type FeedSource = "github" | "reddit" | "producthunt" | "arxiv" | "blog";
export type FeedCategory = "coding" | "business" | "design" | "automation" | "models";
export type FeedImpact = "critical" | "major" | "useful";

export interface FeedItem {
  id: string;
  title: string;
  summary: string;
  whyItMatters: string;
  url: string;
  tag: FeedTag;
  source: FeedSource;
  category: FeedCategory;
  score: number; // 0-100 composite signal score
  engagement: number; // raw stars/upvotes
  timestamp: string; // ISO
  underrated?: boolean;
  growth?: string; // e.g. "+340% wk"
  whoFor?: string;
  vibeFriendly?: boolean;
  usefulness?: number;
  impact?: FeedImpact;
  // V4.1 personalization overlay (populated by usePersonalizedFeed from the
  // `personalize` edge function; absent for new users → graceful fallback).
  intel?: PersonalIntel;
}

export interface PersonalOpportunity {
  type: string; title: string; explanation: string;
  confidence: string; difficulty: string; potential_impact: string; time_horizon: string;
}

export interface PersonalIntel {
  personalizedTakeaway?: string;
  opportunity?: PersonalOpportunity | null;
  action?: string;
  roi?: {
    time_saved?: string; money_saved?: string; potential_revenue?: string;
    implementation_cost?: string; payback_period?: string; difficulty?: string;
    confidence?: number; assumptions?: string[];
  };
  priority?: "High" | "Medium" | "Low";
  effort?: "Low" | "Medium" | "High";
  risk?: "Low" | "Medium" | "High";
  confidence?: string;
  signalScore?: number;
  recommendationReason?: string;
  whyPicked?: string[];
  trend?: { name?: string; direction?: string; evidence?: string; prediction?: string };
  persona?: string;
}

// Live data only: feed content is served from Supabase via useLiveFeed().
// The former static FEED mock array was removed (legacy/placeholder data).

export const CATEGORIES: { id: FeedCategory; label: string }[] = [
  { id: "coding", label: "Coding" },
  { id: "business", label: "Business" },
  { id: "design", label: "Design" },
  { id: "automation", label: "Automation" },
  { id: "models", label: "Models" },
];

export const TAGS: { id: FeedTag; label: string }[] = [
  { id: "news", label: "News" },
  { id: "tool", label: "Tools" },
  { id: "prompt", label: "Prompts" },
  { id: "use-case", label: "Use Cases" },
];
