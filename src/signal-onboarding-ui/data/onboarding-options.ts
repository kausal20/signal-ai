// signal-onboarding-ui · data/onboarding-options.ts
// ---------------------------------------------------------------------------
// Default option sets + an icon map. These are DISPLAY DEFAULTS — pass your own
// arrays into the steps as props to override. The app decides what's canonical.
// ---------------------------------------------------------------------------
import {
  Rocket, Code2, GraduationCap, Cpu, Briefcase, BarChart3, FlaskConical,
  DollarSign, Kanban, Search, Building2, Workflow, BookOpen,
  type LucideIcon,
} from "lucide-react";
import type { Option } from "../shared/types";

export const ICONS: Record<string, LucideIcon> = {
  rocket: Rocket, code: Code2, grad: GraduationCap, cpu: Cpu, brief: Briefcase,
  chart: BarChart3, flask: FlaskConical, dollar: DollarSign, kanban: Kanban,
  search: Search, building: Building2, flow: Workflow, book: BookOpen,
};

export const ROLES: Option[] = [
  { id: "founder", label: "Founder", icon: "rocket" },
  { id: "developer", label: "Developer", icon: "code" },
  { id: "student", label: "Student", icon: "grad" },
  { id: "ai_engineer", label: "AI Engineer", icon: "cpu" },
  { id: "freelancer", label: "Freelancer", icon: "brief" },
  { id: "marketer", label: "Marketer", icon: "chart" },
  { id: "researcher", label: "Researcher", icon: "flask" },
  { id: "investor", label: "Investor", icon: "dollar" },
  { id: "product_manager", label: "Product Manager", icon: "kanban" },
  { id: "other", label: "Other", icon: "search" },
];

export const GOALS: Option[] = [
  { id: "build_ai_startup", label: "Build an AI startup", icon: "rocket" },
  { id: "grow_business", label: "Grow my business", icon: "building" },
  { id: "automate_work", label: "Automate my work", icon: "flow" },
  { id: "become_ai_developer", label: "Become an AI developer", icon: "code" },
  { id: "learn_ai", label: "Learn AI from scratch", icon: "book" },
  { id: "discover", label: "Find AI opportunities", icon: "dollar" },
  { id: "stay_updated", label: "Just stay updated", icon: "search" },
  { id: "ai_research", label: "Go deep on research", icon: "flask" },
];

export const INTERESTS: string[] = [
  "AI Coding", "Automation", "AI Agents", "Business", "Startups", "Marketing",
  "Design", "Video AI", "Voice AI", "Productivity", "Research", "Open Source",
  "Robotics", "Education", "Developer Tools", "MCP", "Memory", "Reasoning",
  "Coding Assistants", "Generative AI",
];

export const TIME_OPTIONS: Option[] = [
  { id: "lt_2h", label: "Less than 2 hours" },
  { id: "2_5h", label: "2-5 hours" },
  { id: "5_10h", label: "5-10 hours" },
  { id: "10_20h", label: "10-20 hours" },
  { id: "20h_plus", label: "20+ hours" },
];

export const EXPERIENCE_OPTIONS: Option[] = [
  { id: "beginner", label: "Beginner" },
  { id: "intermediate", label: "Intermediate" },
  { id: "advanced", label: "Advanced" },
  { id: "expert", label: "Expert" },
];

/** Minimum interests required before the interests step can advance. */
export const MIN_INTERESTS = 3;
