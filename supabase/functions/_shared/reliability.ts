// SRE primitives: structured Result, retry with exponential backoff,
// circuit breakers, stage runner, and job locks. Used everywhere so the
// pipeline never fails silently and never stops on a single dependency.

import type { Logger } from "./logger.ts";

// -------------------------------------------------------------------------
// Structured result — every stage returns one of these. No silent failures.
// -------------------------------------------------------------------------
export interface StageResult<T> {
  stage: string;
  ok: boolean;
  durationMs: number;
  value?: T;
  error?: string;
  stack?: string;
  retries?: number;
  degraded?: boolean;   // succeeded via fallback / partial path
  meta?: Record<string, unknown>;
}

export async function runStage<T>(
  stage: string,
  fn: () => Promise<T>,
  opts: { logger?: Logger; pipelineId?: string; meta?: Record<string, unknown> } = {},
): Promise<StageResult<T>> {
  const start = Date.now();
  opts.logger?.info(`${stage}_started`, { stage });
  try {
    const value = await fn();
    const durationMs = Date.now() - start;
    opts.logger?.info(`${stage}_finished`, { stage, durationMs, meta: opts.meta });
    return { stage, ok: true, durationMs, value, meta: opts.meta };
  } catch (e) {
    const durationMs = Date.now() - start;
    const error = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    opts.logger?.error(`${stage}_failed`, { stage, durationMs, message: error, stack });
    return { stage, ok: false, durationMs, error, stack, meta: opts.meta };
  }
}

// -------------------------------------------------------------------------
// Retry with exponential backoff + jitter. Bounded to avoid loops.
// -------------------------------------------------------------------------
export interface RetryOptions {
  attempts?: number;          // max total attempts
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  retryOn?: (err: unknown, attempt: number) => boolean;
  onRetry?: (err: unknown, attempt: number, delayMs: number) => void;
  label?: string;
}

const DEFAULT_RETRY: Required<Omit<RetryOptions, "retryOn" | "onRetry" | "label">> = {
  attempts: 3,
  baseDelayMs: 500,
  maxDelayMs: 8000,
  factor: 2,
  jitter: true,
};

export async function withRetry<T>(fn: (attempt: number) => Promise<T>, opts: RetryOptions = {}): Promise<T> {
  const cfg = { ...DEFAULT_RETRY, ...opts };
  let lastErr: unknown;
  for (let attempt = 1; attempt <= cfg.attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      const retryable = opts.retryOn ? opts.retryOn(err, attempt) : true;
      if (!retryable || attempt === cfg.attempts) break;
      let delay = Math.min(cfg.maxDelayMs, cfg.baseDelayMs * Math.pow(cfg.factor, attempt - 1));
      if (cfg.jitter) delay = Math.round(delay * (0.5 + Math.random() * 0.5));
      opts.onRetry?.(err, attempt, delay);
      await sleep(delay);
    }
  }
  throw lastErr;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// HTTP-aware retry predicate: retry network errors, 429, and 5xx only.
export function httpRetryable(err: unknown): boolean {
  if (err instanceof Error) {
    const m = err.message;
    if (/abort|timeout|network|fetch failed|ECONN|ETIMEDOUT|EAI_AGAIN/i.test(m)) return true;
    const status = Number(m.match(/\b(\d{3})\b/)?.[1]);
    if (status === 429 || (status >= 500 && status < 600)) return true;
    if (Number.isNaN(status)) return true; // unknown error: give it one more shot
    return false;
  }
  return true;
}

// -------------------------------------------------------------------------
// Circuit breaker backed by the circuit_breakers table. Open => skip the
// dependency and use the caller's fallback instead of hammering a dead API.
// -------------------------------------------------------------------------
export interface BreakerConfig {
  name: string;
  failureThreshold?: number;  // consecutive failures before opening
  cooldownMs?: number;        // how long to stay open before half-open probe
}

export class CircuitBreaker {
  private name: string;
  private failureThreshold: number;
  private cooldownMs: number;
  private state: "closed" | "open" | "half_open" = "closed";
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(cfg: BreakerConfig) {
    this.name = cfg.name;
    this.failureThreshold = cfg.failureThreshold ?? 4;
    this.cooldownMs = cfg.cooldownMs ?? 60_000;
  }

  // Load persisted state so cold-started functions respect an open breaker.
  async load(sb: any): Promise<void> {
    try {
      const { data } = await sb.from("circuit_breakers").select("*").eq("name", this.name).maybeSingle();
      if (data) {
        this.state = data.state;
        this.consecutiveFailures = data.consecutive_failures ?? 0;
        this.openedAt = data.opened_at ? new Date(data.opened_at).getTime() : 0;
        if (this.state === "open" && Date.now() - this.openedAt >= this.cooldownMs) {
          this.state = "half_open";
        }
      }
    } catch { /* breaker is best-effort */ }
  }

  canAttempt(): boolean {
    if (this.state === "closed" || this.state === "half_open") return true;
    // open: allow a probe once cooldown elapsed.
    if (Date.now() - this.openedAt >= this.cooldownMs) {
      this.state = "half_open";
      return true;
    }
    return false;
  }

  get currentState(): string { return this.state; }

  async recordSuccess(sb: any): Promise<void> {
    this.consecutiveFailures = 0;
    this.state = "closed";
    await this.persist(sb, null);
  }

  async recordFailure(sb: any, error: string): Promise<void> {
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.state = "open";
      this.openedAt = Date.now();
    }
    await this.persist(sb, error);
  }

  private async persist(sb: any, error: string | null): Promise<void> {
    try {
      await sb.from("circuit_breakers").upsert({
        name: this.name,
        state: this.state,
        consecutive_failures: this.consecutiveFailures,
        opened_at: this.state === "open" ? new Date(this.openedAt).toISOString() : null,
        reset_at: this.state === "open" ? new Date(this.openedAt + this.cooldownMs).toISOString() : null,
        last_error: error,
        updated_at: new Date().toISOString(),
      }, { onConflict: "name" });
    } catch { /* best-effort */ }
  }
}

// -------------------------------------------------------------------------
// Job locks (Phase 8): prevent overlapping scheduled executions.
// -------------------------------------------------------------------------
export async function acquireLock(sb: any, job: string, ttlSeconds: number, holder: string): Promise<boolean> {
  try {
    const { data, error } = await sb.rpc("acquire_job_lock", {
      p_job: job, p_ttl_seconds: ttlSeconds, p_holder: holder,
    });
    if (error) { console.error("acquireLock", error); return true; } // fail-open: don't block the pipeline on lock infra
    return data === true;
  } catch (e) {
    console.error("acquireLock", e);
    return true;
  }
}

export async function releaseLock(sb: any, job: string): Promise<void> {
  try { await sb.rpc("release_job_lock", { p_job: job }); }
  catch (e) { console.error("releaseLock", e); }
}

// Wrap any async DB write with retry on transient failures.
export async function dbWrite<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await withRetry(fn, {
      attempts: 3, baseDelayMs: 300, maxDelayMs: 3000, label,
      retryOn: (err) => httpRetryable(err),
    });
  } catch (e) {
    console.error(`dbWrite ${label} failed`, e);
    return null;
  }
}
