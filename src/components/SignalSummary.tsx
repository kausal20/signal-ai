import type { FeedItem } from "@/data/feed";

interface Props {
  items: FeedItem[];
}

export function SignalSummary({ items }: Props) {
  if (items.length === 0) return null;
  const sources = new Set(items.map((i) => i.source)).size;
  const highSignal = items.filter((i) => (i.score ?? 0) >= 70).length;

  return (
    <div className="glass-card p-4 mb-8 animate-fade-up" style={{ animationDelay: "80ms" }}>
      <div className="grid grid-cols-3 gap-4 text-center">
        <div>
          <div className="text-2xl font-bold tracking-tight font-mono-tight text-foreground">{items.length}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">Analyzed</div>
        </div>
        <div>
          <div className="text-2xl font-bold tracking-tight font-mono-tight text-foreground">{sources}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">Sources</div>
        </div>
        <div>
          <div className="text-2xl font-bold tracking-tight font-mono-tight text-green">{highSignal}</div>
          <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mt-0.5">High Signal</div>
        </div>
      </div>
    </div>
  );
}
