import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const ROLES = new Set([
  "founder", "developer", "student", "freelancer", "ai_engineer", "product_manager",
  "marketer", "content_creator", "consultant", "researcher", "investor", "other",
]);

const GOALS = new Set([
  "build_ai_startup", "grow_business", "automate_work", "become_ai_developer",
  "learn_ai", "discover_business_opportunities", "stay_updated", "ai_research",
]);

const TIME_BUDGETS = new Set(["lt_2h", "2_5h", "5_10h", "10_20h", "20h_plus"]);
const EXPERIENCE_LEVELS = new Set(["beginner", "intermediate", "advanced", "expert"]);

const INTERESTS = new Set([
  "AI Coding", "Automation", "AI Agents", "Business", "Startups",
  "Marketing", "Design", "Video AI", "Voice AI", "Productivity",
  "Research", "Open Source", "Robotics", "Education", "Developer Tools",
  "MCP", "Memory", "Reasoning", "Coding Assistants", "Generative AI",
  "Agents",
  /*
   * Keep the legacy "Agents" value accepted for older clients while the
   * current onboarding screen submits "AI Agents".
   */
]);

const ROLE_PERSONA: Record<string, string> = {
  founder: "founder",
  developer: "developer",
  ai_engineer: "developer",
  product_manager: "builder",
  student: "student",
  freelancer: "agency",
  consultant: "agency",
  researcher: "researcher",
  investor: "investor",
  marketer: "marketer",
  content_creator: "marketer",
};

const GOAL_PERSONA: Record<string, string> = {
  build_ai_startup: "founder",
  grow_business: "founder",
  automate_work: "agency",
  become_ai_developer: "developer",
  learn_ai: "student",
  discover_business_opportunities: "investor",
  stay_updated: "builder",
  ai_research: "researcher",
};

const INTEREST_AXIS: Record<string, string> = {
  "AI Coding": "coding",
  Agents: "agents",
  "AI Agents": "agents",
  Automation: "automation",
  "Voice AI": "voice",
  "Video AI": "video",
  Research: "research",
  Marketing: "design",
  Design: "design",
  Business: "business",
  Robotics: "models",
  Education: "research",
  "Open Source": "coding",
  "Developer Tools": "coding",
  "Coding Assistants": "coding",
  Productivity: "automation",
  MCP: "agents",
  Memory: "models",
  Reasoning: "models",
  Startups: "business",
  "Generative AI": "models",
};

function cleanString(value: unknown, max = 120): string {
  return String(value ?? "").trim().slice(0, max);
}

function bad(message: string, status = 400): Response {
  return new Response(JSON.stringify({ ok: false, error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function inferPersona(role: string, goal: string): string {
  return GOAL_PERSONA[goal] ?? ROLE_PERSONA[role] ?? "builder";
}

function personaMix(role: string, goal: string): Record<string, number> {
  const scores: Record<string, number> = {};
  const add = (persona: string | undefined, amount: number) => {
    if (!persona) return;
    scores[persona] = (scores[persona] ?? 0) + amount;
  };
  add(GOAL_PERSONA[goal], 0.65);
  add(ROLE_PERSONA[role], 0.35);
  const total = Object.values(scores).reduce((sum, value) => sum + value, 0) || 1;
  return Object.fromEntries(Object.entries(scores).map(([key, value]) => [key, Math.round((value / total) * 100) / 100]));
}

function interestWeights(interests: string[], goal: string): Record<string, number> {
  const weights: Record<string, number> = {};
  for (const interest of interests) {
    const axis = INTEREST_AXIS[interest];
    if (axis) weights[axis] = Math.min(3, (weights[axis] ?? 0) + 0.9);
  }
  if (goal === "build_ai_startup" || goal === "grow_business" || goal === "discover_business_opportunities") {
    weights.business = Math.min(3, (weights.business ?? 0) + 0.8);
  }
  if (goal === "automate_work") weights.automation = Math.min(3, (weights.automation ?? 0) + 0.8);
  if (goal === "become_ai_developer") weights.coding = Math.min(3, (weights.coding ?? 0) + 0.8);
  if (goal === "ai_research" || goal === "learn_ai") weights.research = Math.min(3, (weights.research ?? 0) + 0.7);
  return weights;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return bad("method not allowed", 405);

  let body: any = {};
  try { body = await req.json(); }
  catch { return bad("invalid json"); }

  const clientId = cleanString(body.client_id, 80);
  const primaryRole = cleanString(body.primary_role, 40);
  const primaryGoal = cleanString(body.primary_goal, 60);
  const weeklyTimeBudget = cleanString(body.weekly_time_budget, 20);
  const experienceLevel = cleanString(body.experience_level, 20);
  const interests = Array.isArray(body.interests)
    ? [...new Set(body.interests.map((item: unknown) => cleanString(item, 40)).filter((item: string) => INTERESTS.has(item)))].slice(0, 20)
    : [];

  if (!clientId) return bad("client_id is required");
  if (!ROLES.has(primaryRole)) return bad("primary_role is invalid");
  if (!GOALS.has(primaryGoal)) return bad("primary_goal is invalid");
  if (interests.length < 3) return bad("at least 3 interests are required");
  if (!TIME_BUDGETS.has(weeklyTimeBudget)) return bad("weekly_time_budget is invalid");
  if (!EXPERIENCE_LEVELS.has(experienceLevel)) return bad("experience_level is invalid");

  const now = new Date().toISOString();
  const persona = inferPersona(primaryRole, primaryGoal);
  const profile = {
    primary_role: primaryRole,
    primary_goal: primaryGoal,
    interests,
    weekly_time_budget: weeklyTimeBudget,
    experience_level: experienceLevel,
    onboarding_completed_at: now,
  };

  const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  // Identity spine: user_profiles.client_id → clients(client_id) FK. The client
  // row MUST exist before the profile upsert or the whole write is rejected.
  const { error: clientError } = await sb.from("clients").upsert({
    client_id: clientId,
    platform: cleanString(body.platform, 40) || "web",
    last_seen_at: now,
  }, { onConflict: "client_id" });
  if (clientError) return bad(clientError.message, 500);

  const { error } = await sb.from("user_profiles").upsert({
    client_id: clientId,
    persona,
    persona_mix: personaMix(primaryRole, primaryGoal),
    skill_level: experienceLevel,
    role: primaryRole,
    primary_role: primaryRole,
    primary_goal: primaryGoal,
    interests,
    weekly_time_budget: weeklyTimeBudget,
    experience_level: experienceLevel,
    onboarding_completed_at: now,
    onboarding_profile: profile,
    interest_weights: interestWeights(interests, primaryGoal),
    searches: [],
    updated_at: now,
  }, { onConflict: "client_id" });

  if (error) return bad(error.message, 500);

  return new Response(JSON.stringify({ ok: true, profile: { ...profile, persona } }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
