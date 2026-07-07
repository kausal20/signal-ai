// signal-ui-v2 · icons/BrandLogo.tsx
// Bundled real brand marks. The app does not depend on runtime favicon/CDN
// requests for these source logos.
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

  if (logo) {
    return (
      <img
        src={logo}
        width={size}
        height={size}
        alt={name ?? source}
        className={className}
        style={{ width: size, height: size, objectFit: "contain", opacity: 0.94 }}
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
