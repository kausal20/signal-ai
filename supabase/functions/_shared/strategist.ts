// V4 CAP 7 — Personal AI Strategist. Pure compute over cached reasoning + the
// learned user model. Adds priority / effort / risk / ROI and a recommendation
// reason that references the user's ACTUAL interests, concepts, and behaviour.
// No LLM calls.

import type { FinalCard, LearnedProfile } from "./learning.ts";
import type { StoredStory } from "./intelligence_engine.ts";
import type { StoryIntelligence } from "./intelligence_v2.ts";

export interface StrategistContext {
  vectorRelevance: number;       // 0..1 cosine(user, story)
  collaborativeRelevance: number; // 0..1 cosine(cluster, story)
  globalMultiplier: number;       // ~0.85..1.2
  matchedConcepts: string[];      // user concepts present in this story
  clusterId?: number | null;
}

export function applyStrategist(
  card: FinalCard, story: StoredStory, intel: StoryIntelligence,
  profile: LearnedProfile, ctx: StrategistContext,
): FinalCard {
  // ROI from cached intelligence (computed once at reason time).
  card.roi = intel.roi;
  card.verification = intel.verification;

  // Priority = personalized score band, lifted by proven global value.
  const adj = card.signal_score * ctx.globalMultiplier;
  card.priority = adj >= 82 ? "High" : adj >= 68 ? "Medium" : "Low";

  // Effort from ROI difficulty (fallback to impact difficulty).
  const diff = intel.roi?.difficulty ?? intel.impact?.difficulty ?? "Medium";
  card.effort = diff;

  // Risk from verification confidence + caveats.
  const vc = intel.verification?.confidence ?? story.confidence_score ?? 60;
  const caveats = intel.verification?.caveats?.length ?? 0;
  card.risk = vc >= 78 && caveats === 0 ? "Low" : vc >= 60 ? "Medium" : "High";

  card.recommendation_reason = buildReason(profile, ctx, card);
  return card;
}

function buildReason(profile: LearnedProfile, ctx: StrategistContext, card: FinalCard): string {
  const bits: string[] = [];

  if (ctx.matchedConcepts.length > 0) {
    bits.push(`it connects to ${ctx.matchedConcepts.slice(0, 3).join(", ")} — topics you keep engaging with`);
  } else if (ctx.vectorRelevance >= 0.55) {
    bits.push("it is semantically close to what you read most");
  }

  if (profile.inferred_role) bits.push(`it fits your profile as a ${profile.inferred_role}`);

  if (ctx.collaborativeRelevance >= 0.5) {
    bits.push("builders with similar taste are engaging with it");
  }

  if (ctx.globalMultiplier >= 1.08) bits.push("it has a strong track record of driving real outcomes");
  else if (ctx.globalMultiplier <= 0.92) bits.push("though similar items have underperformed, so treat it as lower priority");

  if (bits.length === 0) {
    return `Recommended because it cleared Signal's quality bar and matches your ${profile.persona} focus.`;
  }
  const head = card.priority === "High" ? "Top pick for you" : card.priority === "Medium" ? "Worth your time" : "On your radar";
  return `${head} because ${bits.slice(0, 3).join("; ")}.`;
}
