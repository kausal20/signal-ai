// signal-ui-v2 · icons/BrandLogo.tsx
// Bundled real brand marks. The app does not depend on runtime favicon/CDN
// requests for these source logos.
import { useState } from "react";
import { useReducedMotion } from "framer-motion";
import { BRAND_LOGOS } from "@/lib/brandLogos";
import type { SourceKey } from "../shared/types";

interface Props {
  source: SourceKey;
  /** Fallback display name used for the monogram when no logo resolves. */
  name?: string;
  size?: number;
  className?: string;
}

export function BrandLogo({ source, name, size = 18, className = "" }: Props) {
  const logo = BRAND_LOGOS[source];
  const reduce = useReducedMotion();
  const [loaded, setLoaded] = useState(false);

  if (logo) {
    // Fade in once decoded so bundled logos never pop into view. Opacity only
    // (GPU-cheap); reduced-motion shows it immediately.
    const shown = reduce || loaded;
    return (
      <img
        // If the asset is already cached, `complete` is true before onLoad can
        // fire — resolve immediately so it never stays invisible.
        ref={(el) => { if (el?.complete && el.naturalWidth > 0) setLoaded(true); }}
        src={logo}
        width={size}
        height={size}
        alt={name ?? source}
        decoding="async"
        onLoad={() => setLoaded(true)}
        className={className}
        style={{
          width: size,
          height: size,
          objectFit: "contain",
          opacity: shown ? 0.94 : 0,
          transition: reduce ? undefined : "opacity 220ms cubic-bezier(0.22,1,0.36,1)",
        }}
      />
    );
  }

  const label = (name ?? source).slice(0, 1).toUpperCase();
  return (
    <span
      className={className}
      style={{ width: size, height: size, fontSize: size * 0.6 }}
      aria-label={name ?? source}
      role="img"
    >
      <span className="flex h-full w-full items-center justify-center font-bold text-foreground/80">{label}</span>
    </span>
  );
}
