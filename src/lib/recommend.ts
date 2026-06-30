// Presentation helpers for Home V2. Turn the existing intelligence + onboarding
// answers into ONE human "why" sentence and an action-oriented CTA label.
// No backend, no new data — pure formatting over data already on the client.

import type { FeedItem } from "@/data/feed";

const GOAL_PHRASE: Record<string, string> = {
  build_ai_startup: "you're building an AI startup",
  grow_business: "your goal is growing your business",
  automate_work: "you want to automate your work",
  become_ai_developer: "you're becoming an AI developer",
  learn_ai: "you're learning AI",
  discover_business_opportunities: "you're hunting AI business opportunities",
  stay_updated: "you want to stay ahead in AI",
  ai_research: "you're focused on AI research",
};

const ROLE_PHRASE: Record<string, string> = {
  founder: "you're a founder",
  developer: "you're a developer",
  ai_engineer: "you're an AI engineer",
  student: "you're learning AI",
  freelancer: "you're a freelancer",
  marketer: "you're a marketer",
  researcher: "you're a researcher",
  investor: "you're tracking AI bets",
  product_manager: "you're shipping product",
};

function read(key: string): string {
  try { return localStorage.getItem(key) ?? ""; } catch { return ""; }
}

function topInterest(): string {
  try {
    const raw = localStorage.getItem("signal:interests");
    if (!raw) return "";
    const arr = JSON.parse(raw) as string[];
    return Array.isArray(arr) && arr.length ? arr[0] : "";
  } catch { return ""; }
}

// One sentence, never more. Trailing period included.
function reasonCore(item: FeedItem): string {
  const intel = item.intel;
  const rec = intel?.recommendationReason?.trim();
  if (rec) return rec.replace(/\.$/, "");
  const why = intel?.whyPicked?.[0]?.trim();
  if (why) return why.replace(/\.$/, "");

  const goal = read("signal:primary_goal");
  if (GOAL_PHRASE[goal]) return GOAL_PHRASE[goal];

  const role = read("signal:primary_role");
  if (ROLE_PHRASE[role]) return ROLE_PHRASE[role];

  const interest = topInterest();
  if (interest) return `you've been reading ${interest} content`;
  return "it matches what you follow on Signal";
}

// "WHY THIS MATTERS TO YOU" line for the hero.
export function whyThisMatters(item: FeedItem): string {
  const core = reasonCore(item);
  return `Because ${core}.`;
}

// "Recommended because …" line for ranked recommendations.
export function recommendedBecause(item: FeedItem): string {
  const core = reasonCore(item);
  return `Recommended because ${core}.`;
}

// Action-oriented CTA driven by opportunity type / tag.
export function ctaForOpportunity(item: FeedItem): string {
  const t = (item.intel?.opportunity?.type ?? "").toLowerCase();
  const tag = item.tag;
  if (/learn|research|study|skill|course|understand/.test(t)) return "Start Learning";
  if (tag === "tool" || tag === "use-case" || /build|ship|launch|automat|implement/.test(t)) return "Start Building";
  return "Explore";
}

// A short, specific recommendation headline (≤7 words) for the signature card.
export function shortRecommendation(item: FeedItem): string {
  const raw = item.intel?.opportunity?.title ?? item.intel?.personalizedTakeaway ?? item.title;
  const clean = raw.replace(/[:–—].*$/, "").trim();
  const words = clean.split(/\s+/);
  return words.length > 7 ? words.slice(0, 7).join(" ") : clean;
}

function confidenceLevel(item: FeedItem): "high" | "medium" | "low" {
  const intel = item.intel;
  const num = typeof intel?.roi?.confidence === "number" ? intel.roi.confidence : NaN;
  if (!Number.isNaN(num)) return num >= 75 ? "high" : num >= 55 ? "medium" : "low";
  const s = (intel?.confidence ?? intel?.opportunity?.confidence ?? "").toString().toLowerCase();
  if (/high|strong|very/.test(s)) return "high";
  if (/low|weak|maybe/.test(s)) return "low";
  return /medium|moderate/.test(s) ? "medium" : "high";
}

// Signal speaking, not a confidence percentage.
export function confidenceVoice(item: FeedItem): string {
  switch (confidenceLevel(item)) {
    case "high": return "I'm confident this is worth your time.";
    case "medium": return "I think this is worth a look.";
    default: return "Worth a quick scan if you have a minute.";
  }
}

// Signal speaking the impact, not "High impact".
export function impactVoice(item: FeedItem): string {
  const raw = (item.intel?.opportunity?.potential_impact ?? item.intel?.roi?.money_saved ?? "high").toString().toLowerCase();
  if (/high|major|critical|large/.test(raw)) return "Could become one of your highest-value skills.";
  if (/medium|moderate/.test(raw)) return "A solid addition to what you're building.";
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}
