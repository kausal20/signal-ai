import { useEffect, useState } from "react";
import { AlertCircle } from "lucide-react";
import type { FeedItem } from "@/data/feed";

interface Props {
  items: FeedItem[];
  onOpen?: (item: FeedItem) => void;
}

export function BreakingAlert({ items, onOpen }: Props) {
  const breaking = items
    .filter((i) => i.impact === "critical" && i.score >= 90)
    .sort((a, b) => b.score - a.score)[0];

  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem("signal:breaking:dismissed")); } catch { /* ignore */ }
  }, []);

  if (!breaking || dismissed === breaking.id) return null;

  const dismiss = () => {
    try { sessionStorage.setItem("signal:breaking:dismissed", breaking.id); } catch { /* ignore */ }
    setDismissed(breaking.id);
  };

  return (
    <a
      href={breaking.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => { onOpen?.(breaking); e.stopPropagation(); }}
      className="group block mb-6 glass-card overflow-hidden animate-fade-up"
      style={{ borderColor: "hsl(var(--green) / 0.2)" }}
    >
      <div className="p-4 flex items-start gap-3">
        <div className="shrink-0 mt-0.5 w-7 h-7 rounded-lg bg-green/10 flex items-center justify-center">
          <AlertCircle className="w-3.5 h-3.5 text-green" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-green mb-1">
            Breaking Signal
          </p>
          <p className="text-sm font-semibold text-foreground leading-snug line-clamp-2">
            {breaking.title}
          </p>
        </div>
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); dismiss(); }}
          className="text-muted-foreground hover:text-foreground p-1.5 -m-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
          aria-label="Dismiss"
        >
          ✕
        </button>
      </div>
    </a>
  );
}
