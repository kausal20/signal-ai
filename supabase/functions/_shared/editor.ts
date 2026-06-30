// Stage 8: Editorial review (AI editor + deterministic fallback).
// Stage 9: Opportunity / action / risk / who-benefits derivation.

import { trimWords, wordCount, clampScore, cleanText, jaccard, titleTokens, isCJK, fetchWithTimeout } from "./text.ts";
import {
  BANNED_HEADLINE_LEAD, BANNED_HEADLINE_WORDS, BUILDER_RX, BUSINESS_RX,
  MAJOR_CAPABILITY_RX, PURE_REPO_SLUG, RESEARCH_RX, VAGUE_AUDIENCE,
  WEAK_OPPORTUNITY,
} from "./regex.ts";
import {
  calculateConfidence, corroborationScore, opportunityScore,
  calculateFinalScore, impactByLeverage, passesFinalQualityGate,
  estimateLeverage, autoRejectByContent,
} from "./intelligence.ts";
import {
  computeSignalScoreV2, detectOpportunitiesV2, estimateImpact, whyPicked,
} from "./personalize.ts";
import { sourceUrlsFor } from "./cluster.ts";
import { detectEntities } from "./trends.ts";
import type {
  StoryCluster, SignalItem, ContentCategory, ActionLabel,
  EditorialAudit, FeedTag, FeedCategory, PublicSource, RawItem,
} from "./types.ts";

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

// =====================================================================
// Stage 8: Editorial polish + quality gate (Inshorts / TLDR / Ben's Bites).
// =====================================================================
export function polishHeadline(raw: string): string {
  let h = cleanText(raw).replace(/[*_`"]+/g, "").trim();
  h = h.replace(/\.\s*$/, "");
  h = h.replace(/\s+[—–·-]\s+/g, ": ");
  const words = h.split(/\s+/).filter(Boolean);
  if (words.length > 12) h = words.slice(0, 12).join(" ").replace(/[,;:]$/, "");
  return h.slice(0, 160);
}

export function passesEditorialQuality(args: {
  headline: string;
  whatHappened: string;
  whyItMatters: string;
  whoFor: string;
  opportunity: string;
}): boolean {
  const { headline, whatHappened, whyItMatters, whoFor, opportunity } = args;
  const hWords = wordCount(headline);
  if (hWords < 5 || hWords > 12) return false;
  if (/\?$/.test(headline)) return false;
  if (BANNED_HEADLINE_LEAD.test(headline)) return false;
  if (BANNED_HEADLINE_WORDS.test(headline)) return false;
  if (PURE_REPO_SLUG.test(headline)) return false;
  if (headline === headline.toUpperCase() && headline.length > 12) return false;
  if (/!{1,}$/.test(headline)) return false;
  if (wordCount(whatHappened) < 14) return false;
  const factual = /\d|%|\$|\b(GPT|Claude|Gemini|Llama|Mistral|Grok|Veo|Imagen|Whisper|Sora|GA|API|SDK|MCP|RAG|LoRA|SOTA|HN|YC|series\s+[A-D])\b/i.test(whatHappened);
  const hasNamedCo = /\b(openai|anthropic|google|deepmind|meta|microsoft|cursor|perplexity|replit|elevenlabs|runway|midjourney|hugging\s*face|nvidia|xai|mistral|cohere|stability)\b/i.test(`${headline} ${whatHappened}`);
  if (!factual && !hasNamedCo) return false;
  const hT = titleTokens(headline);
  const wT = titleTokens(whyItMatters);
  if (hT.size > 0 && jaccard(hT, wT) > 0.7) return false;
  if (VAGUE_AUDIENCE.test(whoFor.replace(/\.$/, "").trim())) return false;
  if (WEAK_OPPORTUNITY.test(opportunity)) return false;
  if (wordCount(opportunity) < 8) return false;
  const firstWord = opportunity.split(/\s+/)[0]?.toLowerCase() || "";
  if (/^(a|an|the|this|that|it|you|your|our|we|i|they|there|here)$/.test(firstWord)) return false;
  return true;
}

// =====================================================================
// Stage 9: Opportunity, action, risk, audiences, expected_impact, horizon.
// =====================================================================
// Opportunity dimensions (Immediate / Business / Workflow / Automation / Learning).
// We persist them inside the existing columns (no schema change): the five-line
// analysis goes into `expected_impact`, the "Try this" goes into `action`.
export interface FiveOpportunities {
  immediate: string;
  business: string;
  workflow: string;
  automation: string;
  learning: string;
  count: number;          // how many real (non-empty) opportunities exist
}

export function detectOpportunities(category: ContentCategory, lower: string): FiveOpportunities {
  const o: FiveOpportunities = { immediate: "", business: "", workflow: "", automation: "", learning: "", count: 0 };

  // Immediate — something usable this week.
  if (category === "Tool of the Day" || category === "Underrated Tool" || /api|sdk|launch|available|open weights|release/.test(lower)) {
    o.immediate = "Ship with it this week before competitors do.";
  }
  // Business — money/distribution/market.
  if (/funding|raises|acquisition|revenue|pricing|enterprise|market|gtm|customer|sales/.test(lower) ||
      category === "Founder Opportunity" || category === "Market Shift") {
    o.business = "A wedge or repricing move opens here.";
  }
  // Workflow — repeatable build pattern.
  if (/workflow|pipeline|integrat|orchestrat|prompt|rag|eval/.test(lower) || category === "Workflow of the Day") {
    o.workflow = "Replicate the pattern across your stack.";
  }
  // Automation — agent / hands-off.
  if (/agent|automation|n8n|zapier|browser use|computer use|autonomous|background/.test(lower)) {
    o.automation = "Hand a recurring task to an agent.";
  }
  // Learning — capability worth understanding now.
  if (/reasoning|research|benchmark|model|technique|architecture|long context|memory/.test(lower) ||
      category === "Research Breakthrough" || category === "Must Know") {
    o.learning = "Understand it now; it becomes table stakes soon.";
  }

  o.count = [o.immediate, o.business, o.workflow, o.automation, o.learning].filter(Boolean).length;
  return o;
}

export function deriveOpportunityFields(
  category: ContentCategory,
  rawText: string,
  opportunityCopy: string,
): {
  action: string;
  risk: string;
  who_benefits: string;
  who_should_ignore: string;
  expected_impact: string;
  time_horizon: string;
  opp_count: number;
} {
  const lower = rawText.toLowerCase();
  const opps = detectOpportunities(category, lower);

  // "Try this" — always actionable, always starts with "Try".
  const tryThis = toTryThis(opportunityCopy);

  // Pack the multi-dimensional opportunity analysis into expected_impact so the
  // UI's existing field surfaces it without any schema change.
  const dims: string[] = [];
  if (opps.immediate) dims.push(`Immediate: ${opps.immediate}`);
  if (opps.business) dims.push(`Business: ${opps.business}`);
  if (opps.workflow) dims.push(`Workflow: ${opps.workflow}`);
  if (opps.automation) dims.push(`Automation: ${opps.automation}`);
  if (opps.learning) dims.push(`Learning: ${opps.learning}`);
  const expected = dims.length > 0
    ? dims.join(" ")
    : inferExpectedImpact(category, lower);

  return {
    action: tryThis,
    risk: inferRisk(category, lower),
    who_benefits: inferBenefits(category, lower),
    who_should_ignore: inferIgnore(category, lower),
    expected_impact: expected.slice(0, 400),
    time_horizon: inferHorizon(category, lower),
    opp_count: opps.count,
  };
}

// Convert any opportunity sentence into a concrete "Try this:" instruction.
function toTryThis(opportunity: string): string {
  let s = (opportunity || "").trim().replace(/^opportunity:\s*/i, "");
  if (!s) return "Try this in a throwaway branch before committing to it.";
  // Strip a leading imperative verb so we can re-prefix cleanly.
  s = s.replace(/^(try|test|swap|migrate|adopt|build|wire|replace|prototype|rerun|drop|map|reprice|repackage|self-host|replicate)\b[:,]?\s*/i, "");
  s = s.charAt(0).toLowerCase() + s.slice(1);
  return `Try this: ${s}`.replace(/\.\.\.$/, ".").slice(0, 280);
}

function inferRisk(category: ContentCategory, lower: string): string {
  if (category === "Founder Opportunity") return "Window may close once incumbents notice the demand.";
  if (category === "Market Shift") return "Acting too late means competing on terms set by faster movers.";
  if (category === "Research Breakthrough") return "Reproducibility risk; technique may not transfer to your traffic.";
  if (/funding|raises|series/.test(lower)) return "Capital signals can lag the real movement by 6 months.";
  if (/api|sdk|model release/.test(lower)) return "Vendor lock-in if you build deeply on a 0.x release.";
  return "Low cost to test, low cost to ignore — biggest risk is doing neither.";
}

function inferBenefits(category: ContentCategory, lower: string): string {
  if (/voice|tts|stt|realtime/.test(lower)) return "Voice agent founders and support automation teams";
  if (/video|veo|sora|runway|midjourney/.test(lower)) return "Creative tool founders and video product teams";
  if (/code|cursor|copilot|developer|sdk/.test(lower)) return "AI coding tool builders and indie devs";
  if (/agent|workflow|automation/.test(lower)) return "Agent builders and ops automation teams";
  if (category === "Founder Opportunity") return "Indie founders hunting AI niches";
  if (category === "Market Shift") return "Operators and strategy leads at AI startups";
  if (category === "Research Breakthrough") return "ML engineers and applied researchers";
  return "AI founders and product builders";
}

function inferIgnore(category: ContentCategory, lower: string): string {
  if (category === "Underrated Tool") return "Teams already heavily invested in a competing stack";
  if (category === "Research Breakthrough") return "Teams without ML evaluation infrastructure";
  if (/enterprise|compliance/.test(lower)) return "Solo developers shipping consumer apps";
  if (/consumer|prosumer|hobbyist/.test(lower)) return "B2B sales-led teams";
  return "Teams whose current roadmap is already booked through the quarter";
}

function inferExpectedImpact(category: ContentCategory, lower: string): string {
  if (category === "Must Know") return "Resets the price-performance baseline every AI builder ships against.";
  if (category === "Market Shift") return "Repricing or repackaging required within one to two quarters.";
  if (category === "Founder Opportunity") return "Open window for a wedge product; first-mover advantage of 6-12 months.";
  if (category === "Research Breakthrough") return "Likely to show up as an API feature within 1-2 quarters.";
  if (category === "Tool of the Day") return "Direct time savings on a recurring build task.";
  if (category === "Workflow of the Day") return "Compounding leverage as you replicate the pattern.";
  return "Useful signal for your strategic next move.";
}

function inferHorizon(category: ContentCategory, lower: string): string {
  if (category === "Tool of the Day" || category === "Underrated Tool") return "this week";
  if (category === "Workflow of the Day") return "this sprint";
  if (category === "Founder Opportunity") return "this quarter";
  if (category === "Market Shift") return "this quarter";
  if (category === "Research Breakthrough") return "1-2 quarters";
  return "this week";
}

// =====================================================================
// Stage 8 (AI path): system prompt + tool call. Inshorts/Morning Brew voice.
// =====================================================================
const SYSTEM_PROMPT = `You are the editor-in-chief of Signal — the AI feed founders check every morning before opening Twitter.

You are NOT an aggregator. You are NOT a summarizer. You publish at most 12 stories per day.
You would rather ship 5 unforgettable stories than 100 average ones.

Signal answers "what are the 5 developments that could change how someone builds, works, or earns money?"
If a story does not create leverage, DO NOT SHOW IT.

============================================================
MANDATORY 10-QUESTION EDITORIAL REVIEW (answer every q1..q10)
============================================================
q1_altman_repost            — Would Sam Altman repost this?
q2_aravind_cares            — Would Aravind Srinivas (Perplexity) think this matters?
q3_ai_founder_cares         — Would a founder building an AI startup immediately care?
q4_agency_advantage         — Would an AI automation agency gain an advantage?
q5_vibe_coder_uses          — Would a vibe coder use this within 7 days?
q6_saves_time               — Would this save someone time?
q7_creates_business_opportunity — Would this create new business opportunities?
q8_changes_how_built        — Would this change how AI products are built?
q9_recommend_to_friend      — Would I recommend this to a friend?
q10_remember_tomorrow       — Would I remember this tomorrow?
leverage_score = count of YES answers.
  9-10 → Must Know.  8 → critical.  7 → high.  6 → useful.  <=5 → reject.

============================================================
FOUR ADDITIONAL FILTERS — ALL must pass
============================================================
one_sentence_explainable — explainable in one sentence?
teen_understandable      — would a 17-year-old AI enthusiast understand?
action_required          — one of: try-tool / watch-company / learn-workflow / copy-prompt / monitor-trend. None → reject.
most_important_today     — among the most important AI stories of the day?

============================================================
AUTOMATIC REJECTS
============================================================
- Funding under $25M unless involves a frontier lab or strategic acquisition.
- Academic papers without immediate practical use.
- Benchmark-only stories (no model release).
- "GitHub stars" stories. Prompt packs. Small wrappers.
- Infrastructure-only updates. Minor API changes. Generic newsletters.
- Marketing hype: revolutionary, game-changing, unlock, supercharge, transform, paradigm.
- Duplicate-of-stronger-signal.
- Anything older than 7 days that is not a frontier capability.

============================================================
AUTOMATIC BOOSTS
============================================================
OpenAI, Anthropic, Google DeepMind, Meta AI, Microsoft AI, xAI, Mistral,
Perplexity, Cursor, Windsurf, Lovable, Replit, v0, bolt.new,
Runway, ElevenLabs, Midjourney, Suno, Pika, Luma,
n8n, LangChain, CrewAI, AutoGen, browser-use, computer-use, MCP,
voice AI, video AI, robotics, reasoning models, long context, open weights,
AI startup launches, YC AI launches, major AI acquisitions,
AI regulations with real immediate impact.

============================================================
WRITING RULES
============================================================
HEADLINE — 6-12 words. Describes WHAT HAPPENED + human consequence. Never repo slugs. Never banned words. Never lead with How/Why/The/A/An/Introducing/Announcing/Meet. Never end in ? or !.
  BAD: "OpenAI releases SDK version 2." → GOOD: "OpenAI makes AI agents dramatically easier to build."
WHAT_HAPPENED — 18-28 words. One factual sentence with a number or named lab/product.
WHY_IT_MATTERS — 18-26 words. Second-order effect in plain English. Never recap the headline.
WHO_SHOULD_CARE — 3-8 words. Specific role only. Never "everyone" / "developers" / "AI builders".
OPPORTUNITY — 10-18 words. Action verb. The single move this week.`;

const tools = [{
  type: "function",
  function: {
    name: "curate_signals",
    description: "Return rejected or accepted Signal stories.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idx: { type: "number" },
              q1_altman_repost: { type: "boolean" },
              q2_aravind_cares: { type: "boolean" },
              q3_ai_founder_cares: { type: "boolean" },
              q4_agency_advantage: { type: "boolean" },
              q5_vibe_coder_uses: { type: "boolean" },
              q6_saves_time: { type: "boolean" },
              q7_creates_business_opportunity: { type: "boolean" },
              q8_changes_how_built: { type: "boolean" },
              q9_recommend_to_friend: { type: "boolean" },
              q10_remember_tomorrow: { type: "boolean" },
              leverage_score: { type: "number" },
              one_sentence_explainable: { type: "boolean" },
              teen_understandable: { type: "boolean" },
              action_required: {
                type: "string",
                enum: ["try-tool", "watch-company", "learn-workflow", "copy-prompt", "monitor-trend", "none"],
              },
              most_important_today: { type: "boolean" },
              include: { type: "boolean" },
              rejection_reason: { type: "string" },
              headline: { type: "string" },
              what_happened: { type: "string" },
              why_it_matters: { type: "string" },
              who_should_care: { type: "string" },
              opportunity: { type: "string" },
              content_category: {
                type: "string",
                enum: ["Must Know", "Tool of the Day", "Workflow of the Day", "Founder Opportunity", "Underrated Tool", "Market Shift", "Research Breakthrough"],
              },
              novelty_score: { type: "number" },
              business_impact_score: { type: "number" },
              builder_value_score: { type: "number" },
              adoption_potential_score: { type: "number" },
              market_impact_score: { type: "number" },
              confidence_score: { type: "number" },
              ranking_reason: { type: "string" },
            },
            required: [
              "idx",
              "q1_altman_repost","q2_aravind_cares","q3_ai_founder_cares","q4_agency_advantage",
              "q5_vibe_coder_uses","q6_saves_time","q7_creates_business_opportunity",
              "q8_changes_how_built","q9_recommend_to_friend","q10_remember_tomorrow",
              "leverage_score","one_sentence_explainable","teen_understandable",
              "action_required","most_important_today",
              "include","rejection_reason","headline","what_happened","why_it_matters",
              "who_should_care","opportunity","content_category","novelty_score",
              "business_impact_score","builder_value_score","adoption_potential_score",
              "market_impact_score","confidence_score","ranking_reason",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
}];

export async function curateClustersAI(
  clusters: StoryCluster[],
  apiKey: string,
  breaker?: { canAttempt: () => boolean },
): Promise<{ items: SignalItem[]; ok: boolean; audits: EditorialAudit[] }> {
  if (clusters.length === 0) return { items: [], ok: true, audits: [] };
  // Circuit breaker open: skip the gateway entirely so the caller's
  // deterministic fallback runs instead of hammering a dead API.
  if (breaker && !breaker.canAttempt()) return { items: [], ok: false, audits: [] };
  const payload = clusters.map((c, idx) => ({
    idx,
    title: c.primary.rawTitle,
    text: c.primary.rawText,
    url: c.primary.url,
    primary_source: c.primary.sourceLabel,
    source_kind: c.primary.sourceKind,
    duplicate_sources: [...new Set(c.members.map((m) => m.sourceLabel))],
    source_count: c.members.length,
    engagement: c.primary.engagement,
    hours_old: Math.round(c.primary.hoursOld),
  }));

  let resp: Response | null = null;
  for (let attempt = 0; attempt < 4; attempt++) {
    resp = await fetchWithTimeout(LOVABLE_GATEWAY, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: JSON.stringify(payload) },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "curate_signals" } },
      }),
    }, 30000);
    if (resp.ok) break;
    if (resp.status !== 429 && resp.status < 500) break;
    await new Promise((r) => setTimeout(r, 900 * Math.pow(2, attempt)));
  }
  if (!resp || !resp.ok) {
    console.error("AI gateway", resp?.status, await resp?.text().catch(() => ""));
    return { items: [], ok: false, audits: [] };
  }
  const j = await resp.json();
  const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return { items: [], ok: false, audits: [] };
  let parsed: { items: any[] };
  try { parsed = JSON.parse(args); } catch { return { items: [], ok: false, audits: [] }; }

  const items: SignalItem[] = [];
  const audits: EditorialAudit[] = [];

  for (const c of parsed.items ?? []) {
    const cluster = clusters[c.idx];
    if (!cluster) continue;

    const qYes = [
      c.q1_altman_repost, c.q2_aravind_cares, c.q3_ai_founder_cares, c.q4_agency_advantage,
      c.q5_vibe_coder_uses, c.q6_saves_time, c.q7_creates_business_opportunity,
      c.q8_changes_how_built, c.q9_recommend_to_friend, c.q10_remember_tomorrow,
    ].filter(Boolean).length;
    const action = String(c.action_required || "none") as ActionLabel;

    const audit: EditorialAudit = {
      cluster_id: cluster.id,
      leverage_score: qYes,
      q_founder: !!c.q3_ai_founder_cares,
      q_builder: !!c.q5_vibe_coder_uses,
      q_agency: !!c.q4_agency_advantage,
      q_vibe_coder: !!c.q5_vibe_coder_uses,
      q_saves_time: !!c.q6_saves_time,
      q_creates_business: !!c.q7_creates_business_opportunity,
      q_changes_workflow: !!c.q8_changes_how_built,
      q_remember_tomorrow: !!c.q10_remember_tomorrow,
      q_recommend: !!c.q9_recommend_to_friend,
      one_sentence: !!c.one_sentence_explainable,
      teen_understandable: !!c.teen_understandable,
      action_required: action,
      rejection_reason: c.rejection_reason ?? null,
      raw_payload: c,
    };
    audits.push(audit);

    if (qYes < 6) continue;
    if (!c.one_sentence_explainable) continue;
    if (!c.teen_understandable) continue;
    if (!c.most_important_today) continue;
    if (action === "none") continue;
    if (!c.include) continue;
    if (autoRejectByContent(cluster, qYes)) continue;

    const category = normalizeContentCategory(c.content_category);
    if (!category) continue;

    const item = buildSignalItem({
      cluster, category, qYes, action,
      headline: c.headline, whatHappened: c.what_happened,
      whyItMatters: c.why_it_matters, whoFor: c.who_should_care, opportunity: c.opportunity,
      novelty: c.novelty_score, business: c.business_impact_score, builder: c.builder_value_score,
      adoption: c.adoption_potential_score, market: c.market_impact_score, modelConfidence: c.confidence_score,
      rankingReason: c.ranking_reason, humanized: true,
    });
    if (item) {
      item.audit = audit;
      items.push(item);
    }
  }
  return { items, ok: true, audits };
}

export function normalizeContentCategory(value: string): ContentCategory | null {
  const allowed: ContentCategory[] = [
    "Must Know", "Tool of the Day", "Workflow of the Day", "Founder Opportunity",
    "Underrated Tool", "Market Shift", "Research Breakthrough",
  ];
  return allowed.includes(value as ContentCategory) ? value as ContentCategory : null;
}

function tagFor(category: ContentCategory): FeedTag {
  if (category === "Tool of the Day" || category === "Underrated Tool") return "tool";
  if (category === "Workflow of the Day") return "use-case";
  return "news";
}

function publicSource(raw: RawItem): PublicSource {
  if (raw.source.startsWith("github")) return "github";
  if (raw.source.startsWith("reddit")) return "reddit";
  if (raw.source.startsWith("producthunt")) return "producthunt";
  if (raw.source.startsWith("arxiv")) return "arxiv";
  return "blog";
}

function categorize(text: string, contentCategory: ContentCategory): FeedCategory {
  const t = text.toLowerCase();
  if (contentCategory === "Founder Opportunity" || contentCategory === "Market Shift") return "business";
  if (contentCategory === "Research Breakthrough" || /model|llama|claude|gemini|gpt|research|benchmark/.test(t)) return "models";
  if (/design|image|video|figma|ui|ux|photo|logo|creative/.test(t)) return "design";
  if (/workflow|automation|agent|n8n|zapier|pipeline|browser|support|ops/.test(t)) return "automation";
  if (/code|coding|developer|cursor|ide|cli|github|api|sdk/.test(t)) return "coding";
  return "models";
}

interface BuildArgs {
  cluster: StoryCluster;
  category: ContentCategory;
  qYes: number;
  action: ActionLabel;
  headline: string;
  whatHappened: string;
  whyItMatters: string;
  whoFor: string;
  opportunity: string;
  novelty: number;
  business: number;
  builder: number;
  adoption: number;
  market: number;
  modelConfidence: number;
  rankingReason: string;
  humanized: boolean;
}

function buildSignalItem(a: BuildArgs): SignalItem | null {
  const headline = polishHeadline(String(a.headline || ""));
  const whatHappened = trimWords(String(a.whatHappened || ""), 28);
  const whyItMatters = trimWords(String(a.whyItMatters || ""), 26);
  const whoFor = trimWords(String(a.whoFor || ""), 8);
  const opportunity = trimWords(String(a.opportunity || ""), 18);

  if (!headline || !whatHappened || !whyItMatters || !whoFor || !opportunity) return null;
  if (!passesEditorialQuality({ headline, whatHappened, whyItMatters, whoFor, opportunity })) return null;
  if (isCJK(`${headline} ${whatHappened} ${whyItMatters}`)) return null;
  const visible = wordCount(`${headline} ${whatHappened} ${whyItMatters} ${whoFor} ${opportunity}`);
  if (visible < 50 || visible > 95) return null;

  const novelty = clampScore(a.novelty);
  const business = clampScore(a.business);
  const builder = clampScore(a.builder);
  const adoption = clampScore(a.adoption);
  const market = clampScore(a.market);
  const confidence = calculateConfidence(a.cluster, clampScore(a.modelConfidence));
  const corroboration = corroborationScore(a.cluster);
  const enforcedCategory: ContentCategory = a.qYes >= 9 ? "Must Know" : a.category;

  // Opportunity detection drives ranking: a story with no real opportunity is
  // demoted (Mission: "If none exist, lower the ranking.").
  const opFields = deriveOpportunityFields(enforcedCategory, `${a.cluster.primary.rawText} ${opportunity}`, opportunity);
  const oppBonus = (opFields.opp_count - 2) * 4;            // 0 opps => -8, 5 opps => +12
  const opp_score = clampScore(opportunityScore({ novelty, business, builder, adoption, market }) + oppBonus);

  const baseScore = calculateFinalScore(a.cluster, {
    novelty, business, builder, adoption, market, confidence, leverage: a.qYes,
  });
  // No opportunity at all -> meaningful demotion; rich opportunity -> small lift.
  const score = clampScore(baseScore + (opFields.opp_count === 0 ? -6 : Math.min(4, opFields.opp_count)));
  const impact = impactByLeverage(a.qYes, score);
  const tag = tagFor(enforcedCategory);
  const textBlob = `${headline} ${whatHappened} ${whyItMatters} ${opportunity}`;

  if (!passesFinalQualityGate({ score, confidence, category: enforcedCategory, impact, textBlob, cluster: a.cluster, leverage: a.qYes })) {
    return null;
  }

  const entities = detectEntities(`${a.cluster.primary.rawTitle} ${a.cluster.primary.rawText} ${headline}`);
  const sourceUrls = sourceUrlsFor(a.cluster);
  const publicSrc = publicSource(a.cluster.primary);

  return {
    id: a.cluster.id,
    title: headline.slice(0, 200),
    summary: whatHappened.slice(0, 280),
    why_it_matters: `${whyItMatters} Opportunity: ${opportunity}`.slice(0, 280),
    who_for: whoFor.slice(0, 80),
    opportunity: opportunity.slice(0, 280),
    what_happened: whatHappened.slice(0, 280),
    url: a.cluster.primary.url,
    tag,
    source: publicSrc,
    source_label: a.cluster.primary.sourceLabel,
    source_urls: sourceUrls,
    category: categorize(textBlob, enforcedCategory),
    content_category: enforcedCategory,
    score,
    usefulness: builder,
    vibe_friendly: tag !== "news" || builder >= 70,
    humanized: a.humanized,
    engagement: Math.max(...a.cluster.members.map((m) => m.engagement)),
    underrated: enforcedCategory === "Underrated Tool",
    growth: publicSrc === "github"
      ? `+${Math.round((a.cluster.primary.engagement / Math.max(a.cluster.primary.hoursOld, 1)) * 24)}/day`
      : null,
    published_at: a.cluster.primary.published_at,
    impact,
    novelty_score: novelty,
    business_impact_score: business,
    builder_value_score: builder,
    adoption_potential_score: adoption,
    market_impact_score: market,
    confidence_score: confidence,
    opportunity_score: opp_score,
    corroboration_score: corroboration,
    source_count: a.cluster.members.length,
    leverage_score: a.qYes,
    trend_score: 0,        // populated by ranking stage from trend index
    momentum_score: 0,
    action_label: a.action,
    trend_entities: entities.map((e) => e.id),
    action: opFields.action,
    risk: opFields.risk,
    who_benefits: opFields.who_benefits,
    who_should_ignore: opFields.who_should_ignore,
    expected_impact: opFields.expected_impact,
    time_horizon: opFields.time_horizon,
    ranking_reason: `[${a.qYes}/10 leverage] ${trimWords(String(a.rankingReason || ""), 22)}`,
  };
}

// =====================================================================
// SECOND-PASS MANAGING EDITOR.
// After ranking, take the top N and run a final review: kill repetition,
// merge near-duplicates, strip hype, rewrite weak headlines, reject average.
// =====================================================================
const SECOND_PASS_PROMPT = `You are Signal's managing editor doing the final pass before publish.
You receive an already-ranked shortlist. Your job is ruthless polish, not re-scoring.

For each story decide:
- keep: true unless it is average, redundant, or hype with no substance.
- merge_into: if this story covers the SAME event as an earlier story in the list, set merge_into to that story's idx (keep the stronger one, drop this). Otherwise -1.
- headline: rewrite ONLY if the current headline is weak, vague, hype, or a spec-sheet. 6-12 words, describes what happened + consequence. Never marketing, never "?", never repo slugs, never banned words (revolutionary, game-changing, unlock, supercharge, transform, paradigm). Keep the original if it is already strong.
- why_it_matters: tighten to one crisp sentence (<=26 words) on the second-order effect. Remove hype and filler. Never recap the headline.
- reject_reason: if keep=false, one short tag (average / redundant / hype / merged).

Compare every story to Inshorts + Morning Brew + TLDR AI + Ben's Bites. If Signal's version is worse, fix it. Reject anything that feels average.`;

const secondPassTools = [{
  type: "function",
  function: {
    name: "final_review",
    description: "Final managing-editor pass over the ranked shortlist.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          items: {
            type: "object",
            properties: {
              idx: { type: "number" },
              keep: { type: "boolean" },
              merge_into: { type: "number" },
              headline: { type: "string" },
              why_it_matters: { type: "string" },
              reject_reason: { type: "string" },
            },
            required: ["idx", "keep", "merge_into", "headline", "why_it_matters", "reject_reason"],
            additionalProperties: false,
          },
        },
      },
      required: ["items"],
      additionalProperties: false,
    },
  },
}];

export async function secondPassReview(
  items: SignalItem[],
  apiKey: string,
  breaker?: { canAttempt: () => boolean },
): Promise<SignalItem[]> {
  if (items.length <= 1) return items;
  const shortlist = items.slice(0, 25);
  const rest = items.slice(25);

  if (breaker && !breaker.canAttempt()) return secondPassFallback(items);

  const payload = shortlist.map((it, idx) => ({
    idx,
    headline: it.title,
    what_happened: it.what_happened,
    why_it_matters: it.why_it_matters,
    category: it.content_category,
    leverage: it.leverage_score,
    score: it.score,
    entities: it.trend_entities,
  }));

  let resp: Response | null = null;
  try {
    for (let attempt = 0; attempt < 3; attempt++) {
      resp = await fetchWithTimeout(LOVABLE_GATEWAY, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            { role: "system", content: SECOND_PASS_PROMPT },
            { role: "user", content: JSON.stringify(payload) },
          ],
          tools: secondPassTools,
          tool_choice: { type: "function", function: { name: "final_review" } },
        }),
      }, 30000);
      if (resp.ok) break;
      if (resp.status !== 429 && resp.status < 500) break;
      await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
    }
  } catch (e) {
    console.error("second pass gateway", e);
    return secondPassFallback(items);
  }
  if (!resp || !resp.ok) return secondPassFallback(items);

  let parsed: { items: any[] };
  try {
    const j = await resp.json();
    const args = j.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    if (!args) return secondPassFallback(items);
    parsed = JSON.parse(args);
  } catch { return secondPassFallback(items); }

  const decisions = new Map<number, any>();
  for (const d of parsed.items ?? []) {
    if (typeof d.idx === "number") decisions.set(d.idx, d);
  }

  const kept: SignalItem[] = [];
  const mergedAway = new Set<number>();

  for (let idx = 0; idx < shortlist.length; idx++) {
    const d = decisions.get(idx);
    const item = shortlist[idx];
    if (!d) { kept.push(item); continue; }                 // no decision => keep as-is
    if (d.merge_into >= 0 && d.merge_into < shortlist.length && d.merge_into !== idx) {
      mergedAway.add(idx);
      // Fold this story's sources into the canonical one so corroboration grows.
      const target = shortlist[d.merge_into];
      const urls = new Map(target.source_urls.map((u) => [u.url, u]));
      for (const u of item.source_urls) if (!urls.has(u.url)) urls.set(u.url, u);
      target.source_urls = [...urls.values()].slice(0, 5);
      target.source_count = Math.max(target.source_count, target.source_urls.length);
      target.corroboration_score = Math.min(100, target.corroboration_score + 6);
      continue;
    }
    if (d.keep === false) { mergedAway.add(idx); continue; }

    // Apply rewrites only if they pass the same quality bar.
    const newHeadline = polishHeadline(String(d.headline || item.title));
    if (newHeadline && wordCount(newHeadline) >= 5 && wordCount(newHeadline) <= 12 &&
        !/\?$/.test(newHeadline) && !isCJK(newHeadline)) {
      item.title = newHeadline.slice(0, 200);
    }
    const newWhy = trimWords(String(d.why_it_matters || ""), 26);
    if (newWhy && wordCount(newWhy) >= 8) {
      const opp = item.opportunity;
      item.why_it_matters = `${newWhy} Opportunity: ${opp}`.slice(0, 280);
    }
    item.ranking_reason = `${item.ranking_reason} | 2nd-pass:kept`.slice(0, 280);
    kept.push(item);
  }

  // kept already excludes merged/rejected indices; append the un-reviewed tail.
  return [...kept, ...rest];
}

// Deterministic second pass when the AI gateway is unavailable: collapse
// same-entity duplicates (keep higher score) and drop clearly-average tail.
export function secondPassFallback(items: SignalItem[]): SignalItem[] {
  const sorted = [...items].sort((a, b) => b.score - a.score);
  const kept: SignalItem[] = [];
  const seenEntity = new Map<string, SignalItem>();
  const seenTokens: Set<string>[] = [];

  for (const it of sorted) {
    const ent = (it.trend_entities[0] ?? "") + "|" + it.content_category;
    const tokens = titleTokens(`${it.title} ${it.summary}`);
    const dupTitle = seenTokens.some((t) => jaccard(t, tokens) >= 0.5);
    const dupEntity = ent.trim() !== "|" && seenEntity.has(ent);

    if (dupEntity || dupTitle) {
      // Fold sources into the canonical one for corroboration.
      const canon = seenEntity.get(ent);
      if (canon) {
        const urls = new Map(canon.source_urls.map((u) => [u.url, u]));
        for (const u of it.source_urls) if (!urls.has(u.url)) urls.set(u.url, u);
        canon.source_urls = [...urls.values()].slice(0, 5);
        canon.corroboration_score = Math.min(100, canon.corroboration_score + 6);
      }
      continue;
    }
    // Drop average tail: leverage 6 with a low score once we already have a
    // strong feed assembled.
    if (kept.length >= 10 && it.leverage_score <= 6 && it.score < 74) continue;

    kept.push(it);
    if (ent.trim() !== "|") seenEntity.set(ent, it);
    seenTokens.push(tokens);
  }
  return kept;
}

// =====================================================================
// Stage 8 (fallback path): deterministic editor — runs when the AI is down.
// =====================================================================
export function fallbackCurate(clusters: StoryCluster[]): SignalItem[] {
  const out: SignalItem[] = [];
  for (const cluster of clusters) {
    const p = cluster.primary;
    const blob = `${p.rawTitle} ${p.rawText}`;
    const lower = blob.toLowerCase();
    const leverage = estimateLeverage(cluster, blob);
    if (leverage < 6) continue;
    if (autoRejectByContent(cluster, leverage)) continue;

    const category = fallbackCategory(p, blob);
    const novelty = clampScore(40 + (MAJOR_CAPABILITY_RX.test(blob) ? 35 : 0) + (cluster.members.length - 1) * 6);
    const business = clampScore(35 + (BUSINESS_RX.test(blob) ? 38 : 0));
    const builder = clampScore(35 + (BUILDER_RX.test(blob) ? 38 : 0));
    const adoption = clampScore(40 + Math.min(30, Math.log10(Math.max(10, p.engagement)) * 9));
    const market = clampScore(38 + (MAJOR_CAPABILITY_RX.test(blob) ? 30 : 0) + (BUSINESS_RX.test(blob) ? 12 : 0));

    const sentences = (p.rawText || "").split(/(?<=[.!?])\s+/).filter((x) => wordCount(x) >= 5);
    const headline = polishHeadline(p.rawTitle);
    const whatHappened = trimWords(
      sentences.find((s) => /\d|%|\$/.test(s)) || sentences[0] || p.rawTitle, 26,
    );
    const whyItMatters = trimWords(sentences[1] || fallbackWhyItMatters(category, p, blob), 24);
    const whoFor = trimWords(fallbackAudience(category, lower), 8);
    const opportunity = trimWords(fallbackOpportunity(category, lower), 18);

    const item = buildSignalItem({
      cluster, category, qYes: leverage, action: inferActionLabel(category, lower),
      headline, whatHappened, whyItMatters, whoFor, opportunity,
      novelty, business, builder, adoption, market,
      modelConfidence: 62,
      rankingReason: `Auto-curated: ${p.sourceLabel}, ${cluster.members.length} source(s).`,
      humanized: false,
    });
    if (item) out.push(item);
  }
  return out;
}

function fallbackCategory(p: RawItem, blob: string): ContentCategory {
  if (RESEARCH_RX.test(blob) && p.sourceKind === "research") return "Research Breakthrough";
  if (BUSINESS_RX.test(blob) && (p.sourceKind === "startup" || /funding|raises|series|acquisition|revenue/i.test(blob))) {
    return "Founder Opportunity";
  }
  if (/market|enterprise|adoption|shift|category|platform|pricing/i.test(blob) && BUSINESS_RX.test(blob)) return "Market Shift";
  if (p.sourceKind === "launch" || /\b(tool|app|cli|sdk|library|launch)\b/i.test(blob)) {
    return p.engagement < 2500 ? "Underrated Tool" : "Tool of the Day";
  }
  if (/workflow|automation|pipeline|agent|integrat/i.test(blob)) return "Workflow of the Day";
  return "Must Know";
}

function fallbackAudience(category: ContentCategory, lower: string): string {
  if (/voice|speech|audio|tts|stt/.test(lower)) return "Voice agent founders and support teams";
  if (/video|veo|sora|runway|midjourney|imagen|image|generative/.test(lower)) return "Creative tool founders and video product teams";
  if (/code|coding|cursor|copilot|repo|github|sdk|cli|developer/.test(lower)) return "AI coding tool builders and indie devs";
  if (/agent|workflow|automation|n8n|zapier|browser use|computer use/.test(lower)) return "Agent builders and ops automation teams";
  if (/funding|raises|series|acquisition|valuation|revenue|gtm/.test(lower)) return "Founders raising or shipping AI products";
  if (/research|benchmark|sota|paper|arxiv|alignment|training/.test(lower)) return "ML engineers and applied researchers";
  if (category === "Founder Opportunity") return "Indie founders hunting AI niches";
  if (category === "Market Shift") return "Operators and strategy leads at AI startups";
  if (category === "Research Breakthrough") return "ML engineers and applied researchers";
  if (category === "Tool of the Day" || category === "Underrated Tool") return "Builders shipping AI features this week";
  if (category === "Workflow of the Day") return "Solo operators automating recurring work";
  return "AI founders and product builders";
}

function fallbackOpportunity(category: ContentCategory, lower: string): string {
  if (/voice|tts|stt|realtime api/.test(lower)) return "Swap STT+LLM+TTS pipelines for one realtime call and benchmark latency before customers notice.";
  if (/long context|context window|1m token|million token|2m token/.test(lower)) return "Migrate small-corpus RAG to the new context window and measure cost and recall difference.";
  if (/funding|raises|series [abc]|seed/.test(lower)) return "Map adjacent niches this round leaves uncovered and ship a wedge before they hire into them.";
  if (/open weights|open source|apache|mit license/.test(lower)) return "Self-host this on a small GPU pool to cut inference cost and reclaim margin from the API tier.";
  if (/benchmark|sota|leaderboard|outperforms/.test(lower)) return "Rerun your evals against this model; if it wins on your traffic, switch the default this week.";
  if (category === "Founder Opportunity") return "Build a wedge product targeting this gap before incumbents notice the demand.";
  if (category === "Market Shift") return "Reprice or repackage your product around the new platform default within 30 days.";
  if (category === "Research Breakthrough") return "Prototype this technique against your hardest benchmark and ship if it wins on real traffic.";
  if (category === "Tool of the Day") return "Drop this into your stack this week and delete the manual step it replaces.";
  if (category === "Underrated Tool") return "Adopt it now while engagement is low; integrate before competitors discover it.";
  if (category === "Workflow of the Day") return "Replicate this workflow in your repo and measure the hours it claws back per week.";
  return "Test this against your current pipeline and switch if metrics improve within 7 days.";
}

function fallbackWhyItMatters(category: ContentCategory, p: RawItem, blob: string): string {
  const lower = blob.toLowerCase();
  if (/gpt|claude|gemini|llama|opus|sonnet/.test(lower)) return "Frontier capability moves reset the price-performance baseline every builder ships against.";
  if (/agent|workflow|automation/.test(lower)) return "Each shipped agent pattern compounds: teams that adopt it move 2-3x faster on the next workflow.";
  if (/funding|raises|acquisition/.test(lower)) return "Capital allocation signals which niches investors believe will compound.";
  if (category === "Research Breakthrough") return "Today's paper is next quarter's API; teams that prototype now ship while others are still reading.";
  return `${p.sourceLabel} signal points to where AI builders should focus their next release cycle.`;
}

function inferActionLabel(category: ContentCategory, lower: string): ActionLabel {
  if (category === "Tool of the Day" || category === "Underrated Tool") return "try-tool";
  if (category === "Workflow of the Day") return "learn-workflow";
  if (category === "Founder Opportunity") return "watch-company";
  if (category === "Market Shift") return "monitor-trend";
  if (/prompt|system prompt/.test(lower)) return "copy-prompt";
  return "monitor-trend";
}
