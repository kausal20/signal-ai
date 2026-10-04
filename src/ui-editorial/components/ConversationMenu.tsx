import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Plus, Trash2 } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { formatTimeAgo } from "@/adapters/homeV2";
import { EASE, itemV, listV } from "../motion";

export interface ConversationSummary { id: string; title: string; updatedAt: string }

interface Props {
  conversations: ConversationSummary[];
  activeId?: string;
  onOpen: (id: string) => void;
  onDelete: (id: string) => void;
  onNew: () => void;
}

/** Three-dot button → past conversations on this device, titled by the AI. */
export function ConversationMenu({ conversations, activeId, onOpen, onDelete, onNew }: Props) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    // Not positioned itself: the panel anchors to the parent group's right edge
    // (the header's button row), so it never runs off the left of the screen.
    <div ref={wrap}>
      <motion.button
        type="button"
        whileTap={{ scale: 0.92 }}
        transition={{ duration: 0.12, ease: EASE }}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Past conversations"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-11 w-11 items-center justify-center rounded-lg border transition-colors",
          open ? "border-ed-text-3 bg-ed-sunken text-ed-text" : "border-ed-border-strong text-ed-text-2 hover:border-ed-text-3 hover:text-ed-text",
        )}
      >
        <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Past conversations"
            initial={{ opacity: 0, scale: 0.97, y: -6 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: -4, transition: { duration: 0.12 } }}
            transition={{ duration: 0.2, ease: EASE }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-full z-30 mt-2 w-[min(360px,calc(100vw-40px))] overflow-hidden rounded-xl border border-ed-border bg-ed-surface shadow-[0_18px_40px_-20px_rgb(0_0_0/0.35)]"
          >
            <button
              type="button"
              onClick={() => { setOpen(false); onNew(); }}
              className="flex min-h-12 w-full items-center gap-2.5 border-b border-ed-border px-4 py-3 text-left text-[15px] font-semibold text-ed-text transition-colors hover:bg-ed-sunken"
            >
              <Plus className="h-4 w-4 text-ed-accent" aria-hidden="true" />
              New conversation
            </button>
            <p className="ed-eyebrow border-b border-ed-border px-4 py-3">Past conversations</p>
            {conversations.length === 0 ? (
              <p className="px-4 py-5 text-[14.5px] leading-relaxed text-ed-text-2">
                No past conversations yet. They’ll appear here after you ask Signal something.
              </p>
            ) : (
              <motion.ul variants={listV} initial="hidden" animate="show" className="max-h-[min(60vh,420px)] overflow-y-auto overscroll-contain py-1">
                <AnimatePresence initial={false}>
                  {conversations.map((c) => (
                    <motion.li key={c.id} layout="position" variants={itemV} exit="exit" className="group flex items-center">
                      <button
                        type="button"
                        onClick={() => { onOpen(c.id); setOpen(false); }}
                        aria-current={c.id === activeId ? "true" : undefined}
                        className={cn(
                          "flex min-h-[56px] min-w-0 flex-1 flex-col justify-center py-2 pl-4 pr-2 text-left transition-colors hover:bg-ed-sunken",
                          c.id === activeId && "bg-ed-sunken",
                        )}
                      >
                        <span className={cn("truncate text-[15px] leading-snug text-ed-text", c.id === activeId ? "font-semibold" : "font-medium")}>{c.title}</span>
                        <span className="mt-0.5 text-[12px] text-ed-text-2">{formatTimeAgo(c.updatedAt)}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDelete(c.id)}
                        aria-label={`Delete “${c.title}”`}
                        className="mr-1 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-ed-text-3 transition-colors hover:bg-ed-sunken hover:text-ed-negative"
                      >
                        <Trash2 className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </motion.ul>
            )}
            <p className="border-t border-ed-border px-4 py-2.5 text-[12px] text-ed-text-2">Saved on this device only.</p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
