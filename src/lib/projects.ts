// "Continue Building" — a single active project tracked locally (no backend).
// Created when the user commits to an idea (Save opportunity / I'm Building This /
// bookmark). Progress + last activity persist in localStorage.

import type { FeedItem } from "@/data/feed";

const KEY = "signal:project";

export type Stage = "Not Started" | "Planning" | "Building" | "Testing" | "Launched" | "Growing" | "Completed";

export const STAGES: Stage[] = ["Not Started", "Planning", "Building", "Testing", "Launched", "Growing", "Completed"];

// Each stage a unique colour (HSL).
export const STAGE_COLOR: Record<Stage, string> = {
  "Not Started": "hsl(0 0% 55%)",
  Planning:      "hsl(200 70% 55%)",
  Building:      "hsl(152 72% 48%)",
  Testing:       "hsl(38 92% 55%)",
  Launched:      "hsl(265 70% 62%)",
  Growing:       "hsl(330 75% 60%)",
  Completed:     "hsl(152 50% 40%)",
};

export interface Project {
  id: string;                 // source feed_item id
  name: string;
  stage: Stage;
  category?: string;
  tag?: string;
  entities?: string[];
  createdAt: number;
  lastActivityAt: number;
}

export function getProject(): Project | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Project) : null;
  } catch { return null; }
}

function save(p: Project | null) {
  try { p ? localStorage.setItem(KEY, JSON.stringify(p)) : localStorage.removeItem(KEY); } catch { /* quota */ }
  try { window.dispatchEvent(new CustomEvent("signal:project-changed")); } catch { /* SSR */ }
}

export function startProject(item: FeedItem, stage: Stage = "Building"): Project {
  const p: Project = {
    id: item.id, name: item.title, stage,
    category: item.category, tag: item.tag,
    entities: (item as any).intel?.trend?.name ? [] : [],
    createdAt: Date.now(), lastActivityAt: Date.now(),
  };
  save(p);
  return p;
}

export function setStage(stage: Stage): Project | null {
  const p = getProject();
  if (!p) return null;
  p.stage = stage; p.lastActivityAt = Date.now();
  save(p);
  return p;
}

export function touchProject(): Project | null {
  const p = getProject();
  if (!p) return null;
  p.lastActivityAt = Date.now();
  save(p);
  return p;
}

export function clearProject() { save(null); }

export function stageProgress(stage: Stage): number {
  const i = STAGES.indexOf(stage);
  return Math.round((i / (STAGES.length - 1)) * 100);
}

// "New updates": stories published today related to the project (same category
// or sharing a company/keyword in the title), excluding the project's own story.
export function computeUpdates(project: Project, feed: FeedItem[]): { count: number; note: string } {
  const dayMs = 24 * 3600_000;
  const nameWords = new Set(project.name.toLowerCase().split(/\W+/).filter((w) => w.length > 4));
  const related = feed.filter((it) => {
    if (it.id === project.id) return false;
    if (Date.now() - new Date(it.timestamp).getTime() > dayMs) return false;
    if (project.category && it.category === project.category) {
      const title = it.title.toLowerCase();
      return [...nameWords].some((w) => title.includes(w)) || it.tag === project.tag;
    }
    return [...nameWords].some((w) => it.title.toLowerCase().includes(w));
  });

  const count = related.length;
  let note = "";
  if (count > 0) {
    const t = related[0];
    if (/raise|funding|series|seed/i.test(t.title)) note = "Funding announced";
    else if (/pricing|price/i.test(t.title)) note = "Pricing changed";
    else if (/launch|released|introduc/i.test(t.title)) note = "New competitor launched";
    else if (/model|update|version|v\d/i.test(t.title)) note = "Model updated";
    else note = `${count} related ${count === 1 ? "story" : "stories"} today`;
  }
  return { count, note };
}

export function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
