// Phase 4 · Module 8 — Rule Registry.
//
// Each rule is an independent, pure, deterministic object. Add a rule by adding
// an entry to RULES — the engine never changes. No giant if/else file: the
// engine iterates this array.

import type { Rule, RuleContext, RuleResult, RuleEffects, RulePriority } from "./types.ts";

interface Build {
  confidence: number;
  reason: string;
  effects: RuleEffects;
  metadata?: Record<string, unknown>;
}

// Build a rule from a predicate regex + effect factory. Always returns a full
// RuleResult (never a bare boolean).
function rule(
  id: string,
  name: string,
  priority: RulePriority,
  rx: RegExp,
  build: (ctx: RuleContext, m: RegExpMatchArray) => Build,
): Rule {
  return {
    id, name, priority,
    evaluate(ctx: RuleContext): RuleResult {
      const m = ctx.blob.match(rx);
      if (!m) {
        return { rule_id: id, rule_name: name, matched: false, confidence: 0, priority, reason: "", effects: {}, metadata: {} };
      }
      const b = build(ctx, m);
      return { rule_id: id, rule_name: name, matched: true, confidence: b.confidence, priority, reason: b.reason, effects: b.effects, metadata: b.metadata ?? {} };
    },
  };
}

// Official-source lift: a rule about an official-tier publisher is more credible.
function officialBoost(ctx: RuleContext): number {
  const t = ctx.source_quality?.tier;
  return ctx.source_quality?.official || t === "S+" ? 10 : t === "S" ? 5 : 0;
}

export const RULES: Rule[] = [
  rule("api_release", "API Release Rule", "High",
    /\b(api|sdk|endpoint|rest api|public api|api access|developer platform)\b/i,
    (ctx): Build => ({ confidence: 82 + officialBoost(ctx), reason: "New/updated API or developer platform announced",
      effects: { developer_value: 20, founder_value: 12, opportunity_score: 14, tags: ["api"], categories: ["Business Opportunity", "Developer Opportunity"], recommendations: ["Prototype against the new API this week"] } })),

  rule("open_source", "Open Source Rule", "High",
    /\b(open[- ]?source|open[- ]?weights?|mit license|apache 2|permissive license|weights released|available on (github|hugging ?face))\b/i,
    (): Build => ({ confidence: 84, reason: "Open-source / open-weights release",
      effects: { developer_value: 18, learning_value: 16, opportunity_score: 10, tags: ["open-source"], categories: ["Learning Opportunity", "Developer Opportunity"], recommendations: ["Clone and run it locally to evaluate"] } })),

  rule("research_paper", "Research Paper Rule", "Medium",
    /\b(arxiv|paper|pre[- ]?print|research|study finds|we (present|propose|introduce)|state of the art|sota)\b/i,
    (): Build => ({ confidence: 76, reason: "Research paper / preprint",
      effects: { learning_value: 18, developer_value: 6, tags: ["research"], categories: ["Learning Opportunity"], recommendations: ["Read the abstract + method section"] } })),

  rule("benchmark", "Benchmark Rule", "Low",
    /\b(benchmark|leaderboard|mmlu|gsm8k|humaneval|swe-?bench|arena|evaluation|beats .* on|tops .* on)\b/i,
    (): Build => ({ confidence: 68, reason: "Benchmark / evaluation result",
      effects: { learning_value: 8, developer_value: 6, tags: ["benchmark"], recommendations: ["Check if the eval matches your use case"] } })),

  rule("funding", "Funding Rule", "High",
    /\b(raises?|raised|funding round|series [abcd]\b|seed round|led by|valuation|\$\s?\d+(\.\d+)?\s?[mMbB]\b)\b/i,
    (_ctx, m): Build => ({ confidence: 80, reason: "Funding event", metadata: { amount: m[0] },
      effects: { founder_value: 18, investor_value: 20, opportunity_score: 12, urgency: 55, tags: ["funding"], categories: ["Startup Opportunity"], recommendations: ["Map the market gap this funding validates"] } })),

  rule("acquisition", "Acquisition Rule", "High",
    /\b(acqui(res?|red|sition)|acqui[- ]?hire|buys|to buy|merger|merges with|takeover)\b/i,
    (): Build => ({ confidence: 82, reason: "Acquisition / merger",
      effects: { investor_value: 20, founder_value: 14, urgency: 60, trend_strength: 8, tags: ["acquisition"], categories: ["Market Opportunity"], recommendations: ["Watch for displaced customers and talent"] } })),

  rule("startup_launch", "Startup Launch Rule", "Medium",
    /\b(launch(es|ed|ing)?|introduc(es|ing)|unveils?|debuts?|now available|out of stealth|announc(es|ing))\b/i,
    (): Build => ({ confidence: 70, reason: "Product / startup launch",
      effects: { founder_value: 12, developer_value: 8, opportunity_score: 8, tags: ["launch"], categories: ["Startup Opportunity"], recommendations: ["Try it and note the gaps you'd fill"] } })),

  rule("security", "Security Rule", "Critical",
    /\b(vulnerabilit(y|ies)|cve-\d|exploit|zero[- ]?day|breach|data leak|security (flaw|incident|patch)|rce|prompt injection|jailbreak)\b/i,
    (): Build => ({ confidence: 88, reason: "Security incident / vulnerability",
      effects: { developer_value: 10, urgency: 90, time_sensitivity: 90, tags: ["security"], categories: ["Breaking"], recommendations: ["Check exposure and patch immediately"] } })),

  rule("breaking_news", "Breaking News Rule", "Critical",
    /\b(breaking|just (announced|shipped|released)|moments ago|developing|urgent|major (update|release))\b/i,
    (ctx): Build => ({ confidence: 78 + officialBoost(ctx), reason: "Breaking / major development",
      effects: { urgency: 85, time_sensitivity: 85, trend_strength: 10, tags: ["breaking"], categories: ["Breaking"] } })),

  rule("enterprise", "Enterprise Rule", "Medium",
    /\b(enterprise|business tier|sso|compliance|soc ?2|hipaa|on[- ]?prem|self[- ]?host|admin controls|team plan)\b/i,
    (): Build => ({ confidence: 72, reason: "Enterprise / business offering",
      effects: { founder_value: 14, investor_value: 8, tags: ["enterprise"], categories: ["Business Opportunity"], recommendations: ["Assess fit for B2B monetization"] } })),

  rule("developer_tool", "Developer Tool Rule", "High",
    /\b(cli|ide|editor|copilot|cursor|dev tool|developer tool|debugger|linter|code (assistant|completion)|extension)\b/i,
    (): Build => ({ confidence: 80, reason: "Developer tool",
      effects: { developer_value: 20, opportunity_score: 8, tags: ["dev-tool"], categories: ["Developer Opportunity"], recommendations: ["Add to your toolchain trial list"] } })),

  rule("framework", "Framework Rule", "Medium",
    /\b(framework|next\.?js|react|svelte|langchain|llamaindex|crewai|autogen|fastapi|django|rails|spring)\b/i,
    (): Build => ({ confidence: 74, reason: "Framework release/update",
      effects: { developer_value: 16, learning_value: 8, tags: ["framework"], categories: ["Developer Opportunity"], recommendations: ["Skim the migration/changelog notes"] } })),

  rule("library", "Library Rule", "Low",
    /\b(library|package|npm|pypi|crate|module|dependency|v\d+\.\d+ release)\b/i,
    (): Build => ({ confidence: 64, reason: "Library / package update",
      effects: { developer_value: 10, tags: ["library"] } })),

  rule("prog_language", "Programming Language Rule", "Low",
    /\b(python|typescript|javascript|rust|golang|\bgo\b|zig|mojo|c\+\+|kotlin|swift)\b/i,
    (): Build => ({ confidence: 60, reason: "Programming-language relevant",
      effects: { developer_value: 8, tags: ["language"] } })),

  rule("cloud", "Cloud Rule", "Medium",
    /\b(aws|azure|gcp|google cloud|cloudflare|vercel|cloud (platform|service|region)|serverless|kubernetes|inference (endpoint|service))\b/i,
    (): Build => ({ confidence: 70, reason: "Cloud / infrastructure",
      effects: { developer_value: 12, founder_value: 8, tags: ["cloud"], categories: ["Developer Opportunity"] } })),

  rule("model_release", "Model Release Rule", "Critical",
    /\b(gpt-?\d|claude|gemini|llama|mistral|grok|qwen|deepseek|o\d\b|new (model|frontier model)|model release|open weights)\b/i,
    (ctx): Build => ({ confidence: 86 + officialBoost(ctx), reason: "AI model release",
      effects: { developer_value: 18, founder_value: 14, learning_value: 12, opportunity_score: 16, urgency: 70, trend_strength: 14, tags: ["model"], categories: ["Model Release"], recommendations: ["Benchmark it on your hardest task"] } })),

  rule("ai_agent", "AI Agent Rule", "High",
    /\b(ai agent|autonomous agent|agentic|multi[- ]?agent|computer use|browser use|tool use|mcp|model context protocol)\b/i,
    (): Build => ({ confidence: 82, reason: "AI agent capability",
      effects: { developer_value: 18, founder_value: 14, opportunity_score: 14, trend_strength: 12, tags: ["agents"], categories: ["Developer Opportunity", "Business Opportunity"], recommendations: ["Wire it into a real workflow to test reliability"] } })),

  rule("automation", "Automation Rule", "Medium",
    /\b(automat(e|ion|ed)|workflow|no[- ]?code|zapier|n8n|make\.com|pipeline|orchestrat)\b/i,
    (): Build => ({ confidence: 74, reason: "Automation / workflow",
      effects: { developer_value: 12, founder_value: 14, opportunity_score: 12, tags: ["automation"], categories: ["Business Opportunity"], recommendations: ["Automate one recurring task with it"] } })),

  rule("pricing_change", "Pricing Change Rule", "Medium",
    /\b(pric(e|ing)|free tier|paywall|per[- ]?token|cost (cut|reduction)|cheaper|price drop|now costs|\$\d+\/(mo|month))\b/i,
    (): Build => ({ confidence: 72, reason: "Pricing change",
      effects: { founder_value: 12, investor_value: 8, urgency: 55, tags: ["pricing"], categories: ["Market Opportunity"], recommendations: ["Recompute unit economics for affected products"] } })),

  rule("hiring", "Hiring Rule", "Informational",
    /\b(hiring|is hiring|open roles?|join our team|we'?re hiring|jobs? at|careers)\b/i,
    (): Build => ({ confidence: 55, reason: "Hiring signal",
      effects: { investor_value: 6, tags: ["hiring"] }, metadata: { signal: "team-growth" } })),

  rule("investment", "Investment Rule", "Medium",
    /\b(invest(s|ment|or)|vc|venture|portfolio|term sheet|leads round|backs?)\b/i,
    (): Build => ({ confidence: 70, reason: "Investment activity",
      effects: { investor_value: 16, founder_value: 8, tags: ["investment"], categories: ["Startup Opportunity"] } })),

  rule("government", "Government Rule", "Medium",
    /\b(government|white house|federal|congress|senate|\.gov\b|state department|ministry|public sector)\b/i,
    (): Build => ({ confidence: 72, reason: "Government / public sector",
      effects: { founder_value: 8, investor_value: 8, tags: ["government"], categories: ["Market Opportunity"] } })),

  rule("regulation", "Regulation Rule", "High",
    /\b(regulat(e|ion|ory)|eu ai act|compliance mandate|ban(s|ned)?|law|legislation|antitrust|policy|executive order)\b/i,
    (): Build => ({ confidence: 80, reason: "Regulation / policy change",
      effects: { founder_value: 12, investor_value: 12, urgency: 70, time_sensitivity: 70, tags: ["regulation"], categories: ["Market Opportunity"], recommendations: ["Check compliance impact on your roadmap"] } })),

  rule("education", "Education Rule", "Low",
    /\b(course|curriculum|university|bootcamp|certification|learn to|masterclass|lecture|workshop)\b/i,
    (): Build => ({ confidence: 62, reason: "Education resource",
      effects: { learning_value: 16, tags: ["education"], categories: ["Learning Opportunity"], recommendations: ["Bookmark for structured learning"] } })),

  rule("tutorial", "Tutorial Rule", "Low",
    /\b(tutorial|how[- ]?to|step[- ]?by[- ]?step|guide to|getting started|walkthrough|build a .* with)\b/i,
    (): Build => ({ confidence: 60, reason: "Tutorial / how-to",
      effects: { learning_value: 14, developer_value: 6, tags: ["tutorial"], categories: ["Learning Opportunity"] } })),
];
