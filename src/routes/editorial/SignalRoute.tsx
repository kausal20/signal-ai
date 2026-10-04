import { useEffect, useRef } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useChat } from "@/app/ChatProvider";
import type { ArticleContext } from "@/lib/askSignal";
import { SignalPage } from "@/ui-editorial/pages/SignalPage";
import { questionsFor, STARTER_PROMPTS } from "./shared";

/** `/signal` — the one conversational AI. Entry points (a story, a search, a
 *  prompt from the library) pass what to start with via route state, which is
 *  consumed once and then cleared so a refresh doesn't replay it. */
export default function SignalRoute() {
  const chat = useChat();
  const navigate = useNavigate();
  const { state, pathname } = useLocation();
  const handled = useRef<unknown>(null);

  useEffect(() => {
    const s = state as { article?: ArticleContext; seed?: string } | null;
    if (!s || handled.current === s) return;
    if (s.article) { handled.current = s; chat.startAbout(s.article); }
    else if (s.seed) { handled.current = s; chat.startWith(s.seed); }
    else return;
    navigate(pathname, { replace: true, state: null });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  const ctx = chat.context;
  return (
    <SignalPage
      messages={chat.messages}
      status={chat.status}
      context={ctx ? { headline: ctx.headline, source: ctx.publisher, image: ctx.image_url, questions: questionsFor(ctx) } : undefined}
      suggestions={STARTER_PROMPTS}
      onSend={chat.send}
      onStop={chat.stop}
      onNewChat={chat.newChat}
      onClearContext={chat.clearContext}
      history={chat.history.map((c) => ({ id: c.id, title: c.title, updatedAt: c.updatedAt }))}
      activeId={chat.activeId}
      onOpenConversation={chat.openConversation}
      onDeleteConversation={chat.deleteConversation}
    />
  );
}
