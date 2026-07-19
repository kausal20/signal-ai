// signal-ui-v2 · components/AiIntelligenceButton.tsx
// ---------------------------------------------------------------------------
// The flagship "✨ AI Insights" pill. Self-contained: owns the lazy request and
// the premium bottom sheet, so dropping it into a card adds the whole feature
// without touching that card's data flow. Insights generate ONLY on click.
// Height/width come from `className` so it can sit flush beside "Read Story".
// ---------------------------------------------------------------------------
import { useCallback, useState } from "react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { useNewsIntelligence, type IntelligenceArticle } from "@/hooks/useNewsIntelligence";
import { NewsIntelligenceSheet } from "./NewsIntelligenceSheet";

interface Props {
  article: IntelligenceArticle;
  /** Layout/size classes (e.g. `h-[46px] flex-1`). */
  className?: string;
}

export function AiIntelligenceButton({ article, className }: Props) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const { status, data, error, generate } = useNewsIntelligence();

  const openSheet = useCallback(() => {
    setOpen(true);
    generate(article);
  }, [generate, article]);
  const close = useCallback(() => setOpen(false), []);
  const retry = useCallback(() => generate(article), [generate, article]);

  return (
    <>
      <fm.button
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label="Open Signal Analysis"
        onClick={openSheet}
        whileHover={reduce ? undefined : { scale: 1.03, y: -1 }}
        whileTap={reduce ? undefined : { scale: 0.97 }}
        transition={{ type: "spring", stiffness: 360, damping: 22 }}
        className={[
          "group relative inline-flex items-center justify-center gap-1.5 overflow-hidden whitespace-nowrap rounded-full px-5",
          "text-[14px] font-bold text-green",
          "border border-green/40 bg-[linear-gradient(120deg,hsl(152_72%_48%/0.18),hsl(152_72%_48%/0.06))]",
          "shadow-[0_0_20px_hsl(152_72%_48%/0.18),inset_0_1px_0_hsl(152_72%_60%/0.25)] backdrop-blur-md",
          "transition-colors hover:bg-[linear-gradient(120deg,hsl(152_72%_48%/0.26),hsl(152_72%_48%/0.10))]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-black",
          className ?? "",
        ].join(" ")}
      >
        {/* Tiny animated glow sweep across the pill */}
        {!reduce && (
          <fm.span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 -left-full w-1/2 skew-x-[-20deg] bg-[linear-gradient(90deg,transparent,hsl(152_72%_60%/0.28),transparent)]"
            animate={{ left: ["-60%", "160%"] }}
            transition={{ duration: 3.4, repeat: Infinity, ease: "easeInOut", repeatDelay: 1.2 }}
          />
        )}
        <Sparkles className="relative h-4 w-4" />
        <span className="relative">Signal Analysis</span>
      </fm.button>

      <NewsIntelligenceSheet
        open={open}
        onClose={close}
        onRetry={retry}
        status={status}
        data={data}
        error={error}
        articleTitle={article.title}
        source={{ name: article.source, sourceKey: article.sourceKey as any, url: article.url, verified: article.verified }}
      />
    </>
  );
}
