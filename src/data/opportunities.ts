// AI Opportunity — curated presentation data for the Advisor hero + detail page.
// Presentation only (no backend logic). The hero can override the primary
// opportunity's name/score from the live recommendation when available.

export interface Resource { title: string; kind: string; }
export interface PlanStep { title: string; body: string; }
export interface OriginSource { label: string; url?: string; }

export interface Opportunity {
  id: string;
  name: string;
  tagline: string;
  score: number;            // 0..100 opportunity score
  revenue: string;          // e.g. "$5–20k/mo"
  difficulty: "Low" | "Medium" | "High";
  learnTime: string;        // e.g. "2–4 weeks"
  overview: string;
  whyExists: string;
  whoShould: string[];      // Students / Developers / Agencies / Founders / Creators
  demand: number;           // 0..100 market demand
  competition: "Low" | "Medium" | "High";
  stack: string[];
  resources: Resource[];
  plan: PlanStep[];
  /** Where this opportunity signal originated — every opportunity cites its origin. */
  sources?: OriginSource[];
}

export const OPPORTUNITIES: Opportunity[] = [
  {
    id: "voice-agents",
    name: "AI Voice Agents",
    tagline: "Highest opportunity today",
    score: 96,
    revenue: "$5–20k/mo",
    difficulty: "Medium",
    learnTime: "3–4 weeks",
    overview:
      "Build voice-first AI agents that answer calls, book appointments, and qualify leads for local businesses — replacing missed calls with 24/7 revenue.",
    whyExists:
      "Realtime speech models just crossed the quality + latency threshold, while small businesses still lose most leads to unanswered calls. The tooling is new enough that few agencies offer it well.",
    whoShould: ["Developers", "Agencies", "Founders"],
    demand: 92,
    competition: "Low",
    stack: ["Realtime API", "Twilio", "Node/Deno", "Vapi / LiveKit", "Postgres", "Stripe"],
    resources: [
      { title: "Realtime voice API guide", kind: "Docs" },
      { title: "Telephony + AI starter", kind: "Repo" },
      { title: "Selling to local businesses", kind: "Playbook" },
    ],
    plan: [
      { title: "Build a demo agent", body: "One vertical (dental, salon). Book a real appointment end-to-end." },
      { title: "Land 3 pilots", body: "Charge a small setup + monthly. Prove missed-call recovery in dollars." },
      { title: "Productize + template", body: "Turn the pilot into a repeatable per-vertical package." },
    ],
    sources: [
      { label: "OpenAI Realtime API", url: "https://platform.openai.com/docs/guides/realtime" },
      { label: "Twilio Docs", url: "https://www.twilio.com/docs/voice" },
      { label: "LiveKit Agents", url: "https://docs.livekit.io/agents" },
    ],
  },
  {
    id: "mcp-consulting",
    name: "MCP Consulting",
    tagline: "Rising fast",
    score: 91,
    revenue: "$8–30k/mo",
    difficulty: "Medium",
    learnTime: "2–3 weeks",
    overview: "Help companies connect their internal tools to AI assistants via Model Context Protocol servers.",
    whyExists: "MCP is becoming the standard for tool access, but almost no one knows how to build production servers yet.",
    whoShould: ["Developers", "Agencies", "Founders"],
    demand: 84,
    competition: "Low",
    stack: ["MCP SDK", "TypeScript", "OAuth", "Docker", "Cloud Run"],
    resources: [{ title: "MCP spec + SDK", kind: "Docs" }, { title: "Reference servers", kind: "Repo" }],
    plan: [
      { title: "Ship one MCP server", body: "Wrap a popular SaaS API as an MCP server." },
      { title: "Case study", body: "Document a real internal-tool integration." },
      { title: "Retainer offer", body: "Sell ongoing server maintenance + new integrations." },
    ],
  },
  {
    id: "browser-automation",
    name: "AI Browser Automation",
    tagline: "Underserved",
    score: 88,
    revenue: "$3–15k/mo",
    difficulty: "Medium",
    learnTime: "3–5 weeks",
    overview: "Automate repetitive web workflows for ops teams using computer-use models.",
    whyExists: "Computer-use models can now click and type reliably enough for real back-office work.",
    whoShould: ["Developers", "Agencies"],
    demand: 79,
    competition: "Medium",
    stack: ["Playwright", "Computer-use API", "Queue", "Postgres"],
    resources: [{ title: "Computer-use cookbook", kind: "Docs" }, { title: "Playwright + AI", kind: "Repo" }],
    plan: [
      { title: "Pick one workflow", body: "Data entry between two SaaS tools." },
      { title: "Reliability harness", body: "Retries, screenshots, human-in-the-loop." },
      { title: "Sell as a service", body: "Per-workflow monthly automation fee." },
    ],
  },
  {
    id: "healthcare-ai",
    name: "Healthcare AI",
    tagline: "High value",
    score: 85,
    revenue: "$10–40k/mo",
    difficulty: "High",
    learnTime: "6–10 weeks",
    overview: "AI scribes and intake assistants that cut clinician admin time.",
    whyExists: "Documentation burden is the #1 driver of burnout; ambient AI scribing is now accurate enough.",
    whoShould: ["Founders", "Developers"],
    demand: 88,
    competition: "Medium",
    stack: ["Speech API", "HIPAA infra", "FHIR", "Postgres"],
    resources: [{ title: "Clinical NLP intro", kind: "Course" }, { title: "HIPAA on cloud", kind: "Guide" }],
    plan: [
      { title: "Narrow specialty", body: "One clinic type, one note format." },
      { title: "Compliance first", body: "BAA, encryption, audit logs." },
      { title: "Pilot with one clinic", body: "Measure minutes saved per visit." },
    ],
  },
  {
    id: "coding-saas",
    name: "AI Coding SaaS",
    tagline: "Crowded but big",
    score: 82,
    revenue: "$5–50k/mo",
    difficulty: "High",
    learnTime: "8–12 weeks",
    overview: "Niche developer tools built on top of frontier coding models.",
    whyExists: "General copilots leave whole workflows (migrations, reviews, tests) underserved.",
    whoShould: ["Developers", "Founders"],
    demand: 90,
    competition: "High",
    stack: ["Model APIs", "AST tooling", "Next.js", "Stripe"],
    resources: [{ title: "Building on code models", kind: "Docs" }],
    plan: [
      { title: "One painful workflow", body: "e.g. framework migration assistant." },
      { title: "Design-partner loop", body: "5 teams, weekly feedback." },
      { title: "Usage pricing", body: "Charge per successful task." },
    ],
  },
  {
    id: "ai-education",
    name: "AI Education",
    tagline: "Evergreen",
    score: 80,
    revenue: "$2–10k/mo",
    difficulty: "Low",
    learnTime: "1–2 weeks",
    overview: "Cohorts, courses, and tools that teach people to use AI well.",
    whyExists: "Demand for practical AI skills vastly outpaces good teaching.",
    whoShould: ["Creators", "Founders", "Students"],
    demand: 76,
    competition: "Medium",
    stack: ["Content", "Community", "Video", "Payments"],
    resources: [{ title: "Cohort playbook", kind: "Guide" }],
    plan: [
      { title: "Teach one skill", body: "A single, outcome-based workshop." },
      { title: "Run it live", body: "Sell seats before building the full course." },
      { title: "Systematize", body: "Turn into an evergreen product." },
    ],
  },
  {
    id: "local-ai",
    name: "Local AI",
    tagline: "Privacy wave",
    score: 77,
    revenue: "$3–12k/mo",
    difficulty: "Medium",
    learnTime: "3–4 weeks",
    overview: "On-device / on-prem AI for privacy-sensitive teams.",
    whyExists: "Open weights are now good enough that regulated teams want AI without sending data out.",
    whoShould: ["Developers", "Agencies"],
    demand: 72,
    competition: "Low",
    stack: ["Open weights", "Ollama / vLLM", "Rust/Go", "Vector DB"],
    resources: [{ title: "Local inference guide", kind: "Docs" }],
    plan: [
      { title: "One regulated vertical", body: "Legal or healthcare doc search." },
      { title: "On-prem deploy", body: "Package for their infra." },
      { title: "Support contract", body: "Recurring maintenance revenue." },
    ],
  },
  {
    id: "enterprise-ai",
    name: "Enterprise AI",
    tagline: "Big budgets",
    score: 74,
    revenue: "$20–100k/mo",
    difficulty: "High",
    learnTime: "8–16 weeks",
    overview: "Internal AI copilots and agents for large organizations.",
    whyExists: "Enterprises have budget and messy data but lack in-house AI delivery teams.",
    whoShould: ["Agencies", "Founders"],
    demand: 85,
    competition: "High",
    stack: ["RAG", "SSO", "Eval infra", "Cloud"],
    resources: [{ title: "Enterprise RAG patterns", kind: "Docs" }],
    plan: [
      { title: "One department", body: "Land a single high-value workflow." },
      { title: "Security review", body: "Pass procurement early." },
      { title: "Expand", body: "Grow across departments." },
    ],
  },
];
