// useAskSignal — conversation state + streaming for the Ask Signal experience.
//
// Sends the running history to the `ask-signal` edge function and streams the
// reply token-by-token. If the service isn't available it transparently falls
// back to a labelled Preview stream so the UI never dead-ends. Client-only
// state (no persistence). Additive.
import { useCallback, useRef, useState } from "react";
import { streamAskSignal, fallbackRelatedSuggestions, healthCheck, type ChatTurn, type StreamEvent, type ArticleContext } from "@/lib/askSignal";

// Turn a backend error event into a clear, honest, non-scary message.
function friendlyError(ev: StreamEvent): string {
  const providerUnavailable = ev.status === 429 || /quota|rate.?limit|exceeded/i.test(ev.detail ?? "");
  if (providerUnavailable) {
    return "⚠️ **The AI provider is temporarily unavailable.** Please try again shortly.";
  }
  if (ev.error === "no_key") {
    return "⚠️ **Signal AI isn't configured yet.** Set `MESH_API_KEY` and `DEFAULT_AI_MODEL` on the ask-signal function to enable live answers.";
  }
  return `⚠️ **Signal AI hit a snag** (${ev.error ?? "error"}). Please try again in a moment.`;
}

export interface AskMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  related?: string[];
  streaming?: boolean;
  preview?: boolean;
}

type Status = "idle" | "thinking" | "streaming";

const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

/** `context` (a Top Story) is sent with every turn so the assistant always knows
 *  which article the conversation is about — the user never re-explains it. */
export function useAskSignal(context?: ArticleContext) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [status, setStatus] = useState<Status>("idle");
  const abortRef = useRef<AbortController | null>(null);

  const patch = (id: string, fn: (m: AskMessage) => AskMessage) =>
    setMessages((prev) => prev.map((m) => (m.id === id ? fn(m) : m)));

  const send = useCallback(async (raw: string) => {
    const text = raw.trim();
    if (!text || status !== "idle") return;

    const userMsg: AskMessage = { id: uid(), role: "user", content: text };
    const botId = uid();
    const botMsg: AskMessage = { id: botId, role: "assistant", content: "", streaming: true };

    // Build the history the model will see (prior turns + this question).
    const history: ChatTurn[] = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }));

    setMessages((prev) => [...prev, userMsg, botMsg]);
    setStatus("thinking");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      let got = false;
      for await (const ev of streamAskSignal(history, ctrl.signal, context)) {
        if (ev.error) {
          patch(botId, (m) => ({ ...m, content: friendlyError(ev) }));
          got = true;
          break;
        }
        if (ev.delta) {
          got = true;
          setStatus("streaming");
          patch(botId, (m) => ({ ...m, content: m.content + ev.delta }));
        }
        if (ev.relatedSuggestions) {
          patch(botId, (m) => ({ ...m, related: ev.relatedSuggestions.slice(0, 2) }));
        }
      }
      if (!got) {
        patch(botId, (m) => ({ ...m, content: "⚠️ **No response received.** Please try again in a moment." }));
      }
    } catch (e) {
      // Aborted by the user (stop / new chat) — leave the message as-is.
      if (e instanceof DOMException && e.name === "AbortError") return;
      // Distinguish "your connection" from "our service" via a health probe.
      const online = typeof navigator !== "undefined" ? navigator.onLine : true;
      const reachable = online ? await healthCheck() : false;
      console.error("[AskSignal] send failed", { message: e instanceof Error ? e.message : String(e), online, reachable });
      const msg = !online
        ? "⚠️ **You're offline.** Check your internet connection and tap retry."
        : reachable
          ? "⚠️ **Couldn't reach Signal AI.** The service is briefly unavailable — please try again."
          : "⚠️ **Unable to reach Signal servers.** Please check your connection and try again.";
      patch(botId, (m) => ({ ...m, content: msg }));
    } finally {
      patch(botId, (m) => ({
        ...m,
        streaming: false,
        related: m.related?.length === 2 ? m.related : fallbackRelatedSuggestions(text, history),
      }));
      setStatus("idle");
      abortRef.current = null;
    }
  }, [messages, status, context]);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages((prev) => prev.map((m) => (m.streaming ? { ...m, streaming: false } : m)));
    setStatus("idle");
  }, []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setMessages([]);
    setStatus("idle");
  }, []);

  return { messages, status, send, stop, newChat, busy: status !== "idle" };
}
