import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useAnimationFrame, useInView, useReducedMotion } from "framer-motion";
import { ArrowUpRight, X } from "lucide-react";
import type { EdStory } from "../types";
import { EASE, press } from "../motion";
import { SignalGlyph } from "./SignalMark";
import { SaveButton } from "./controls";
import { SourceIdentity } from "./SourceIdentity";

interface Props {
  stories: EdStory[];
  onOpen: (story: EdStory) => void;
  onAsk: (story: EdStory) => void;
  onToggleSave: (story: EdStory) => void;
}

export function TodayBrief({ stories, onOpen, onAsk, onToggleSave }: Props) {
  const [selected, setSelected] = useState<string | null>(null);
  const [touching, setTouching] = useState(false);
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const section = useRef<HTMLElement>(null);
  const viewport = useRef<HTMLDivElement>(null);
  const group = useRef<HTMLDivElement>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const trigger = useRef<HTMLButtonElement | null>(null);
  const distance = useRef(0);
  const position = useRef(0);
  const inView = useInView(section, { amount: 0.2 });
  const reduce = useReducedMotion();
  const briefs = stories.filter((item, index) => stories.findIndex((candidate) => candidate.id === item.id) === index).slice(0, 5);
  const story = briefs.find((item) => item.id === selected);
  const loop = briefs.length > 1;
  const running = loop && !touching && !focused && !hovered && !story && inView;

  useEffect(() => {
    const element = group.current;
    if (!element) return;
    const observer = new ResizeObserver(() => { distance.current = element.getBoundingClientRect().width; });
    observer.observe(element);
    return () => observer.disconnect();
  }, [briefs.length]);

  useEffect(() => {
    if (selected) closeButton.current?.focus({ preventScroll: true });
  }, [selected]);

  useAnimationFrame((_, delta) => {
    if (!running || document.hidden || !viewport.current || !distance.current) return;
    position.current = (position.current + Math.min(delta, 64) * 0.022) % distance.current;
    viewport.current.scrollLeft = position.current;
  });

  const close = () => {
    setSelected(null);
    trigger.current?.focus({ preventScroll: true });
  };

  if (!briefs.length) return null;

  const cards = (copy: boolean) => briefs.map((item) => (
    <motion.button
      key={item.id}
      {...press}
      type="button"
      tabIndex={copy ? -1 : 0}
      aria-expanded={selected === item.id}
      aria-controls="expanded-brief"
      onClick={(event) => { trigger.current = event.currentTarget; setSelected(item.id); }}
      className="flex h-[158px] w-[220px] shrink-0 flex-col rounded-xl border border-ed-border-strong bg-ed-surface p-3.5 text-left transition-colors hover:border-ed-accent/50"
    >
      <span className="flex w-full items-center justify-between gap-2">
        <span className="ed-eyebrow text-ed-accent-ink">{item.kicker || "News"}</span>
        <ArrowUpRight className="h-4 w-4 text-ed-text-3" aria-hidden="true" />
      </span>
      <span className="ed-serif mt-2 line-clamp-3 text-[19px] font-medium leading-[1.2] tracking-[-0.01em] text-ed-text">{item.title}</span>
      <span className="mt-auto flex w-full items-center gap-1 pt-2 text-[11px] text-ed-text-3"><SourceIdentity story={item} className="min-w-0" />{item.timeAgo && <span className="shrink-0"> · {item.timeAgo}</span>}</span>
    </motion.button>
  ));

  return (
    <section ref={section} aria-labelledby="today-brief-heading" className="mt-8">
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="ed-eyebrow mb-1 text-ed-accent-ink">The quick read</p>
          <h2 id="today-brief-heading" className="ed-serif text-[27px] font-semibold leading-tight tracking-[-0.02em] text-ed-text">Today’s Brief</h2>
        </div>
      </div>
      <div
        ref={viewport}
        aria-label="Today’s brief stories"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        onPointerDown={() => setTouching(true)}
        onPointerUp={() => setTouching(false)}
        onPointerCancel={() => setTouching(false)}
        onPointerLeave={() => setTouching(false)}
        onFocusCapture={() => setFocused(true)}
        onBlurCapture={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setFocused(false); }}
        onScroll={() => { if (!running && viewport.current) position.current = viewport.current.scrollLeft; }}
        className="-mx-5 overflow-x-auto pb-2 md:-mx-8 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex w-max">
          <div ref={group} className="flex gap-3 pr-3">{cards(false)}</div>
          {loop && <div aria-hidden="true" className="flex gap-3 pr-3">{cards(true)}</div>}
        </div>
      </div>
      <p className="mt-2 text-[12px] text-ed-text-3">Tap a story for the brief</p>
      <div id="expanded-brief">
        <AnimatePresence initial={false}>
          {story && <motion.article
            key={story.id}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: reduce ? 0 : 0.24, ease: EASE }}
            onKeyDown={(event) => { if (event.key === "Escape") close(); }}
            className="overflow-hidden"
          >
            <div className="mt-4 rounded-2xl border border-ed-accent/30 bg-ed-surface p-5">
              <div className="mb-3 flex items-center justify-between gap-2">
                <span className="flex items-center gap-2 text-[12px] font-semibold text-ed-accent-ink"><SignalGlyph className="h-4 w-4" /> Signal AI Summary</span>
                <button ref={closeButton} type="button" onClick={close} aria-label="Close expanded brief" className="-mr-2 flex h-11 w-11 items-center justify-center rounded-full text-ed-text-2 hover:bg-ed-sunken"><X className="h-4 w-4" /></button>
              </div>
              <h3 className="ed-serif text-[26px] font-medium leading-[1.2] tracking-[-0.015em] text-ed-text">{story.title}</h3>
              <p className="mt-3 line-clamp-3 text-[15px] leading-relaxed text-ed-text-2">{story.deck || "A summary isn’t available yet. Read the source or ask Signal for more context."}</p>
              <p className="mt-3 text-[12px] text-ed-text-3"><SourceIdentity story={story} />{story.timeAgo ? ` · ${story.timeAgo}` : ""}</p>
              <div className="mt-4 flex flex-wrap items-center gap-3">
                {story.url && <a href={story.url} target="_blank" rel="noopener noreferrer" onClick={() => onOpen(story)} className="inline-flex min-h-11 items-center gap-1 rounded-lg border border-ed-border-strong px-3 text-[13px] font-semibold text-ed-text hover:bg-ed-sunken">Source <ArrowUpRight className="h-4 w-4" aria-hidden="true" /></a>}
                <motion.button {...press} type="button" onClick={() => onAsk(story)} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-ed-accent-ink px-3 text-[13px] font-semibold text-ed-on-accent"><SignalGlyph className="h-4 w-4" /> Signal AI</motion.button>
                <SaveButton saved={story.saved} onToggle={() => onToggleSave(story)} title={story.title} className="ml-auto" />
              </div>
            </div>
          </motion.article>}
        </AnimatePresence>
      </div>
    </section>
  );
}
