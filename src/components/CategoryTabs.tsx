interface Props {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TABS = [
  { id: "all", label: "All" },
  { id: "tool", label: "Tools" },
  { id: "prompt", label: "Prompts" },
  { id: "news", label: "News" },
  { id: "use-case", label: "Use Cases" },
];

export function CategoryTabs({ activeTab, onTabChange }: Props) {
  return (
    <div className="mb-6 animate-fade-up" style={{ animationDelay: "120ms" }}>
      <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                isActive
                  ? "bg-green text-black"
                  : "bg-white/[0.04] text-muted-foreground hover:text-foreground hover:bg-white/[0.07] border border-white/[0.06]"
              }`}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
