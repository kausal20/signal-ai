// Saved Signal AI conversations — on this device only (localStorage), never
// sent to the profile. Capped so storage stays small.

import type { AskMessage } from "@/hooks/useAskSignal";
import type { ArticleContext } from "@/lib/askSignal";

export const HISTORY_KEY = "signal:conversations";
const MAX_CONVERSATIONS = 30;
const MAX_MESSAGES = 40;

export interface SavedConversation {
  id: string;
  title: string;
  /** "ai" once the model has named it; "fallback" = first question, until then. */
  titleSource: "ai" | "fallback";
  createdAt: string;
  updatedAt: string;
  context?: ArticleContext;
  messages: AskMessage[];
}

export const newConversationId = () => `c_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** First question, trimmed to a readable length — shown until the AI title arrives. */
export function fallbackTitle(messages: AskMessage[]): string {
  const first = messages.find((m) => m.role === "user")?.content.replace(/\s+/g, " ").trim() ?? "Conversation";
  return first.length > 52 ? `${first.slice(0, 52).replace(/\s+\S*$/, "")}…` : first;
}

/** Insert or replace a conversation, newest first, within the caps. */
export function upsertConversation(list: SavedConversation[], conv: SavedConversation): SavedConversation[] {
  const trimmed = { ...conv, messages: conv.messages.slice(-MAX_MESSAGES).map((m) => ({ ...m, streaming: false })) };
  return [trimmed, ...list.filter((c) => c.id !== conv.id)]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, MAX_CONVERSATIONS);
}
