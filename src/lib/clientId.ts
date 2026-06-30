// Stable anonymous client identity for the learning loop. No login, no PII —
// just a random id persisted locally so the backend can build a per-device
// profile (user_profiles / user_signals keyed by client_id).

const KEY = "signal:client_id";

export function getClientId(): string {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = (crypto?.randomUUID?.() ?? `c_${Date.now()}_${Math.random().toString(36).slice(2)}`);
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (private mode): ephemeral id for this session.
    return `c_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
}

// Map onboarding-selected topics → a coarse persona the backend understands.
// Backend continues to refine/override this from real behaviour.
const TOPIC_PERSONA: Record<string, string> = {
  coding: "developer", agents: "builder", automation: "agency", business: "founder",
  startups: "founder", research: "researcher", models: "researcher", design: "marketer",
  video: "marketer", voice: "builder", tools: "developer", workflows: "agency",
};

export function getPersona(): string {
  try {
    const explicit = localStorage.getItem("signal:persona");
    if (explicit) return explicit;
    const raw = localStorage.getItem("signal:topics") ?? localStorage.getItem("signal:interests");
    if (raw) {
      const topics: string[] = JSON.parse(raw);
      const counts: Record<string, number> = {};
      for (const t of topics) {
        const p = TOPIC_PERSONA[String(t).toLowerCase()];
        if (p) counts[p] = (counts[p] ?? 0) + 1;
      }
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (top) return top[0];
    }
  } catch { /* ignore */ }
  return "generic";
}
