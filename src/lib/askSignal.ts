// Ask Signal — streaming client for the `ask-signal` edge function.
//
// Reads a Server-Sent Events stream and yields token deltas. The connection is
// established with a timeout + exponential-backoff retry so a transient network
// blip is retried (not surfaced as a raw "Failed to fetch"). Backend error
// events (e.g. provider 429) pass through with status/detail so the UI can show a
// clear, honest message. Never logs secrets.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
const ASK_URL = `${SUPABASE_URL}/functions/v1/ask-signal`;
const CONNECT_TIMEOUT_MS = 30_000;
const RETRY_DELAYS = [0, 500, 1000, 2000]; // first try immediate, then backoff

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface StreamEvent {
  delta?: string;
  relatedSuggestions?: string[];
  error?: string;
  status?: number;
  detail?: string;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** True when the failure is a network/transport error worth retrying. */
export function isNetworkError(e: unknown): boolean {
  return e instanceof TypeError || (e instanceof Error && /failed to fetch|networkerror|load failed/i.test(e.message));
}

/** Establish the SSE connection with timeout + backoff retry. Throws if all attempts fail. */
async function connect(messages: ChatTurn[], signal?: AbortSignal): Promise<Response> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS.length; attempt++) {
    if (signal?.aborted) throw new DOMException("aborted", "AbortError");
    if (RETRY_DELAYS[attempt]) await sleep(RETRY_DELAYS[attempt]);

    const timer = new AbortController();
    const to = setTimeout(() => timer.abort(), CONNECT_TIMEOUT_MS);
    const onAbort = () => timer.abort();
    signal?.addEventListener("abort", onAbort);
    try {
      console.info("[AskSignal] → request", { endpoint: "/functions/v1/ask-signal", turns: messages.length, attempt: attempt + 1 });
      const res = await fetch(ASK_URL, {
        method: "POST",
        signal: timer.signal,
        headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
        body: JSON.stringify({ messages }),
      });
      if (res.ok && res.body) {
        console.info("[AskSignal] ← connected", { status: res.status, attempt: attempt + 1 });
        return res;
      }
      lastErr = new Error(`ask-signal HTTP ${res.status}`);
      console.warn("[AskSignal] non-OK response", { status: res.status, attempt: attempt + 1 });
    } catch (e) {
      if (signal?.aborted) throw new DOMException("aborted", "AbortError");
      lastErr = e;
      console.warn("[AskSignal] connect attempt failed", { attempt: attempt + 1, name: (e as Error)?.name, message: (e as Error)?.message });
      if (!isNetworkError(e) && !(e instanceof DOMException)) break; // non-network → don't keep retrying
    } finally {
      clearTimeout(to);
      signal?.removeEventListener("abort", onAbort);
    }
  }
  throw lastErr ?? new Error("ask-signal unreachable");
}

/** Lightweight reachability probe to tell "your connection" from "our service". */
export async function healthCheck(): Promise<boolean> {
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: SUPABASE_KEY } });
    return res.ok;
  } catch { return false; }
}

/** Streams live tokens from the edge function. Retries the connect; throws only
 *  after all attempts fail (caller shows a graceful, retryable message). */
export async function* streamAskSignal(
  messages: ChatTurn[],
  signal?: AbortSignal,
): AsyncGenerator<StreamEvent> {
  const res = await connect(messages, signal);

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data:"));
      if (!line) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try { yield JSON.parse(data) as StreamEvent; } catch { /* skip */ }
    }
  }
}

function suggestionKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Used only if a streamed response is interrupted before its AI suggestions arrive. */
export function fallbackRelatedSuggestions(userText: string, history: ChatTurn[] = []): string[] {
  const question = userText.toLowerCase();
  const entity = question.match(/\b(openai|anthropic|claude|gemini|google|cursor|windsurf|copilot|gpt)\b/i)?.[0] ?? "AI";
  const candidates = /compare|versus|\bvs\b/.test(question)
    ? ["Which option is cheaper?", "Which is better for coding?"]
    : /business|startup|opportunit/.test(question)
      ? ["Which opportunity has low competition?", "How can I build this in 30 days?"]
      : /code|coding|cursor|windsurf|copilot/.test(question)
        ? [`Compare ${entity} with its rivals`, "What is the best coding workflow?"]
        : /news|latest|today/.test(question)
          ? ["Which company led today's news?", "What should developers watch next?"]
          : [`How does ${entity} compare with rivals?`, `What should I watch next about ${entity}?`];
  const asked = new Set(history.filter((turn) => turn.role === "user").map((turn) => suggestionKey(turn.content)));
  return [...candidates, `Which detail matters most for ${entity}?`, `How should teams act on ${entity}?`, `What should I explore next about ${entity}?`]
    .filter((candidate, index, all) => !asked.has(suggestionKey(candidate)) && all.findIndex((item) => suggestionKey(item) === suggestionKey(candidate)) === index)
    .slice(0, 2);
}
