// V4 CAP 3 + 6 — Global Intelligence Graph with Bayesian confidence.
// Every engagement / success nudges a story's global Beta(alpha,beta). High-value
// discoveries spread (influence ↑), low-value content decays (cron decays α,β
// toward the prior). Ranking everywhere reads a global multiplier.

export interface GlobalStat { alpha: number; beta: number; influence: number; }

export async function loadGlobalInfluence(sb: any, ids: string[], kind = "story"): Promise<Map<string, GlobalStat>> {
  const m = new Map<string, GlobalStat>();
  if (ids.length === 0) return m;
  try {
    const { data } = await sb.from("global_intelligence")
      .select("key,alpha,beta,influence").eq("kind", kind).in("key", ids);
    for (const r of data ?? []) {
      const alpha = Number(r.alpha ?? 1), beta = Number(r.beta ?? 1);
      m.set(r.key, { alpha, beta, influence: r.influence != null ? Number(r.influence) : alpha / (alpha + beta) });
    }
  } catch (e) { console.error("loadGlobalInfluence", e); }
  return m;
}

// Beta posterior mean → ranking multiplier in [0.85, 1.2]. Neutral until enough
// evidence accrues (low α+β stays near 1.0).
export function globalMultiplier(stat: GlobalStat | undefined): number {
  if (!stat) return 1;
  const evidence = stat.alpha + stat.beta - 2;     // observations beyond prior
  if (evidence < 4) return 1;                       // not enough signal yet
  const mean = stat.alpha / (stat.alpha + stat.beta); // 0..1
  return Math.max(0.85, Math.min(1.2, 0.85 + mean * 0.7));
}

// Map an outcome event to Bayesian success/failure mass (CAP 6).
export function outcomeMass(kind: string, value?: number): { success: number; fail: number } {
  switch (kind) {
    case "built": case "implemented": return { success: 3, fail: 0 };
    case "revenue": return { success: value && value > 0 ? 4 : 1, fail: 0 };
    case "time_saved": return { success: value && value > 0 ? 2 : 1, fail: 0 };
    case "adoption": return { success: 2, fail: 0 };
    case "saved": return { success: 1, fail: 0 };
    case "feedback": return { success: value != null && value >= 4 ? 2 : 0, fail: value != null && value <= 2 ? 2 : 0 };
    case "ignored": return { success: 0, fail: 1 };
    default: return { success: 0, fail: 0 };
  }
}

export async function recordBayes(sb: any, key: string, kind: string, success: number, fail: number): Promise<void> {
  if (success === 0 && fail === 0) return;
  try {
    await sb.rpc("bump_bayes", { p_key: key, p_kind: kind, p_success: success, p_fail: fail });
  } catch (e) { console.error("bump_bayes", e); }
}
