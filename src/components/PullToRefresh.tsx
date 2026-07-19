import { useRef, useState, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { motionTokens } from "@/ui-v2/animations/motion";

interface Props {
  onRefresh: () => Promise<void> | void;
  children: ReactNode;
}

const THRESHOLD = 70;
const MAX_PULL = 96;

// Rubber-band resistance: the further you pull, the more it resists, easing
// toward MAX_PULL asymptotically (native iOS feel). Pure transform math.
function resist(delta: number): number {
  if (delta <= 0) return 0;
  return MAX_PULL * (1 - Math.exp(-delta / MAX_PULL));
}

export function PullToRefresh({ onRefresh, children }: Props) {
  const startY = useRef<number | null>(null);
  const [pull, setPull] = useState(0);
  const [dragging, setDragging] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const reduce = useReducedMotion();

  const onTouchStart = (e: React.TouchEvent) => {
    if (window.scrollY > 0) return;
    startY.current = e.touches[0].clientY;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (startY.current === null) return;
    const delta = e.touches[0].clientY - startY.current;
    if (delta > 0) setPull(resist(delta));
  };
  const onTouchEnd = async () => {
    setDragging(false);
    if (pull >= THRESHOLD && !refreshing) {
      setRefreshing(true);
      try {
        await onRefresh();
      } finally {
        setRefreshing(false);
      }
    }
    setPull(0);
    startY.current = null;
  };

  // Drag progress 0→1 drives the indicator's rotation / scale / opacity.
  const pct = Math.min(pull / THRESHOLD, 1);
  const height = refreshing ? 44 : dragging ? pull : 0;
  const armed = pull >= THRESHOLD;

  return (
    <div onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>
      <fm.div
        className="flex items-center justify-center overflow-hidden text-xs font-mono text-muted-foreground"
        // Follow the finger 1:1 while dragging (no transition); spring back on release.
        animate={{ height }}
        transition={
          dragging || reduce
            ? { duration: 0 }
            : { type: "spring", stiffness: 420, damping: 34, mass: 0.7 }
        }
      >
        <span
          className="mr-1.5 flex"
          style={
            reduce
              ? undefined
              : {
                  // Icon tracks the drag: rotates + grows + fades in as you pull.
                  transform: `rotate(${pct * 270}deg) scale(${0.5 + pct * 0.5})`,
                  opacity: 0.25 + pct * 0.75,
                  willChange: "transform, opacity",
                }
          }
        >
          <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`} />
        </span>
        {refreshing ? "refreshing…" : armed ? "release to refresh" : "pull to refresh"}
      </fm.div>
      {children}
    </div>
  );
}
