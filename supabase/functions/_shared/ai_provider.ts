// _shared/ai_provider.ts — the ONE AI provider abstraction for Signal.
// ─────────────────────────────────────────────────────────────────────────────
// Every Edge Function (Ask Signal, AI Insights, AI Opportunity, Compare AI,
// AI Pulse, and any future AI feature) calls this module — never a provider
// directly. Swapping providers means editing ONLY this file.
//
// Current transport: MeshAPI (OpenAI-compatible chat completions).
//
// Configuration (all in one place, from env):
//   MESH_API_KEY     — rsk_… key   (`supabase secrets set MESH_API_KEY=…`)
//   MESH_BASE_URL    — API base    (default https://api.meshapi.ai/v1)
//   DEFAULT_AI_MODEL — model id     (required; no model name is hardcoded)
//   AI_TIMEOUT_MS    — request timeout (default 30000)
//   AI_MAX_RETRIES   — transient retries (default 2)
//
// Public surface (unchanged from the previous client so callers don't change):
//   isConfigured(), generateContent(opts) → {success,data,…}, streamContent(opts) → ReadableStream
// The legacy wire format callers pass/receive is preserved ({ parts } content
// in, { delta } SSE out) so no frontend change is required.
// ─────────────────────────────────────────────────────────────────────────────

// ── Central configuration ───────────────────────────────────────────────────
export const AI_CONFIG = {
  apiKey: Deno.env.get("MESH_API_KEY") ?? "",
  baseUrl: Deno.env.get("MESH_BASE_URL") ?? "https://api.meshapi.ai/v1",
  defaultModel: Deno.env.get("DEFAULT_AI_MODEL") ?? "", // no hardcoded model name
  timeoutMs: Number(Deno.env.get("AI_TIMEOUT_MS") ?? 30_000),
  maxRetries: Math.max(0, Number(Deno.env.get("AI_MAX_RETRIES") ?? 2)),
} as const;

/** Configured when both the key AND a model are provided by the environment. */
export function isConfigured(): boolean {
  return AI_CONFIG.apiKey.length > 0 && AI_CONFIG.defaultModel.length > 0;
}

// ── Types (identical contract to the prior shared client) ────────────────────
export type AiErrorCode =
  | "no_key" | "no_model" | "generation_failed" | "timeout"
  | "rate_limited" | "network_error" | "empty_response";

export interface AiSuccess<T = unknown> { success: true; data: T; cached: false; durationMs: number; }
export interface AiError { success: false; error: string; code: AiErrorCode; retry: boolean; durationMs: number; }
export type AiResult<T = unknown> = AiSuccess<T> | AiError;

interface ContentParts { role: string; parts: { text: string }[] }
export interface GenerateOptions {
  feature: string;
  contents: ContentParts[];
  systemInstruction?: { parts: { text: string }[] };
  generationConfig?: Record<string, unknown>;
  model?: string;
  timeoutMs?: number;
}
export type StreamOptions = GenerateOptions;

// ── Internals ────────────────────────────────────────────────────────────────
function log(feature: string, level: "info" | "warn" | "error", msg: string, meta?: Record<string, unknown>) {
  const line = `[ai:${feature}] ${msg}${meta ? " " + JSON.stringify(meta) : ""}`;
  if (level === "error") console.error(line); else if (level === "warn") console.warn(line); else console.log(line);
}

/** Convert the legacy content-parts contract into OpenAI-compatible messages. */
function toMessages(contents: ContentParts[], system?: { parts: { text: string }[] }) {
  const msgs: { role: string; content: string }[] = [];
  if (system?.parts?.length) msgs.push({ role: "system", content: system.parts.map((p) => p.text ?? "").join("\n") });
  for (const c of contents ?? []) {
    const text = (c.parts ?? []).map((p) => p?.text ?? "").join("");
    if (!text) continue;
    const role = c.role === "model" ? "assistant" : c.role === "system" ? "system" : "user";
    msgs.push({ role, content: text });
  }
  return msgs;
}

/** Map the legacy generation config into OpenAI-compatible request parameters. */
function toParams(gc?: Record<string, unknown>): Record<string, unknown> {
  const p: Record<string, unknown> = {};
  if (gc) {
    if (typeof gc.temperature === "number") p.temperature = gc.temperature;
    if (typeof gc.maxOutputTokens === "number") p.max_tokens = gc.maxOutputTokens;
    if (gc.responseMimeType === "application/json") p.response_format = { type: "json_object" };
  }
  return p;
}

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number, external?: AbortSignal): Promise<Response> {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  external?.addEventListener("abort", onAbort);
  try { return await fetch(url, { ...init, signal: ctrl.signal }); }
  finally { clearTimeout(id); external?.removeEventListener("abort", onAbort); }
}

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  feature: string;
  messages: ChatMessage[];
  tools?: unknown[];
  toolChoice?: unknown;
  model?: string;
  timeoutMs?: number;
}

/**
 * The shared non-streaming OpenAI-compatible transport for internal AI flows.
 * Provider credentials, URL, timeout, and retries remain centralized here.
 */
export async function completeChat<T = Record<string, unknown>>(opts: ChatCompletionOptions): Promise<AiResult<T>> {
  const t0 = Date.now();
  const timeout = opts.timeoutMs ?? AI_CONFIG.timeoutMs;
  const model = opts.model ?? AI_CONFIG.defaultModel;

  if (!AI_CONFIG.apiKey) return { success: false, error: "AI service is not configured.", code: "no_key", retry: false, durationMs: Date.now() - t0 };
  if (!model) return { success: false, error: "No AI model configured.", code: "no_model", retry: false, durationMs: Date.now() - t0 };

  const body: Record<string, unknown> = { model, messages: opts.messages };
  if (opts.tools?.length) body.tools = opts.tools;
  if (opts.toolChoice) body.tool_choice = opts.toolChoice;
  const init: RequestInit = { method: "POST", headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) };

  for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
      const res = await fetchWithTimeout(`${AI_CONFIG.baseUrl}/chat/completions`, init, timeout);
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        const code: AiErrorCode = res.status === 429 ? "rate_limited" : "generation_failed";
        log(opts.feature, "warn", `HTTP ${res.status}`, { attempt, detail });
        if (RETRYABLE.has(res.status) && attempt < AI_CONFIG.maxRetries) continue;
        return { success: false, error: `AI error ${res.status}`, code, retry: RETRYABLE.has(res.status), durationMs: Date.now() - t0 };
      }
      const data = await res.json() as T;
      log(opts.feature, "info", "completion complete", { durationMs: Date.now() - t0 });
      return { success: true, data, cached: false, durationMs: Date.now() - t0 };
    } catch (error) {
      const isAbort = error instanceof DOMException && error.name === "AbortError";
      if (attempt < AI_CONFIG.maxRetries) continue;
      return { success: false, error: isAbort ? "Request timed out" : error instanceof Error ? error.message : String(error), code: isAbort ? "timeout" : "network_error", retry: true, durationMs: Date.now() - t0 };
    }
  }
  return { success: false, error: "AI request failed", code: "generation_failed", retry: false, durationMs: Date.now() - t0 };
}

/** Best-effort JSON extraction (handles code fences / surrounding prose). */
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) return fenced[1].trim();
  const s = text.indexOf("{"), e = text.lastIndexOf("}");
  if (s >= 0 && e > s) return text.slice(s, e + 1);
  return text.trim();
}

// ── generateContent (non-streaming) ──────────────────────────────────────────
export async function generateContent<T = unknown>(opts: GenerateOptions): Promise<AiResult<T>> {
  const t0 = Date.now();
  const timeout = opts.timeoutMs ?? AI_CONFIG.timeoutMs;
  const model = opts.model ?? AI_CONFIG.defaultModel;

  if (!AI_CONFIG.apiKey) { log(opts.feature, "warn", "MESH_API_KEY missing"); return { success: false, error: "AI service is not configured.", code: "no_key", retry: false, durationMs: Date.now() - t0 }; }
  if (!model) { log(opts.feature, "warn", "DEFAULT_AI_MODEL missing"); return { success: false, error: "No AI model configured.", code: "no_model", retry: false, durationMs: Date.now() - t0 }; }

  const body = { model, messages: toMessages(opts.contents, opts.systemInstruction), ...toParams(opts.generationConfig) };
  const init: RequestInit = { method: "POST", headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) };

  let lastErr = "Unknown error", lastCode: AiErrorCode = "generation_failed";
  for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
      const res = await fetchWithTimeout(`${AI_CONFIG.baseUrl}/chat/completions`, init, timeout);
      if (!res.ok) {
        const detail = (await res.text().catch(() => "")).slice(0, 200);
        lastErr = `AI error ${res.status}`; lastCode = res.status === 429 ? "rate_limited" : "generation_failed";
        log(opts.feature, "warn", `HTTP ${res.status}`, { attempt, detail });
        if (RETRYABLE.has(res.status) && attempt < AI_CONFIG.maxRetries) continue;
        return { success: false, error: lastErr, code: lastCode, retry: RETRYABLE.has(res.status), durationMs: Date.now() - t0 };
      }
      const data = await res.json();
      const text: string = data?.choices?.[0]?.message?.content ?? "";
      if (!text) return { success: false, error: "Empty response.", code: "empty_response", retry: true, durationMs: Date.now() - t0 };
      log(opts.feature, "info", "generate complete", { durationMs: Date.now() - t0 });
      let parsed: T;
      try { parsed = JSON.parse(extractJson(text)) as T; } catch { parsed = text as unknown as T; }
      return { success: true, data: parsed, cached: false, durationMs: Date.now() - t0 };
    } catch (e) {
      const isAbort = e instanceof DOMException && e.name === "AbortError";
      lastErr = isAbort ? "Request timed out" : e instanceof Error ? e.message : String(e);
      lastCode = isAbort ? "timeout" : "network_error";
      log(opts.feature, "error", lastErr, { attempt });
      if (attempt < AI_CONFIG.maxRetries) continue;
      return { success: false, error: lastErr, code: lastCode, retry: true, durationMs: Date.now() - t0 };
    }
  }
  return { success: false, error: lastErr, code: lastCode, retry: false, durationMs: Date.now() - t0 };
}

// ── streamContent (SSE) ──────────────────────────────────────────────────────
export function streamContent(opts: StreamOptions): ReadableStream {
  const model = opts.model ?? AI_CONFIG.defaultModel;
  const timeout = opts.timeoutMs ?? Math.max(AI_CONFIG.timeoutMs, 45_000);
  const enc = new TextEncoder();
  const sse = (c: ReadableStreamDefaultController, o: unknown) => c.enqueue(enc.encode(`data: ${JSON.stringify(o)}\n\n`));
  const done = (c: ReadableStreamDefaultController) => { c.enqueue(enc.encode("data: [DONE]\n\n")); c.close(); };

  return new ReadableStream({
    async start(controller) {
      const t0 = Date.now();
      if (!AI_CONFIG.apiKey) { sse(controller, { error: "no_key" }); done(controller); return; }
      if (!model) { sse(controller, { error: "no_model" }); done(controller); return; }

      const body = { model, messages: toMessages(opts.contents, opts.systemInstruction), ...toParams(opts.generationConfig), stream: true };
      const init: RequestInit = { method: "POST", headers: { Authorization: `Bearer ${AI_CONFIG.apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) };

      for (let attempt = 0; attempt <= AI_CONFIG.maxRetries; attempt++) {
        try {
          if (attempt > 0) await new Promise((r) => setTimeout(r, 1000 * attempt));
          const res = await fetchWithTimeout(`${AI_CONFIG.baseUrl}/chat/completions`, init, timeout);
          if (!res.ok || !res.body) {
            const detail = (await res.text().catch(() => "")).slice(0, 200);
            log(opts.feature, "warn", `stream HTTP ${res.status}`, { attempt, detail });
            if (RETRYABLE.has(res.status) && attempt < AI_CONFIG.maxRetries) continue;
            sse(controller, { error: res.status === 429 ? "rate_limited" : "generation_failed", status: res.status, detail });
            done(controller); return;
          }
          const reader = res.body.getReader();
          const decoder = new TextDecoder();
          let buf = "";
          while (true) {
            const { done: rdone, value } = await reader.read();
            if (rdone) break;
            buf += decoder.decode(value, { stream: true });
            let idx: number;
            while ((idx = buf.indexOf("\n")) >= 0) {
              const line = buf.slice(0, idx).trim();
              buf = buf.slice(idx + 1);
              if (!line.startsWith("data:")) continue;
              const payload = line.slice(5).trim();
              if (!payload || payload === "[DONE]") continue;
              try {
                const j = JSON.parse(payload);
                const delta: string = j?.choices?.[0]?.delta?.content ?? "";
                if (delta) sse(controller, { delta });
              } catch { /* skip partial */ }
            }
          }
          log(opts.feature, "info", "stream complete", { durationMs: Date.now() - t0 });
          done(controller); return;
        } catch (e) {
          const isAbort = e instanceof DOMException && e.name === "AbortError";
          log(opts.feature, "error", isAbort ? "stream timed out" : e instanceof Error ? e.message : String(e), { attempt });
          if (attempt < AI_CONFIG.maxRetries) continue;
          sse(controller, { error: isAbort ? "timeout" : "stream_error" });
          done(controller); return;
        }
      }
    },
  });
}
