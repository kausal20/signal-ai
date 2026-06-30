// Stage 7: Intelligence analysis — all scoring functions.

import { clampScore } from "./text.ts";
import {
  MAJOR_CAPABILITY_RX, BUSINESS_RX, BUILDER_RX, RESEARCH_RX,
  MARKETING_RX, MINOR_UPDATE_RX, LOW_VALUE_LAUNCH_RX,
  PRIORITY_ENTITY_RX, PROMPT_PACK_RX, SMALL_WRAPPER_RX,
  BENCHMARK_ONLY_RX, GITHUB_STARS_RX, INFRA_ONLY_RX,
  SMALL_FUNDING_RX, ACADEMIC_NO_USE_RX,
} from "./regex.ts";
import type { StoryCluster, Impact, ContentCategory } from "./types.ts";

// Source-trust tier (higher trust => higher confidence). Frontier labs and
// research sources are trusted; marketing/community blogs are not.
const TRUST_BY_KIND: Record<string, number> = {
  official: 10,   // OpenAI, Anthropic, DeepMind, Meta, Microsoft, HF...
  research: 7,    // arXiv and labs
  startup: 4,     // YC / funding signals
  launch: 2,      // Product Hunt / GitHub launches
  community: 1,   // Reddit / HN chatter
};

export function calculateConfidence(cluster: StoryCluster, modelConfidence: number): number {
  const duplicateBoost = Math.min(14, (cluster.members.length - 1) * 5);
  const officialBoost = cluster.members.some((m) => m.sourceKind === "official") ? 8 : 0;
  const communityBoost = cluster.members.some((m) => m.sourceKind === "community") ? 3 : 0;
  const sourceWeightBoost = Math.max(0, Math.round((cluster.primary.sourceWeight - 1) * 10));
  // Trust uses the most-trusted source in the cluster, not just the primary.
  const bestTrust = Math.max(0, ...cluster.members.map((m) => TRUST_BY_KIND[m.sourceKind] ?? 0));
  return clampScore(modelConfidence + duplicateBoost + officialBoost + communityBoost + sourceWeightBoost + bestTrust);
}

export function corroborationScore(cluster: StoryCluster): number {
  const distinctSources = new Set(cluster.members.map((m) => m.source)).size;
  const distinctKinds = new Set(cluster.members.map((m) => m.sourceKind)).size;
  const officialBoost = cluster.members.some((m) => m.sourceKind === "official") ? 18 : 0;
  return clampScore(28 + (distinctSources - 1) * 22 + (distinctKinds - 1) * 8 + officialBoost);
}

export function opportunityScore(s: {
  novelty: number; business: number; builder: number; adoption: number; market: number;
}): number {
  return clampScore(
    s.business * 0.35 + s.builder * 0.25 + s.adoption * 0.20 + s.novelty * 0.12 + s.market * 0.08,
  );
}

export function calculateFinalScore(
  cluster: StoryCluster,
  s: { novelty: number; business: number; builder: number; adoption: number; market: number; confidence: number; leverage: number },
): number {
  // Leverage is the spine. The 0-100 weighted axes shape only the rest.
  const leverageBase = s.leverage * 9;
  const weighted =
    s.business * 0.06 +
    s.builder * 0.06 +
    s.novelty * 0.04 +
    s.market * 0.04 +
    s.adoption * 0.02;
  const confidenceBoost = Math.max(0, s.confidence - 65) * 0.10;
  const sourceTrust = (cluster.primary.sourceWeight - 1) * 9;
  const corroboration = Math.min(10, (cluster.members.length - 1) * 3);
  const engagement = Math.min(3, Math.log10(Math.max(10, cluster.primary.engagement)) - 1);
  const blob = `${cluster.primary.rawTitle} ${cluster.primary.rawText}`;
  let penalty = 0;
  if (MARKETING_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) penalty += 10;
  if (MINOR_UPDATE_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) penalty += 16;
  if (LOW_VALUE_LAUNCH_RX.test(blob)) penalty += 14;
  if (cluster.primary.source === "github" && cluster.primary.engagement < 600) penalty += 6;
  let boost = 0;
  if (MAJOR_CAPABILITY_RX.test(blob) && cluster.primary.sourceKind === "official") boost += 6;
  if (cluster.members.length >= 3 && cluster.members.some((m) => m.sourceKind === "official")) boost += 4;
  if (PRIORITY_ENTITY_RX.test(blob)) boost += 6;
  return clampScore(leverageBase + weighted + confidenceBoost + sourceTrust + corroboration + engagement + boost - penalty);
}

export function impactByLeverage(leverage: number, score: number): Impact {
  if (leverage >= 9 || score >= 90) return "critical";
  if (leverage >= 8 || score >= 82) return "major";
  return "useful";
}

export function passesFinalQualityGate(args: {
  score: number;
  confidence: number;
  category: ContentCategory;
  impact: Impact;
  textBlob: string;
  cluster: StoryCluster;
  leverage: number;
}): boolean {
  const { score, confidence, category, textBlob, cluster, leverage } = args;
  if (leverage < 6) return false;
  if (confidence < 62) return false;
  if (leverage >= 9 && score < 82) return false;
  if (leverage === 8 && score < 78) return false;
  if (leverage === 7 && score < 72) return false;
  if (leverage === 6 && score < 68) return false;
  if (MARKETING_RX.test(textBlob) && !MAJOR_CAPABILITY_RX.test(textBlob)) return false;
  if (/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/i.test(textBlob.trim())) return false;
  if (category === "Research Breakthrough" && score < 80) return false;
  if ((category === "Founder Opportunity" || category === "Market Shift") && !BUSINESS_RX.test(textBlob)) return false;
  if ((category === "Tool of the Day" || category === "Workflow of the Day" || category === "Underrated Tool") && !BUILDER_RX.test(`${textBlob} ${cluster.primary.rawText}`)) return false;
  return true;
}

// Content-level auto-reject (drops below-$25M funding, benchmark-only, etc.)
export function autoRejectByContent(cluster: StoryCluster, leverage: number): boolean {
  const p = cluster.primary;
  const blob = `${p.rawTitle} ${p.rawText}`;
  if (PROMPT_PACK_RX.test(blob)) return true;
  if (SMALL_WRAPPER_RX.test(blob)) return true;
  if (BENCHMARK_ONLY_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob) && leverage < 9) return true;
  if (GITHUB_STARS_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) return true;
  if (INFRA_ONLY_RX.test(blob) && !MAJOR_CAPABILITY_RX.test(blob)) return true;
  if (p.source === "arxiv" && ACADEMIC_NO_USE_RX.test(blob)) return true;
  const m = blob.match(SMALL_FUNDING_RX);
  if (m && /\b(raises|raised|funding|series|seed)\b/i.test(blob)) {
    const amount = parseFloat(m[1]);
    if (amount < 25 && !PRIORITY_ENTITY_RX.test(blob)) return true;
  }
  return false;
}

// Heuristic leverage for the deterministic fallback editor.
export function estimateLeverage(cluster: StoryCluster, blob: string): number {
  const p = cluster.primary;
  let yes = 0;
  const major = MAJOR_CAPABILITY_RX.test(blob);
  const priority = PRIORITY_ENTITY_RX.test(blob);
  const business = BUSINESS_RX.test(blob);
  const builder = BUILDER_RX.test(blob);
  const research = RESEARCH_RX.test(blob);
  const corroborated = cluster.members.length >= 2;
  const official = p.sourceKind === "official";
  if (major && priority) yes++;
  if (priority || major) yes++;
  if (business || major || priority) yes++;
  if (builder || /agent|automation|workflow/i.test(blob)) yes++;
  if (builder && p.sourceKind === "launch") yes++;
  if (builder || /\b(automation|workflow|api|sdk)\b/i.test(blob)) yes++;
  if (business || priority) yes++;
  if (major || research || builder) yes++;
  if (major || (priority && (builder || business))) yes++;
  if (major || (corroborated && official)) yes++;
  return Math.min(10, yes);
}
