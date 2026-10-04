import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { EASE } from "../motion";

interface Props {
  src: string;
  /** Decorative by default — the headline next to it carries the meaning. */
  alt?: string;
  /** Tailwind aspect utility, e.g. "aspect-[16/10]". Reserves space → no layout shift. */
  aspect?: string;
  priority?: boolean;
  className?: string;
  onFail?: () => void;
}

/** A real publisher image. Reserves its box, fades in on load, hides itself
 *  (and tells the parent) if the publisher's CDN refuses or the file is gone —
 *  the layout then falls back to typography; we never swap in a stock image. */
export function StoryImage({ src, alt = "", aspect = "aspect-[16/10]", priority, className, onFail }: Props) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const ref = useRef<HTMLImageElement>(null);

  useEffect(() => { setLoaded(false); setFailed(false); }, [src]);
  // Cached images can finish before React attaches onLoad.
  useEffect(() => { if (ref.current?.complete && ref.current.naturalWidth > 0) setLoaded(true); }, [src]);

  if (failed) return null;
  return (
    <div className={cn("relative overflow-hidden bg-ed-sunken", aspect, className)}>
      <motion.img
        ref={ref}
        src={src}
        alt={alt}
        loading={priority ? "eager" : "lazy"}
        decoding="async"
        referrerPolicy="no-referrer"
        onLoad={() => setLoaded(true)}
        onError={() => { setFailed(true); onFail?.(); }}
        // Develops into place: a soft fade with a slight settle from 104% scale.
        initial={false}
        animate={loaded ? { opacity: 1, scale: 1 } : { opacity: 0, scale: 1.04 }}
        transition={{ duration: 0.6, ease: EASE }}
        className="absolute inset-0 h-full w-full object-cover"
      />
    </div>
  );
}
