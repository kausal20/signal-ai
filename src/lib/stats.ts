// Client-side reading stats for the Weekly Report + Profile Insights.
// Derived locally from behaviour (no backend analytics touched). Tracks a
// rolling reading log, streak, and saved-time estimate.

const KEY = "signal:stats";

export interface LocalStats {
  read: string[];            // ISO dates a story was read-through
  readCount: number;
  minutesSaved: number;      // rough estimate from reading-through
  lastDay: string | null;    // YYYY-MM-DD
  streak: number;
  weekRead: number;          // resets weekly
  weekStart: string | null;  // YYYY-MM-DD of current week anchor
}

function blank(): LocalStats {
  return { read: [], readCount: 0, minutesSaved: 0, lastDay: null, streak: 0, weekRead: 0, weekStart: null };
}

export function getStats(): LocalStats {
  try { return { ...blank(), ...JSON.parse(localStorage.getItem(KEY) || "{}") }; }
  catch { return blank(); }
}

function save(s: LocalStats) { try { localStorage.setItem(KEY, JSON.stringify(s)); } catch { /* quota */ } }

function dayStr(d = new Date()) { return d.toISOString().slice(0, 10); }
function weekAnchor(d = new Date()) {
  const c = new Date(d); const day = (c.getDay() + 6) % 7; // Mon=0
  c.setDate(c.getDate() - day); return dayStr(c);
}

// Called when a story is read through (signals.completed).
export function recordRead(minutesSavedEstimate = 4): LocalStats {
  const s = getStats();
  const today = dayStr();
  const wk = weekAnchor();

  if (s.weekStart !== wk) { s.weekStart = wk; s.weekRead = 0; }
  if (s.lastDay !== today) {
    // streak: consecutive days
    const yest = dayStr(new Date(Date.now() - 86_400_000));
    s.streak = s.lastDay === yest ? s.streak + 1 : 1;
    s.lastDay = today;
  }
  s.readCount += 1;
  s.weekRead += 1;
  s.minutesSaved += minutesSavedEstimate;
  s.read = [...s.read, new Date().toISOString()].slice(-500);
  save(s);
  return s;
}

// Signal "level" gamification from cumulative reads.
export function signalLevel(readCount: number): { level: number; label: string; next: number; pct: number } {
  const thresholds = [0, 10, 30, 75, 150, 300, 600];
  const labels = ["Newcomer", "Reader", "Tracker", "Operator", "Analyst", "Strategist", "Oracle"];
  let level = 0;
  for (let i = 0; i < thresholds.length; i++) if (readCount >= thresholds[i]) level = i;
  const next = thresholds[Math.min(level + 1, thresholds.length - 1)];
  const prev = thresholds[level];
  const pct = next > prev ? Math.min(100, Math.round(((readCount - prev) / (next - prev)) * 100)) : 100;
  return { level: level + 1, label: labels[level], next, pct };
}
