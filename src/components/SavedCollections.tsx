import { useState } from "react";
import { Wrench, Workflow, FileText, Lightbulb, Newspaper, Bookmark, ChevronDown } from "lucide-react";
import { FeedCard } from "@/components/FeedCard";
import type { FeedItem, FeedTag } from "@/data/feed";

interface Props {
  items: FeedItem[];                 // already filtered to saved
  bookmarks: string[];
  onToggleBookmark: (id: string) => void;
}

const COLLECTIONS: { id: FeedTag | "research"; label: string; sub: string; icon: React.ReactNode; match: (i: FeedItem) => boolean }[] = [
  { id: "tool", label: "AI Tools", sub: "Apps & repos to try", icon: <Wrench className="w-4 h-4" />, match: (i) => i.tag === "tool" },
  { id: "use-case", label: "Workflows", sub: "Systems to copy", icon: <Workflow className="w-4 h-4" />, match: (i) => i.tag === "use-case" },
  { id: "prompt", label: "Prompts", sub: "Playbooks", icon: <FileText className="w-4 h-4" />, match: (i) => i.tag === "prompt" },
  { id: "research", label: "Research", sub: "Papers & models", icon: <Lightbulb className="w-4 h-4" />, match: (i) => i.source === "arxiv" || i.category === "models" },
  { id: "news", label: "Business & News", sub: "Market & founder signal", icon: <Newspaper className="w-4 h-4" />, match: (i) => i.tag === "news" },
];

export function SavedCollections({ items, bookmarks, onToggleBookmark }: Props) {
  if (items.length === 0) {
    return (
      <div className="py-16 text-center animate-scale-in">
        <div className="w-16 h-16 mx-auto mb-5 rounded-3xl green-halo flex items-center justify-center">
          <Bookmark className="w-7 h-7 text-green" />
        </div>
        <h3 className="text-lg font-bold mb-2">Build your collection</h3>
        <p className="text-sm text-muted-foreground max-w-[260px] mx-auto leading-relaxed">
          Bookmark tools, workflows, prompts, and ideas. Signal organizes them into collections automatically.
        </p>
      </div>
    );
  }

  // Assign each item to the first matching collection (dedupe).
  const used = new Set<string>();
  const groups = COLLECTIONS.map((c) => {
    const list = items.filter((i) => !used.has(i.id) && c.match(i));
    list.forEach((i) => used.add(i.id));
    return { ...c, list };
  }).filter((g) => g.list.length > 0);

  return (
    <div className="space-y-4">
      {groups.map((g, gi) => (
        <Collection key={g.id} label={g.label} sub={g.sub} icon={g.icon} count={g.list.length} defaultOpen={gi === 0}>
          <div className="space-y-3 pt-3">
            {g.list.map((item, i) => (
              <FeedCard key={item.id} item={item} index={i} bookmarked={bookmarks.includes(item.id)} onToggleBookmark={onToggleBookmark} />
            ))}
          </div>
        </Collection>
      ))}
    </div>
  );
}

function Collection({ label, sub, icon, count, defaultOpen, children }: {
  label: string; sub: string; icon: React.ReactNode; count: number; defaultOpen?: boolean; children: React.ReactNode;
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <section className="premium-card overflow-hidden animate-scale-in">
      <button onClick={() => setOpen((v) => !v)} className="w-full flex items-center gap-3 p-4 text-left pressable">
        <span className="w-10 h-10 rounded-2xl bg-green/10 border border-green/20 text-green flex items-center justify-center shrink-0">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-bold text-foreground">{label}</span>
          <span className="block text-[11px] text-muted-foreground">{sub}</span>
        </span>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[11px] font-bold text-muted-foreground">{count}</span>
        <ChevronDown className={`w-4 h-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="px-3 pb-3 border-t border-white/[0.04]">{children}</div>}
    </section>
  );
}
