// Shared types for the Signal intelligence pipeline.

export type SourceKind = "official" | "research" | "community" | "launch" | "startup";
export type SourceTier = "fast" | "medium" | "slow";
export type PublicSource = "github" | "reddit" | "producthunt" | "arxiv" | "blog";
export type FeedTag = "tool" | "news" | "prompt" | "use-case";
export type FeedCategory = "coding" | "business" | "design" | "automation" | "models";
export type Impact = "critical" | "major" | "useful";
export type ContentCategory =
  | "Must Know"
  | "Tool of the Day"
  | "Workflow of the Day"
  | "Founder Opportunity"
  | "Underrated Tool"
  | "Market Shift"
  | "Research Breakthrough";

export type ActionLabel =
  | "try-tool" | "watch-company" | "learn-workflow" | "copy-prompt" | "monitor-trend" | "none";

export interface SourceConnector {
  source: string;
  source_label: string;
  source_kind: SourceKind;
  tier: SourceTier;
  source_weight: number;
  rss_url?: string | null;
  news_query?: string | null;
  trust_score: number;
  enabled: boolean;
}

export interface RawItem {
  id: string;
  rawTitle: string;
  rawText: string;
  url: string;
  canonicalUrl: string;
  source: string;
  sourceLabel: string;
  sourceKind: SourceKind;
  sourceWeight: number;
  engagement: number;
  published_at: string;
  hoursOld: number;
  needsTranslation?: boolean;
  rejectionReason?: string;
}

export interface StoryCluster {
  id: string;
  primary: RawItem;
  members: RawItem[];
  tokens: Set<string>;
  entityKey: string;
}

export interface OpportunityFields {
  opportunity: string;
  action: string;
  risk: string;
  who_benefits: string;
  who_should_ignore: string;
  expected_impact: string;
  time_horizon: string;
}

export interface SignalItem extends OpportunityFields {
  id: string;
  title: string;
  summary: string;
  why_it_matters: string;
  who_for: string;
  what_happened: string;
  url: string;
  tag: FeedTag;
  source: PublicSource;
  source_label: string;
  source_urls: Array<{ label: string; url: string; source: string }>;
  category: FeedCategory;
  content_category: ContentCategory;
  score: number;
  usefulness: number;
  vibe_friendly: boolean;
  humanized: boolean;
  engagement: number;
  underrated?: boolean;
  growth?: string | null;
  published_at: string;
  impact: Impact;
  novelty_score: number;
  business_impact_score: number;
  builder_value_score: number;
  adoption_potential_score: number;
  market_impact_score: number;
  confidence_score: number;
  opportunity_score: number;
  corroboration_score: number;
  source_count: number;
  leverage_score: number;
  trend_score: number;
  momentum_score: number;
  action_label: ActionLabel;
  trend_entities: string[];
  ranking_reason: string;
  // Signal Intelligence Engine v2 — story-side intelligence packed once at
  // editorial time. Persisted as feed_items.signal_v2 (jsonb).
  signal_v2?: unknown;
  why_picked?: string;
  audit?: EditorialAudit;
}

export interface EditorialAudit {
  cluster_id: string;
  leverage_score: number;
  q_founder: boolean;
  q_builder: boolean;
  q_agency: boolean;
  q_vibe_coder: boolean;
  q_saves_time: boolean;
  q_creates_business: boolean;
  q_changes_workflow: boolean;
  q_remember_tomorrow: boolean;
  q_recommend: boolean;
  one_sentence: boolean;
  teen_understandable: boolean;
  action_required: ActionLabel;
  rejection_reason?: string;
  raw_payload?: unknown;
}

export interface TrendEntity {
  id: string;
  label: string;
  kind: "company" | "product" | "model" | "framework" | "topic" | "startup";
  rolling_7d: number;
  rolling_14d: number;
  momentum: number;
  trend_state: "rising" | "flat" | "declining" | "dormant";
}
