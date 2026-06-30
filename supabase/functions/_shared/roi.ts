// V4 CAP 5 — ROI Engine. Deterministic, range-based value estimation derived
// from the (LLM-reasoned) intelligence + editorial scores. Never invents exact
// figures; always states assumptions. Computed once per story, cached in intel.

import type { StoryIntelligence, ROIEstimate, Conf } from "./intelligence_v2.ts";
import type { StoredStory } from "./intelligence_engine.ts";

function lvl(c: Conf | undefined): number { return c === "High" ? 3 : c === "Medium" ? 2 : 1; }

export function estimateROI(intel: StoryIntelligence, story: StoredStory): ROIEstimate {
  const imp = intel.impact ?? ({} as any);
  const builder = story.builder_value_score ?? 0;
  const business = story.business_impact_score ?? 0;
  const auto = lvl(imp.automation_potential);
  const sig = intel.understanding?.significance ?? 5;
  const verifConf = intel.verification?.confidence ?? story.confidence_score ?? 60;

  // Time saved scales with builder/automation value.
  const timeTier = Math.max(builder / 33, auto);   // ~0..3
  const time_saved = timeTier >= 2.5 ? "5-8 hours/week"
    : timeTier >= 1.5 ? "2-5 hours/week" : "1-2 hours/week";

  // Money saved: rough labour-cost proxy (NOT a promise) from hours.
  const money_saved = timeTier >= 2.5 ? "$800-$2,000/month"
    : timeTier >= 1.5 ? "$300-$900/month" : "$80-$300/month";

  // Revenue potential only meaningful for business-heavy stories.
  const potential_revenue = business >= 70 ? "$2,000-$10,000/month (new line)"
    : business >= 45 ? "$500-$3,000/month" : "indirect / hard to attribute";

  const diff = (imp.difficulty as Conf) ?? (builder >= 60 ? "Low" : "Medium");
  const implementation_cost = diff === "Low" ? "a few hours of setup"
    : diff === "Medium" ? "1-2 days of integration" : "1-2 weeks of focused work";
  const payback_period = diff === "Low" ? "< 2 weeks" : diff === "Medium" ? "1-2 months" : "1 quarter+";

  // Confidence blends verification + corroboration + significance.
  const confidence = Math.round(Math.max(0, Math.min(100,
    verifConf * 0.6 + sig * 3 + ((story.source_count ?? 1) >= 3 ? 8 : 0))));

  const assumptions = [
    "Assumes a builder-rate of roughly $40-$80/hour for time→money conversion.",
    `Assumes you actually adopt the workflow (difficulty: ${diff}).`,
    business < 45 ? "Revenue impact is indirect; treat money figures as upper-bound." : "Revenue assumes one realistic use-case lands.",
  ];

  return {
    time_saved, money_saved, potential_revenue, implementation_cost, payback_period,
    difficulty: diff, confidence, assumptions,
  };
}
