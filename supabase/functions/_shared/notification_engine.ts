// Phase 4 · Module 6 — Notification Intelligence Engine (deterministic, no LLM).
//
// Answers "should we interrupt the user, and how?" — by CONSUMING the upstream
// intelligence (never re-deriving). Pure, additive, explainable. It does NOT
// mutate any prior module, ranking, personalization, or delivery.
//
// Consumes (read-only):
//   • Module 1  score, score_factors, freshness_score, confidence_band
//   • Module 2  source_quality { tier, quality_score, official, spam_risk }
//   • Module 4  opportunity_intel { type, urgency, confidence, time_window }
//   • Module 5  clusters, dimension_confidence, opportunity_weights, interest_weights
//   • Module 8  matched_rules, rule_intelligence.urgency
//   • Behaviour recent user_signals / bookmarks / searches (aggregate counts)
//   • Fatigue    notification_log counts + engagement rates
//
// Every output carries a `reasoning[]` explanation and a numeric decision score.

// ── Types ───────────────────────────────────────────────────────────────────
export type Decision = "notify" | "hold" | "digest" | "suppress";
export type Schedule = "immediate" | "wait" | "morning_brief" | "evening_digest" | "tomorrow" | "never";
export type NotificationType =
  | "breaking" | "opportunity" | "learning" | "tool_release" | "research"
  | "security" | "funding" | "weekly_digest" | "daily_brief"
  | "continue_building" | "project_reminder";

export interface StoryContext {
  id: string;
  title: string;
  summary?: string;
  // Module 1
  score: number;                    // 0..100 signal ranking score
  freshness_score?: number;         // 0..20
  confidence_band?: string;         // "Very High"|"High"|"Medium"|"Low"
  score_factors?: Array<{ label: string; points: number }>;
  // Module 2
  source_quality?: { tier?: string; quality_score?: number; official?: boolean; spam_risk?: number } | null;
  // Module 4
  opportunity_intel?: { type?: string; urgency?: number; confidence?: number; time_window?: string; who_should_act?: string[] } | null;
  opportunity_type?: string | null;
  // Module 8
  matched_rules?: string[];
  rule_intelligence?: { urgency?: number; time_sensitivity?: number; categories?: string[] } | null;
  // Ranking meta reused as-is (not recomputed)
  content_category?: string | null;
  impact?: string | null;
  novelty_score?: number | null;
  published_at?: string;
  tag?: string;
}

export interface UserContext {
  clusters?: string[];
  interest_weights?: Record<string, number>;
  opportunity_weights?: Record<string, number>;
  dimension_confidence?: Record<string, number>;
  // Behaviour aggregates (already tracked by learning.ts).
  saved_count?: number;
  opened_count?: number;
  dismissed_count?: number;
  reading_ms_total?: number;
  // Recent-history matches — computed by the caller from user_signals / bookmarks.
  matches_search?: string[];       // e.g. ["mcp","agents"] — non-empty = surfaced entity searched recently
  matches_bookmark_topic?: boolean;
  matches_project?: boolean;
  persona?: string;
}

export interface FatigueContext {
  notifs_today: number;             // notification_log count since UTC midnight
  notifs_ignored_7d: number;        // sent but never opened
  notifs_opened_7d: number;         // notification_opened signals
  minutes_since_last_notif: number; // -1 if none
  daily_cap: number;                // from importance_level
}

export interface RecentTopic {
  key: string;                      // canonical topic key (rule id, entity, or category)
  last_notified_at: string;         // ISO
}

export interface NotificationDecision {
  decision: Decision;
  schedule: Schedule;
  score: number;                    // 0..100 notification score
  type: NotificationType;
  priority: "Critical" | "High" | "Medium" | "Low";
  title: string;
  subtitle: string;
  reason: string;
  action: string;
  expected_value: "High" | "Medium" | "Low";
  topic_key: string;                // used for dedup grouping
  ctr_pct: number;                  // recent engagement rate 0..100
  fatigue: number;                  // 0..100 penalty applied
  reasoning: string[];              // explainable factors
  degraded?: boolean;               // dropped intelligence
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function clamp(n: number, lo = 0, hi = 100): number {
  return Math.max(lo, Math.min(hi, Math.round(Number.isFinite(n) ? n : 0)));
}
function level(n: number): "High" | "Medium" | "Low" {
  return n >= 66 ? "High" : n >= 40 ? "Medium" : "Low";
}
function priorityFor(n: number): "Critical" | "High" | "Medium" | "Low" {
  return n >= 85 ? "Critical" : n >= 70 ? "High" : n >= 55 ? "Medium" : "Low";
}

// Rules that should never wait — carry their own urgency.
const CRITICAL_RULES = new Set(["security", "breaking_news", "model_release"]);

// Rule → primary NotificationType (deterministic mapping).
const RULE_TO_TYPE: Record<string, NotificationType> = {
  security: "security", breaking_news: "breaking", model_release: "breaking",
  api_release: "tool_release", developer_tool: "tool_release",
  open_source: "tool_release", framework: "tool_release", library: "tool_release",
  research_paper: "research", benchmark: "research",
  funding: "funding", acquisition: "funding", investment: "funding",
  ai_agent: "opportunity", automation: "opportunity",
  education: "learning", tutorial: "learning",
  startup_launch: "opportunity", enterprise: "opportunity",
  regulation: "opportunity", government: "opportunity",
  pricing_change: "opportunity", hiring: "opportunity",
  cloud: "tool_release", prog_language: "learning",
};

function typeOf(story: StoryContext): NotificationType {
  const rules = story.matched_rules ?? [];
  for (const r of rules) if (RULE_TO_TYPE[r]) return RULE_TO_TYPE[r];
  const opp = (story.opportunity_type ?? "").toLowerCase();
  if (opp.includes("security")) return "security";
  if (opp.includes("learning") || opp.includes("research")) return "research";
  if (opp.includes("investment") || opp.includes("startup") || opp.includes("funding")) return "funding";
  if (opp.includes("developer") || opp.includes("tool") || opp.includes("api") || opp.includes("framework")) return "tool_release";
  if (opp) return "opportunity";
  return "breaking";
}

function topicKeyOf(story: StoryContext): string {
  const r = story.matched_rules?.[0];
  if (r) return `rule:${r}`;
  const t = (story.opportunity_type ?? story.content_category ?? story.tag ?? "signal").toLowerCase().replace(/\s+/g, "_");
  return `type:${t}`;
}

// ── Fatigue engine ──────────────────────────────────────────────────────────
export function computeFatigue(f: FatigueContext): { penalty: number; ctr_pct: number; notes: string[] } {
  const notes: string[] = [];
  let penalty = 0;

  // Daily cap saturation: every past notif today piles on.
  penalty += Math.min(60, f.notifs_today * 22);
  if (f.notifs_today > 0) notes.push(`${f.notifs_today} notif(s) today → penalty +${Math.min(60, f.notifs_today * 22)}`);
  if (f.notifs_today >= f.daily_cap) { penalty += 100; notes.push(`Daily cap ${f.daily_cap} reached → suppress`); }

  // Ignore rate over the last 7 days.
  const totalRecent = f.notifs_ignored_7d + f.notifs_opened_7d;
  const ctr = totalRecent === 0 ? 50 : Math.round((f.notifs_opened_7d / totalRecent) * 100);
  if (totalRecent >= 3 && ctr < 25) { penalty += 25; notes.push(`Low 7d CTR ${ctr}% → fatigue +25`); }
  if (totalRecent >= 3 && ctr >= 60) { penalty -= 10; notes.push(`Strong 7d CTR ${ctr}% → fatigue −10`); }

  // Recency cooldown.
  if (f.minutes_since_last_notif >= 0 && f.minutes_since_last_notif < 45) {
    penalty += 20; notes.push(`Last notif ${f.minutes_since_last_notif}m ago → cooldown +20`);
  }

  return { penalty: clamp(penalty), ctr_pct: clamp(ctr), notes };
}

// ── Time engine ─────────────────────────────────────────────────────────────
export function chooseSchedule(story: StoryContext, penalty: number, now = new Date()): Schedule {
  const urg = Math.max(
    story.rule_intelligence?.urgency ?? 0,
    story.rule_intelligence?.time_sensitivity ?? 0,
    story.opportunity_intel?.urgency ?? 0,
  );
  const isCritical = (story.matched_rules ?? []).some((r) => CRITICAL_RULES.has(r)) || urg >= 85;
  const hour = now.getUTCHours();

  if (penalty >= 100) return "never";
  if (isCritical) return "immediate";
  if (penalty >= 60) return "tomorrow";
  if (urg >= 55) return "immediate";
  if (hour >= 22 || hour < 6) return "morning_brief";
  if (hour >= 18) return "evening_digest";
  return "wait";
}

// ── Notification score ──────────────────────────────────────────────────────
export function scoreNotification(story: StoryContext, user: UserContext, fatiguePenalty: number): { score: number; notes: string[] } {
  const notes: string[] = [];

  // Story signal quality (Module 1/2)
  const sq = story.source_quality;
  let s = story.score * 0.45;                                notes.push(`Signal score ${story.score} × 0.45 → +${(story.score * 0.45).toFixed(1)}`);
  s += (sq?.quality_score ?? 50) * 0.15;                     notes.push(`Source quality ${sq?.quality_score ?? 50} × 0.15 → +${((sq?.quality_score ?? 50) * 0.15).toFixed(1)}`);
  if (sq?.official) { s += 6; notes.push("Official source → +6"); }
  if ((sq?.spam_risk ?? 0) >= 40) { s -= 20; notes.push(`Spam risk ${sq!.spam_risk} → −20`); }

  // Opportunity (Module 4)
  const opp = story.opportunity_intel;
  if (opp?.confidence) { s += opp.confidence * 0.08; notes.push(`Opportunity confidence ${opp.confidence} → +${(opp.confidence * 0.08).toFixed(1)}`); }
  if (opp?.urgency) { s += opp.urgency * 0.08; notes.push(`Opportunity urgency ${opp.urgency} → +${(opp.urgency * 0.08).toFixed(1)}`); }

  // Rule priority (Module 8)
  const rules = story.matched_rules ?? [];
  if (rules.some((r) => CRITICAL_RULES.has(r))) { s += 14; notes.push("Critical rule matched → +14"); }
  else if (rules.length >= 2) { s += 6; notes.push(`Multi-rule signal (${rules.length}) → +6`); }

  // Novelty + freshness
  if (typeof story.novelty_score === "number" && story.novelty_score >= 70) {
    s += 6; notes.push("High novelty → +6");
  }
  if ((story.freshness_score ?? 0) >= 15) { s += 4; notes.push("Fresh publication → +4"); }

  // User interest match (Module 5)
  if (user.interest_weights && user.opportunity_weights && story.opportunity_type) {
    const w = user.opportunity_weights[story.opportunity_type] ?? 0;
    if (w > 0) { const bump = Math.min(15, Math.round(w * 0.2)); s += bump; notes.push(`Matches user opportunity affinity ${w} → +${bump}`); }
  }
  if (user.matches_search?.length) { s += 10; notes.push(`Matches recent search (${user.matches_search.join(", ")}) → +10`); }
  if (user.matches_bookmark_topic) { s += 12; notes.push("Similar to bookmarked stories → +12"); }
  if (user.matches_project) { s += 10; notes.push("Related to your active project → +10"); }

  // Cluster fit
  const c = user.clusters ?? [];
  if (c.includes("AI Builder") && (rules.includes("developer_tool") || rules.includes("api_release"))) { s += 6; notes.push("Cluster: AI Builder + dev-tool rule → +6"); }
  if (c.includes("Agent Developer") && rules.includes("ai_agent")) { s += 8; notes.push("Cluster: Agent Developer + agent rule → +8"); }
  if (c.includes("Researcher") && rules.includes("research_paper")) { s += 6; notes.push("Cluster: Researcher + research rule → +6"); }

  // Confidence tail
  if (story.confidence_band === "Very High") { s += 4; notes.push("Confidence Very High → +4"); }
  else if (story.confidence_band === "Low") { s -= 8; notes.push("Confidence Low → −8"); }

  // Fatigue penalty (bounded so a legit critical still fires unless cap hit)
  const applied = Math.min(fatiguePenalty, 55);
  s -= applied; notes.push(`Fatigue penalty → −${applied}`);

  return { score: clamp(s), notes };
}

// ── Copy generation (deterministic) ─────────────────────────────────────────
function shorten(s: string, n: number): string {
  s = (s ?? "").trim();
  return s.length <= n ? s : s.slice(0, n - 1).replace(/[,\s]+\S*$/, "") + "…";
}

function reasonLine(story: StoryContext, user: UserContext): string {
  if (user.matches_project) return "Related to your active project";
  if (user.matches_bookmark_topic) return "You bookmarked similar stories";
  if (user.matches_search?.length) return `You searched ${user.matches_search[0]} recently`;
  const opp = story.opportunity_intel?.type;
  if (opp) return `${opp} matches your goals`;
  if ((story.matched_rules ?? []).some((r) => CRITICAL_RULES.has(r))) return "Critical development in AI";
  return "High-signal update from a trusted source";
}

function actionFor(type: NotificationType): string {
  switch (type) {
    case "security": return "Check exposure";
    case "breaking": return "Read now";
    case "tool_release": return "Try it";
    case "research": return "Skim the paper";
    case "funding": return "See the deal";
    case "opportunity": return "Explore opportunity";
    case "learning": return "Start learning";
    case "continue_building": return "Continue building";
    case "project_reminder": return "Resume project";
    default: return "Open";
  }
}

// ── Public API ──────────────────────────────────────────────────────────────
export function evaluateNotification(
  story: StoryContext,
  user: UserContext,
  fatigue: FatigueContext,
  now: Date = new Date(),
): NotificationDecision {
  const type = typeOf(story);
  const topic_key = topicKeyOf(story);

  const f = computeFatigue(fatigue);
  const { score, notes } = scoreNotification(story, user, f.penalty);
  const schedule = chooseSchedule(story, f.penalty, now);

  // Decision rule: never notify below a floor; suppress when penalty maxed
  // or schedule = never.
  let decision: Decision;
  if (schedule === "never" || f.penalty >= 100) decision = "suppress";
  else if (score < 55) decision = "suppress";
  else if (schedule === "morning_brief" || schedule === "evening_digest") decision = "digest";
  else if (schedule === "wait" || schedule === "tomorrow") decision = "hold";
  else decision = "notify";

  const reasoning = [
    `Type: ${type} (topic ${topic_key})`,
    `Schedule: ${schedule}`,
    ...notes,
    ...f.notes,
    `Reason: ${reasonLine(story, user)}`,
  ];

  return {
    decision, schedule, score, type,
    priority: priorityFor(score),
    title: shorten(story.title, 60),
    subtitle: shorten(story.summary ?? story.title, 90),
    reason: reasonLine(story, user),
    action: actionFor(type),
    expected_value: level(score),
    topic_key,
    ctr_pct: f.ctr_pct,
    fatigue: f.penalty,
    reasoning,
  };
}

// ── Dedup + grouping over per-user decisions ───────────────────────────────
/**
 * Suppress near-duplicates and same-topic repeats within a run. Returns the
 * kept decisions and (optionally) a grouped digest header when >= 3 remain in
 * the same schedule bucket.
 */
export interface GroupedResult {
  keep: NotificationDecision[];
  suppressed: NotificationDecision[];
  digest?: { title: string; subtitle: string; count: number; topic_keys: string[] };
}

export function dedupAndGroup(
  candidates: NotificationDecision[],
  recentTopics: RecentTopic[] = [],
  now: Date = new Date(),
): GroupedResult {
  const cutoff = now.getTime() - 24 * 3600_000;
  const recent = new Set(
    recentTopics
      .filter((t) => new Date(t.last_notified_at).getTime() >= cutoff)
      .map((t) => t.key),
  );

  const seenTopic = new Set<string>();
  const keep: NotificationDecision[] = [];
  const suppressed: NotificationDecision[] = [];

  // Sort so we keep the highest-scoring per topic.
  const ordered = [...candidates].sort((a, b) => b.score - a.score);
  for (const d of ordered) {
    if (d.decision === "suppress") { suppressed.push(d); continue; }
    if (recent.has(d.topic_key)) {
      suppressed.push({ ...d, decision: "suppress", reasoning: [...d.reasoning, "Duplicate topic within 24h → suppressed"] });
      continue;
    }
    if (seenTopic.has(d.topic_key)) {
      suppressed.push({ ...d, decision: "suppress", reasoning: [...d.reasoning, "Same topic already selected this run → suppressed"] });
      continue;
    }
    seenTopic.add(d.topic_key);
    keep.push(d);
  }

  // Grouping: when 3+ digest-schedule items remain, roll them into a summary.
  const digestable = keep.filter((k) => k.decision === "digest");
  if (digestable.length >= 3) {
    return {
      keep: keep.filter((k) => k.decision !== "digest"),
      suppressed,
      digest: {
        title: `${digestable.length} important AI updates`,
        subtitle: digestable.slice(0, 3).map((d) => shorten(d.title, 40)).join(" · "),
        count: digestable.length,
        topic_keys: digestable.map((d) => d.topic_key),
      },
    };
  }
  return { keep, suppressed };
}
