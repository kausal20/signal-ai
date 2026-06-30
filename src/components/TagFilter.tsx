import { TAGS, type FeedTag } from "@/data/feed";
import { cn } from "@/lib/utils";

interface Props {
  selected: FeedTag | "all";
  onChange: (tag: FeedTag | "all") => void;
}

export function TagFilter({ selected, onChange }: Props) {
  const all = [{ id: "all" as const, label: "All" }, ...TAGS];
  return (
    <div className="flex items-center gap-1 p-1 rounded-lg border border-border bg-card/50 overflow-x-auto">
      {all.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(t.id)}
          className={cn(
            "text-xs font-medium px-3 py-1.5 rounded-md whitespace-nowrap transition-all duration-200 ease-base",
            selected === t.id
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
