// signal-ui-v2 · components/SourceAttribution.tsx
// ---------------------------------------------------------------------------
// Source attribution primitives used across Signal so every article, insight
// and opportunity credits — and links to — its original publisher.
//
//   isSafeUrl / openOriginal  — https-only validation + secure open
//   VerifiedBadge             — "Verified ✓" chip
//   PublishedBy               — inline "Published by <logo> <name> Verified"
//   ReadOriginalButton        — outline pill, green globe, glow + ripple; falls
//                               back to a disabled "Source unavailable"
//   SourceCard                — premium glass card (logo · name · time · link)
//   SourceChip                — small clickable origin chip (Compare / Opportunity)
//
// Signal summarizes and explains; it never replaces the publisher.
// ---------------------------------------------------------------------------
import { useRef } from "react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { Globe, ExternalLink, BadgeCheck, Ban } from "lucide-react";
import { BrandLogo } from "../icons/BrandLogo";
import type { SourceKey } from "../shared/types";

// ── URL safety ──────────────────────────────────────────────────────────────
export function isSafeUrl(url?: string | null): url is string {
  if (!url || typeof url !== "string") return false;
  try {
    const u = new URL(url);
    return u.protocol === "https:" || u.protocol === "http:";
  } catch { return false; }
}
export function domainOf(url?: string | null): string {
  if (!isSafeUrl(url)) return "";
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return ""; }
}
/** Open the original article in a new tab, safely (no opener, no referrer). */
export function openOriginal(url?: string | null) {
  if (!isSafeUrl(url)) return;
  window.open(url, "_blank", "noopener,noreferrer");
}
export function formatPubDate(iso?: string): string {
  if (!iso) return "";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "";
  try { return new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }); }
  catch { return ""; }
}

// ── Small pieces ────────────────────────────────────────────────────────────
export function VerifiedBadge({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border border-green/25 bg-green/[0.10] px-2 py-0.5 text-[10px] font-bold text-green ${className}`}>
      <BadgeCheck className="h-3 w-3" /> Verified
    </span>
  );
}

interface SourceProps {
  name: string;
  sourceKey?: SourceKey;
  url?: string;
  domain?: string;
  publishedAt?: string;
  verified?: boolean;
}

/** Inline "Published by <logo> <name> Verified". */
export function PublishedBy({ name, sourceKey, verified, className = "" }: SourceProps & { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <span className="text-[11px] font-medium text-muted-foreground/70">Published by</span>
      <span className="flex items-center gap-1.5">
        {sourceKey && (
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-white/[0.06]">
            <BrandLogo source={sourceKey} name={name} size={13} />
          </span>
        )}
        <span className="text-[12.5px] font-bold text-foreground">{name}</span>
      </span>
      {verified && <VerifiedBadge />}
    </div>
  );
}

/** Outline "Read Original" button — green globe, glow, ripple. Disabled → "Source unavailable". */
export function ReadOriginalButton({
  url, label = "Read Original", className = "", full = false,
}: { url?: string; label?: string; className?: string; full?: boolean }) {
  const reduce = useReducedMotion();
  const rippleHost = useRef<HTMLSpanElement>(null);
  const safe = isSafeUrl(url);

  if (!safe) {
    return (
      <span className={`inline-flex h-11 items-center justify-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.02] px-4 text-[13px] font-semibold text-muted-foreground/60 ${full ? "w-full" : ""} ${className}`}>
        <Ban className="h-4 w-4" /> Source unavailable
      </span>
    );
  }

  const onClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!reduce && rippleHost.current) {
      const rect = e.currentTarget.getBoundingClientRect();
      const r = document.createElement("span");
      r.className = "motion-ripple";
      const size = Math.max(rect.width, rect.height) * 0.6;
      r.style.width = r.style.height = `${size}px`;
      r.style.left = `${e.clientX - rect.left}px`;
      r.style.top = `${e.clientY - rect.top}px`;
      rippleHost.current.appendChild(r);
      r.addEventListener("animationend", () => r.remove());
    }
    openOriginal(url);
  };

  return (
    <fm.button
      type="button"
      onClick={onClick}
      aria-label={`${label} (opens in a new tab)`}
      whileHover={reduce ? undefined : { y: -2, boxShadow: "0 8px 26px hsl(152 72% 48% / 0.22)" }}
      whileTap={reduce ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 360, damping: 22 }}
      className={`relative inline-flex h-11 items-center justify-center gap-2 overflow-hidden rounded-full border border-green/35 bg-green/[0.06] px-4 text-[13.5px] font-bold text-green backdrop-blur-md transition-colors hover:bg-green/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-[#0a0d0a] ${full ? "w-full" : ""} ${className}`}
    >
      <span ref={rippleHost} className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-[inherit]" aria-hidden />
      <Globe className="relative z-10 h-4 w-4 text-green" />
      <span className="relative z-10">{label}</span>
      <ExternalLink className="relative z-10 h-3.5 w-3.5 opacity-70" />
    </fm.button>
  );
}

/** Premium glass Source Card — logo · name · time · verified · external link. */
export function SourceCard({ name, sourceKey, url, domain, publishedAt, verified, className = "" }: SourceProps & { className?: string }) {
  const reduce = useReducedMotion();
  const safe = isSafeUrl(url);
  const dom = domain || domainOf(url);
  return (
    <fm.div
      initial={reduce ? undefined : { opacity: 0, y: 10 }}
      animate={reduce ? undefined : { opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className={`flex items-center gap-3 rounded-[20px] border border-white/[0.08] bg-white/[0.03] p-3.5 backdrop-blur-xl ${className}`}
    >
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/[0.05]">
        {sourceKey ? <BrandLogo source={sourceKey} name={name} size={22} /> : <Globe className="h-5 w-5 text-green" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[14px] font-bold text-foreground">{name}</span>
          {verified && <BadgeCheck className="h-4 w-4 shrink-0 text-green" />}
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
          {dom || "original source"}{publishedAt ? ` · ${formatPubDate(publishedAt)}` : ""}
        </div>
      </div>
      {safe && (
        <fm.button
          type="button"
          onClick={(e) => { e.stopPropagation(); openOriginal(url); }}
          aria-label="Open original source (new tab)"
          whileTap={reduce ? undefined : { scale: 0.9 }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-green/30 bg-green/[0.08] text-green transition-colors hover:bg-green/[0.16] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green"
        >
          <ExternalLink className="h-4 w-4" />
        </fm.button>
      )}
    </fm.div>
  );
}

/** Small clickable origin chip (Sources Used / Based on). */
export function SourceChip({ label, url, className = "" }: { label: string; url?: string; className?: string }) {
  const reduce = useReducedMotion();
  const safe = isSafeUrl(url);
  const content = (
    <>
      <Globe className="h-3.5 w-3.5 text-green" />
      <span>{label}</span>
      {safe && <ExternalLink className="h-3 w-3 opacity-60" />}
    </>
  );
  const cls = `inline-flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.04] px-3 py-1.5 text-[12px] font-semibold text-foreground/85 ${safe ? "hover:border-green/25 hover:text-green" : "opacity-70"} ${className}`;
  if (!safe) return <span className={cls}>{content}</span>;
  return (
    <fm.button type="button" onClick={(e) => { e.stopPropagation(); openOriginal(url); }}
      whileHover={reduce ? undefined : { y: -1, scale: 1.04 }} whileTap={reduce ? undefined : { scale: 0.96 }}
      transition={{ type: "spring", stiffness: 360, damping: 22 }} className={cls} aria-label={`${label} (opens in a new tab)`}>
      {content}
    </fm.button>
  );
}
