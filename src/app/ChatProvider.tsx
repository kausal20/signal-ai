// Signal AI conversation, lifted above the routes so switching tabs doesn't
// throw the conversation away. Finished conversations are saved on this device
// (localStorage, see lib/chatHistory) and get a short AI-written title — never
// sent to the profile.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAskSignal, type AskMessage } from "@/hooks/useAskSignal";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { generateChatTitle, type ArticleContext } from "@/lib/askSignal";
import {
  HISTORY_KEY, fallbackTitle, newConversationId, upsertConversation, type SavedConversation,
} from "@/lib/chatHistory";

interface ChatValue {
  messages: AskMessage[];
  status: "idle" | "thinking" | "streaming";
  context?: ArticleContext;
  send: (text: string) => void;
  stop: () => void;
  newChat: () => void;
  clearContext: () => void;
  /** Start a fresh conversation about a story. */
  startAbout: (article: ArticleContext) => void;
  /** Start a fresh conversation with an opening question. */
  startWith: (question: string) => void;
  /** Saved conversations, newest first. */
  history: SavedConversation[];
  activeId: string;
  openConversation: (id: string) => void;
  deleteConversation: (id: string) => void;
  clearHistory: () => void;
}

const ChatContext = createContext<ChatValue | null>(null);

export function ChatProvider({ children }: { children: ReactNode }) {
  const [context, setContext] = useState<ArticleContext | undefined>(undefined);
  const [pending, setPending] = useState<string | undefined>(undefined);
  const [activeId, setActiveId] = useState(newConversationId);
  const [history, setHistory] = useLocalStorage<SavedConversation[]>(HISTORY_KEY, []);
  const titling = useRef(new Set<string>());
  const historyRef = useRef(history);
  historyRef.current = history;
  // Signature of what was last saved, so reopening a conversation doesn't
  // re-save it (and bump it to the top) until something new is said.
  const savedSig = useRef("");
  const sigOf = (id: string, msgs: AskMessage[]) => `${id}:${msgs.length}:${msgs.at(-1)?.content.length ?? 0}`;
  const { messages, status, send, stop, newChat: resetChat, restore } = useAskSignal(context);

  const newChat = useCallback(() => {
    resetChat();
    setContext(undefined);
    setPending(undefined);
    setActiveId(newConversationId());
  }, [resetChat]);

  // Send the opening question only once the reset has rendered, so `send` sees
  // an empty history and the right story context.
  useEffect(() => {
    if (!pending || messages.length > 0 || status !== "idle") return;
    setPending(undefined);
    send(pending);
  }, [pending, messages.length, status, send]);

  // Save after each completed answer; name the conversation once with the AI.
  useEffect(() => {
    if (status !== "idle" || messages.length < 2 || messages.some((m) => m.streaming)) return;
    const id = activeId;
    const sig = sigOf(id, messages);
    if (sig === savedSig.current) return;
    savedSig.current = sig;
    const now = new Date().toISOString();
    const known = historyRef.current.find((c) => c.id === id);
    const needsTitle = known?.titleSource !== "ai";
    setHistory((list) => {
      const existing = list.find((c) => c.id === id);
      return upsertConversation(list, {
        id,
        title: existing?.titleSource === "ai" ? existing.title : fallbackTitle(messages),
        titleSource: existing?.titleSource ?? "fallback",
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        context,
        messages,
      });
    });
    if (!needsTitle || titling.current.has(id)) return;
    titling.current.add(id);
    const turns = messages
      .filter((m) => !m.content.startsWith("⚠️"))
      .slice(0, 4)
      .map((m) => ({ role: m.role, content: m.content.slice(0, 800) }));
    if (!turns.some((t) => t.role === "assistant")) { titling.current.delete(id); return; }
    generateChatTitle(turns).then((title) => {
      if (!title) { titling.current.delete(id); return; }
      setHistory((list) => list.map((c) => (c.id === id ? { ...c, title, titleSource: "ai" } : c)));
    });
  }, [status, messages, activeId, context, setHistory]);

  const openConversation = useCallback((id: string) => {
    const conv = history.find((c) => c.id === id);
    if (!conv) return;
    setPending(undefined);
    savedSig.current = sigOf(conv.id, conv.messages);
    restore(conv.messages);
    setContext(conv.context);
    setActiveId(conv.id);
  }, [history, restore]);

  const deleteConversation = useCallback((id: string) => {
    setHistory((list) => list.filter((c) => c.id !== id));
    if (id === activeId) newChat();
  }, [activeId, newChat, setHistory]);

  const clearHistory = useCallback(() => {
    setHistory([]);
    newChat();
  }, [newChat, setHistory]);

  const startAbout = useCallback((article: ArticleContext) => {
    newChat();
    setContext(article);
  }, [newChat]);

  const startWith = useCallback((question: string) => {
    if (!question.trim()) return;
    newChat();
    setPending(question.trim());
  }, [newChat]);

  const clearContext = useCallback(() => setContext(undefined), []);

  const value = useMemo<ChatValue>(() => ({
    messages, status, context, send, stop, newChat, clearContext, startAbout, startWith,
    history, activeId, openConversation, deleteConversation, clearHistory,
  }), [messages, status, context, send, stop, newChat, clearContext, startAbout, startWith, history, activeId, openConversation, deleteConversation, clearHistory]);

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat(): ChatValue {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
