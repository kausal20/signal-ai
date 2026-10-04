import { useId } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { EdTopic } from "../types";

interface Props {
  topics: EdTopic[];
  active: string;
  onSelect: (id: string) => void;
  label?: string;
  className?: string;
}

/** Restrained, text-first topic switcher: an underlined tab strip, not a row of
 *  coloured pills. Selected = dark text + a short signal-green underline. */
export function TopicSelector({ topics, active, onSelect, label = "Topics", className }: Props) {
  const reduce = useReducedMotion();
  const uid = useId();
  return (
    <div
      role="group"
      aria-label={label}
      className={cn("no-scrollbar -mx-5 overflow-x-auto border-b border-ed-border px-5 md:-mx-8 md:px-8 lg:mx-0 lg:px-0", className)}
    >
      <div className="flex min-w-max gap-1">
        {topics.map((t, i) => {
          const isActive = t.id === active;
          const first = i === 0;
          return (
            <button
              key={t.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => onSelect(t.id)}
              className={cn(
                "relative h-11 whitespace-nowrap pr-3 text-[14.5px] transition-colors",
                first ? "pl-0" : "pl-3",
                isActive ? "font-semibold text-ed-text" : "font-medium text-ed-text-2 hover:text-ed-text",
              )}
            >
              {t.label}
              {isActive && (
                <motion.span
                  layoutId={`ed-topic-${uid}`}
                  aria-hidden="true"
                  transition={reduce ? { duration: 0 } : { type: "tween", duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
                  className={cn("absolute -bottom-px right-3 h-[2px] rounded-full bg-ed-accent", first ? "left-0" : "left-3")}
                />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
