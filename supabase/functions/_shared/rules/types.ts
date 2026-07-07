// Phase 4 · Module 8 — Rule Engine types.
//
// Every intelligence decision comes from an independent, pure, deterministic
// rule. Rules NEVER mutate the ranking score or Module 1/2 outputs — they emit
// EFFECT DELTAS into a separate merged-intelligence layer (additive). Adding a
// rule = add an entry to the registry; the engine never changes.

export type RulePriority = "Critical" | "High" | "Medium" | "Low" | "Informational";

export const PRIORITY_WEIGHT: Record<RulePriority, number> = {
  Critical: 5, High: 4, Medium: 3, Low: 2, Informational: 1,
};

/** Suggested deltas / additions a rule contributes (never absolute overwrites). */
export interface RuleEffects {
  opportunity_score?: number;   // delta (points)
  developer_value?: number;     // delta
  founder_value?: number;       // delta
  investor_value?: number;      // delta
  learning_value?: number;      // delta
  urgency?: number;             // 0..100 (max wins in merge)
  time_sensitivity?: number;    // 0..100 (max wins)
  trend_strength?: number;      // delta
  tags?: string[];              // union
  categories?: string[];        // union
  recommendations?: string[];   // union
  confidence?: number;          // 0..100 (rule's own confidence)
}

/** Full result — never a bare boolean. */
export interface RuleResult {
  rule_id: string;
  rule_name: string;
  matched: boolean;
  confidence: number;           // 0..100
  priority: RulePriority;
  reason: string;               // human, explainable
  effects: RuleEffects;
  metadata: Record<string, unknown>;
}

/** Read-only story context handed to every rule. */
export interface RuleContext {
  title: string;
  summary: string;
  text?: string;
  tag?: string;
  content_category?: string;
  trend_entities?: string[];
  // Module 1/2 outputs (read-only — rules never mutate these):
  developer_value?: number;
  founder_value?: number;
  investor_value?: number;
  learning_value?: number;
  source_quality?: { tier?: string; official?: boolean; quality_score?: number } | null;
  /** Lowercased "title summary text" — precomputed once by the engine. */
  blob: string;
}

/** A rule is pure: same context → same result. Stateless. */
export interface Rule {
  id: string;
  name: string;
  priority: RulePriority;
  evaluate(ctx: RuleContext): RuleResult;
}

/** Merged intelligence produced by the engine from all matched rules. */
export interface MergedIntelligence {
  matched_rules: string[];              // rule_ids
  rule_count: number;
  opportunity_boost: number;            // summed opportunity deltas (clamped)
  developer_value: number;              // base + Σ deltas (clamped 0..100)
  founder_value: number;
  investor_value: number;
  learning_value: number;
  urgency: number;                      // 0..100
  time_sensitivity: number;             // 0..100
  trend_strength: number;               // delta sum (clamped)
  tags: string[];
  categories: string[];
  recommendations: string[];
  confidence: number;                   // priority-weighted avg of matched rules
  reasoning: string[];                  // one line per matched rule
  conflicts: string[];                  // notes when rules disagree on category
}
