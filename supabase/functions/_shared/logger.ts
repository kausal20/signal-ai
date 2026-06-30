// Structured logger (Phase 9). Buffers events and flushes to event_log in a
// single insert at the end of a run so logging never blocks the pipeline.

type Level = "debug" | "info" | "warn" | "error";

export interface LogFields {
  stage?: string;
  source?: string;
  message?: string;
  retryCount?: number;
  durationMs?: number;
  stack?: string;
  meta?: Record<string, unknown>;
  context?: Record<string, unknown>;
}

interface BufferedEvent {
  occurred_at: string;
  pipeline_id: string | null;
  level: Level;
  event: string;
  stage: string | null;
  source: string | null;
  message: string | null;
  retry_count: number;
  duration_ms: number | null;
  stack: string | null;
  context: Record<string, unknown> | null;
}

export class Logger {
  private buffer: BufferedEvent[] = [];
  private sb: any;
  readonly pipelineId: string | null;
  private maxBuffer = 500;

  constructor(sb: any, pipelineId?: string) {
    this.sb = sb;
    this.pipelineId = pipelineId ?? null;
  }

  private push(level: Level, event: string, f: LogFields = {}): void {
    // Mirror to console for live debugging (Supabase captures stdout).
    const line = `[${level}] ${event}${f.stage ? ` stage=${f.stage}` : ""}${f.source ? ` source=${f.source}` : ""}${f.message ? ` ${f.message}` : ""}`;
    if (level === "error") console.error(line);
    else if (level === "warn") console.warn(line);
    else console.log(line);

    if (this.buffer.length >= this.maxBuffer) this.buffer.shift();
    this.buffer.push({
      occurred_at: new Date().toISOString(),
      pipeline_id: this.pipelineId,
      level,
      event,
      stage: f.stage ?? null,
      source: f.source ?? null,
      message: f.message ?? null,
      retry_count: f.retryCount ?? 0,
      duration_ms: f.durationMs ?? null,
      stack: f.stack ?? null,
      context: f.context ?? f.meta ?? null,
    });
  }

  debug(event: string, f?: LogFields): void { this.push("debug", event, f); }
  info(event: string, f?: LogFields): void { this.push("info", event, f); }
  warn(event: string, f?: LogFields): void { this.push("warn", event, f); }
  error(event: string, f?: LogFields): void { this.push("error", event, f); }

  get errorCount(): number {
    return this.buffer.filter((e) => e.level === "error").length;
  }

  get events(): ReadonlyArray<BufferedEvent> { return this.buffer; }

  async flush(): Promise<void> {
    if (this.buffer.length === 0) return;
    const rows = this.buffer.splice(0, this.buffer.length);
    try {
      // Chunk to avoid oversized inserts.
      for (let i = 0; i < rows.length; i += 200) {
        await this.sb.from("event_log").insert(rows.slice(i, i + 200));
      }
    } catch (e) {
      console.error("logger flush failed", e);
    }
  }
}
