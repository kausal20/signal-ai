// signal-ui-v2 · components/HeroCarousel.tsx
// ---------------------------------------------------------------------------
// Premium horizontal hero carousel. Spring-snap swipe with velocity detection,
// elastic overscroll, and depth: the centered card is full scale/opacity while
// side cards scale to 0.94, fade, and soft-blur. Animated dot indicator with a
// shared-layout active pill. Reduced-motion → static, dot-navigable. Additive,
// self-contained; renders whatever card nodes it's given.
// ---------------------------------------------------------------------------
import { useEffect, useRef, useState } from "react";
import {
  animate, motion as fm, useMotionValue, useTransform,
  useReducedMotion, type MotionValue,
} from "framer-motion";

export interface HeroCard {
  id: string;
  content: React.ReactNode;
}

interface Props {
  cards: HeroCard[];
  className?: string;
  ariaLabel?: string;
}

const SNAP = { type: "spring" as const, stiffness: 320, damping: 36, mass: 0.9 };

function CarouselItem({
  index, active, x, width, reduce, children,
}: { index: number; active: boolean; x: MotionValue<number>; width: number; reduce: boolean; children: React.ReactNode }) {
  const w = width || 1;
  const range = [-(index + 1) * w, -index * w, -(index - 1) * w];
  const scale = useTransform(x, range, [0.94, 1, 0.94], { clamp: true });
  const opacity = useTransform(x, range, [0.5, 1, 0.5], { clamp: true });
  const blur = useTransform(x, range, [5, 0, 5], { clamp: true });
  const filter = useTransform(blur, (b) => `blur(${b}px)`);

  return (
    <fm.div
      className="shrink-0 px-1"
      style={
        reduce
          ? { width }
          : { width, scale, opacity, filter, transformOrigin: "center" }
      }
    >
      <fm.div
        initial={reduce ? false : { opacity: 0, y: 10 }}
        animate={reduce ? undefined : { opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1], delay: index * 0.035 }}
        className="relative"
      >
        {children}
        {active && !reduce && (
          <fm.span
            key={`highlight-${index}`}
            aria-hidden
            initial={{ x: "-130%", opacity: 0 }}
            animate={{ x: "145%", opacity: [0, 0.45, 0] }}
            transition={{ duration: 0.72, ease: [0.22, 1, 0.36, 1], delay: 0.08 }}
            className="pointer-events-none absolute inset-y-0 -left-1/2 w-1/3 -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.11] to-transparent"
          />
        )}
      </fm.div>
    </fm.div>
  );
}

export function HeroCarousel({ cards, className, ariaLabel = "Featured" }: Props) {
  const reduce = useReducedMotion();
  const viewportRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [index, setIndex] = useState(0);
  const x = useMotionValue(0);
  const n = cards.length;

  // Measure the viewport width (card width) and keep it fresh on resize.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const measure = () => setWidth(el.clientWidth);
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Snap x to the active index whenever it (or width) changes.
  useEffect(() => {
    if (!width) return;
    const controls = animate(x, -index * width, reduce ? { duration: 0 } : SNAP);
    return controls.stop;
  }, [index, width, reduce, x]);

  const go = (i: number) => setIndex(Math.max(0, Math.min(n - 1, i)));

  return (
    <div className={className}>
      <div
        ref={viewportRef}
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === "ArrowRight") go(index + 1);
          if (event.key === "ArrowLeft") go(index - 1);
        }}
        className="relative overflow-hidden rounded-[24px] outline-none focus-visible:ring-2 focus-visible:ring-green/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
        role="group"
        aria-roledescription="carousel"
        aria-label={ariaLabel}
      >
        <fm.div
          className="flex"
          style={{ x }}
          drag={reduce ? false : "x"}
          dragConstraints={{ left: -(n - 1) * width, right: 0 }}
          dragElastic={0.16}
          dragMomentum={false}
          onDragEnd={(_, info) => {
            const { offset, velocity } = info;
            let next = index;
            if (offset.x < -width * 0.22 || velocity.x < -500) next = index + 1;
            else if (offset.x > width * 0.22 || velocity.x > 500) next = index - 1;
            go(next);
          }}
        >
          {cards.map((c, i) => (
            <CarouselItem key={c.id} index={i} active={i === index} x={x} width={width} reduce={!!reduce}>
              {c.content}
            </CarouselItem>
          ))}
        </fm.div>
      </div>

      {/* Dot indicator with shared-layout active pill */}
      {n > 1 && (
        <div className="mt-3.5 flex items-center justify-center gap-1.5" role="tablist" aria-label={`${ariaLabel} pagination`}>
          {cards.map((c, i) => {
            const on = i === index;
            return (
              <button
                key={c.id}
                type="button"
                role="tab"
                aria-selected={on}
                aria-label={`Go to card ${i + 1}`}
                onClick={() => go(i)}
                className="relative flex h-2 items-center"
              >
                <span className={`block h-1.5 rounded-full transition-all duration-300 ${on ? "w-6 bg-transparent" : "w-1.5 bg-white/20"}`} />
                {on && (
                  <fm.span
                    layoutId="hero-carousel-dot"
                    className="absolute inset-0 h-1.5 w-6 self-center rounded-full bg-green shadow-[0_0_10px_hsl(152_72%_48%/0.5)]"
                    transition={SNAP}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
