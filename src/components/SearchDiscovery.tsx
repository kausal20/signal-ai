import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeft,
  Bot,
  BriefcaseBusiness,
  ChevronDown,
  Code2,
  FileText,
  Lightbulb,
  Mic,
  Newspaper,
  Rocket,
  Search,
  Sparkles,
  Workflow,
  X,
  Zap,
} from "lucide-react";
import { FeedCard } from "@/components/FeedCard";
import type { FeedItem } from "@/data/feed";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { cn } from "@/lib/utils";

interface SearchDiscoveryProps {
  query: string;
  results: FeedItem[];
  bookmarks: string[];
  onBack: () => void;
  onQueryChange: (query: string) => void;
  onToggleBookmark: (id: string) => void;
}

type ResultGroupId = "news" | "tools" | "workflows" | "prompts" | "research";

interface ResultGroup {
  id: ResultGroupId;
  title: string;
  eyebrow: string;
  icon: React.ReactNode;
  items: FeedItem[];
}

// Exported so the ui-v2 SearchPage (P3) reuses the same trending list instead of
// duplicating it. Old SearchDiscovery keeps using it unchanged.
export const trendingSearches = [
  "GPT-5.5",
  "Claude Code",
  "Cursor",
  "Gemini CLI",
  "MCP",
  "AI Agents",
  "Veo",
  "OpenAI API",
  "Anthropic",
  "Hugging Face",
];

const exploreCards = [
  { title: "News", query: "AI news", subtitle: "Launches, model drops, market moves", icon: Newspaper },
  { title: "AI Tools", query: "AI tools", subtitle: "Fresh apps, repos, and workflows", icon: Sparkles },
  { title: "Workflows", query: "automation workflow", subtitle: "Practical systems you can copy", icon: Workflow },
  { title: "Prompts", query: "prompt", subtitle: "High-signal prompts and playbooks", icon: FileText },
  { title: "Research", query: "research", subtitle: "Papers, benchmarks, and model shifts", icon: Lightbulb },
  { title: "Startups", query: "startup", subtitle: "New companies and breakout ideas", icon: Rocket },
  { title: "Business Ideas", query: "business idea", subtitle: "Opportunities hiding in the feed", icon: BriefcaseBusiness },
  { title: "AI Agents", query: "AI agents", subtitle: "Autonomous tools and agent stacks", icon: Bot },
];

export const featuredCollections = [
  {
    title: "Best AI Coding Tools",
    description: "Editors, agents, CLIs, and repos builders are adopting now.",
    query: "AI coding tools",
    image: "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=700&q=80",
    gradient: "from-emerald-500/70 via-cyan-500/40 to-transparent",
  },
  {
    title: "Build AI Startup",
    description: "Markets, launch signals, and product gaps worth exploring.",
    query: "AI startup",
    image: "https://images.unsplash.com/photo-1559136555-9303baea8ebd?auto=format&fit=crop&w=700&q=80",
    gradient: "from-lime-500/70 via-amber-400/35 to-transparent",
  },
  {
    title: "AI Agents",
    description: "Agent frameworks, MCP workflows, and automation patterns.",
    query: "AI agents",
    image: "https://images.unsplash.com/photo-1518770660439-4636190af475?auto=format&fit=crop&w=700&q=80",
    gradient: "from-green-500/70 via-sky-500/40 to-transparent",
  },
  {
    title: "Voice AI",
    description: "Realtime voice apps, speech models, and audio workflows.",
    query: "voice AI",
    image: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=700&q=80",
    gradient: "from-teal-400/70 via-fuchsia-500/35 to-transparent",
  },
  {
    title: "AI Video",
    description: "Video generation, editing models, and creator pipelines.",
    query: "AI video",
    image: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?auto=format&fit=crop&w=700&q=80",
    gradient: "from-emerald-400/70 via-purple-500/35 to-transparent",
  },
  {
    title: "Research Papers",
    description: "Model papers, benchmarks, evals, and open research.",
    query: "research papers",
    image: "https://images.unsplash.com/photo-1453733190371-0a9bedd82893?auto=format&fit=crop&w=700&q=80",
    gradient: "from-green-500/70 via-blue-500/35 to-transparent",
  },
];

const recommended = [
  { name: "Cursor", query: "Cursor", domain: "cursor.com", note: "AI coding workspace" },
  { name: "Claude Code", query: "Claude Code", domain: "anthropic.com", note: "Agentic coding CLI" },
  { name: "Lovable", query: "Lovable", domain: "lovable.dev", note: "Prompt-to-app builder" },
  { name: "OpenAI", query: "OpenAI", domain: "openai.com", note: "Models and APIs" },
  { name: "ElevenLabs", query: "ElevenLabs", domain: "elevenlabs.io", note: "Voice AI platform" },
  { name: "MCP", query: "MCP", domain: "modelcontextprotocol.io", note: "Tool context standard" },
];

const groupOrder: ResultGroupId[] = ["news", "tools", "prompts", "research", "workflows"];

function classifyResult(item: FeedItem): ResultGroupId {
  if (item.tag === "tool") return "tools";
  if (item.tag === "prompt") return "prompts";
  if (item.source === "arxiv" || item.category === "models") return "research";
  if (item.tag === "use-case" || item.category === "automation") return "workflows";
  return "news";
}

function sectionMeta(id: ResultGroupId) {
  const meta = {
    news: { title: "News", eyebrow: "Live intelligence", icon: <Newspaper className="h-4 w-4" /> },
    tools: { title: "Tools", eyebrow: "Apps and repos", icon: <Sparkles className="h-4 w-4" /> },
    workflows: { title: "Workflows", eyebrow: "Use cases", icon: <Workflow className="h-4 w-4" /> },
    prompts: { title: "Prompts", eyebrow: "Playbooks", icon: <FileText className="h-4 w-4" /> },
    research: { title: "Research", eyebrow: "Papers and models", icon: <Lightbulb className="h-4 w-4" /> },
  } satisfies Record<ResultGroupId, Omit<ResultGroup, "id" | "items">>;

  return meta[id];
}

export function SearchDiscovery({
  query,
  results,
  bookmarks,
  onBack,
  onQueryChange,
  onToggleBookmark,
}: SearchDiscoveryProps) {
  const [recentSearches, setRecentSearches] = useLocalStorage<string[]>("signal:recent-searches", []);
  const [focused, setFocused] = useState(false);
  const searching = query.trim().length > 0;

  const groupedResults = useMemo(() => {
    const groups = new Map<ResultGroupId, FeedItem[]>();

    for (const item of results) {
      const id = classifyResult(item);
      groups.set(id, [...(groups.get(id) ?? []), item]);
    }

    return groupOrder
      .map((id) => ({ id, ...sectionMeta(id), items: groups.get(id) ?? [] }))
      .filter((group) => group.items.length > 0);
  }, [results]);

  const rememberSearch = (value: string) => {
    const next = value.trim();
    if (!next) return;

    setRecentSearches((current) => [next, ...current.filter((item) => item.toLowerCase() !== next.toLowerCase())].slice(0, 8));
  };

  const runSearch = (value: string) => {
    onQueryChange(value);
    rememberSearch(value);
  };

  const removeRecentSearch = (value: string) => {
    setRecentSearches((current) => current.filter((item) => item !== value));
  };

  return (
    <section className="mx-auto w-full max-w-2xl px-4 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))] sm:px-6 sm:pt-14">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.2, 0, 0, 1] }}
        className="mb-6"
      >
        <motion.button
          type="button"
          aria-label="Go back"
          onClick={onBack}
          whileTap={{ scale: 0.92 }}
          className="mb-5 flex h-11 w-11 items-center justify-center rounded-full border border-white/[0.08] bg-white/[0.045] text-green shadow-[0_0_24px_rgb(34_197_94/0.12)] transition hover:border-green/30 hover:bg-green/10"
        >
          <ArrowLeft className="h-5 w-5" />
        </motion.button>

        <div className="mb-5">
          <h1 className="text-[42px] font-black leading-none tracking-normal text-green sm:text-5xl">
            Search
          </h1>
          <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-muted-foreground">
            Discover AI news, tools, workflows and opportunities.
          </p>
        </div>

        <motion.div
          animate={{
            scale: focused ? 1.015 : 1,
            boxShadow: focused
              ? "0 0 0 1px rgb(34 197 94 / 0.42), 0 18px 55px -28px rgb(34 197 94 / 0.95)"
              : "0 14px 40px -30px rgb(34 197 94 / 0.55)",
          }}
          transition={{ type: "spring", stiffness: 320, damping: 24 }}
          className="relative rounded-[1.35rem] border border-white/[0.08] bg-white/[0.055] backdrop-blur-xl"
        >
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-green" />
          <input
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              rememberSearch(query);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") rememberSearch(query);
            }}
            autoFocus
            placeholder="Search AI news, tools, prompts..."
            className="h-16 w-full rounded-[1.35rem] bg-transparent pl-12 pr-14 text-[15px] font-semibold text-foreground outline-none placeholder:text-muted-foreground/70"
          />
          <button
            type="button"
            aria-label="Voice search"
            className="absolute right-3 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-white/[0.07] bg-black/30 text-muted-foreground transition hover:border-green/30 hover:text-green active:scale-95"
          >
            <Mic className="h-4 w-4" />
          </button>
        </motion.div>
      </motion.div>

      <AnimatePresence mode="wait">
        {searching ? (
          <motion.div
            key="results"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28 }}
            className="space-y-4"
          >
            {groupedResults.length > 0 ? (
              groupedResults.map((group, index) => (
                <SearchResultSection
                  key={group.id}
                  group={group}
                  delay={index * 0.04}
                  bookmarks={bookmarks}
                  onToggleBookmark={onToggleBookmark}
                />
              ))
            ) : (
              <NoSearchResults query={query} onSearch={runSearch} />
            )}
          </motion.div>
        ) : (
          <motion.div
            key="discover"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="space-y-7"
          >
            <TrendingSearches onSearch={runSearch} />
            <ExploreGrid onSearch={runSearch} />
            <FeaturedCollections onSearch={runSearch} />
            <RecentSearches
              items={recentSearches}
              onSearch={runSearch}
              onRemove={removeRecentSearch}
              onClear={() => setRecentSearches([])}
            />
            <RecommendedSearches onSearch={runSearch} />
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

function TrendingSearches({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <DiscoverySection title="Trending Today">
      <div className="flex flex-wrap gap-2">
        {trendingSearches.map((term, index) => (
          <MotionChip key={term} delay={index * 0.025} onClick={() => onSearch(term)}>
            {term}
          </MotionChip>
        ))}
      </div>
    </DiscoverySection>
  );
}

function ExploreGrid({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <DiscoverySection title="Explore">
      <div className="grid grid-cols-2 gap-3">
        {exploreCards.map((card, index) => {
          const Icon = card.icon;

          return (
            <motion.button
              key={card.title}
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.04 + index * 0.035, duration: 0.3 }}
              whileHover={{ y: -3, scale: 1.015 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onSearch(card.query)}
              className="group relative min-h-[136px] overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.04] p-4 text-left transition-colors hover:border-green/25 hover:bg-white/[0.065]"
            >
              <span className="absolute inset-x-5 -bottom-8 h-16 rounded-full bg-green/10 blur-2xl opacity-0 transition-opacity group-hover:opacity-100" />
              <span className="relative mb-5 flex h-11 w-11 items-center justify-center rounded-2xl border border-green/15 bg-green/10 text-green shadow-[0_0_30px_rgb(34_197_94/0.12)]">
                <Icon className="h-5 w-5" />
              </span>
              <span className="relative block text-sm font-bold text-foreground">{card.title}</span>
              <span className="relative mt-1.5 block text-xs leading-snug text-muted-foreground">{card.subtitle}</span>
            </motion.button>
          );
        })}
      </div>
    </DiscoverySection>
  );
}

function FeaturedCollections({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <DiscoverySection title="Featured Collections">
      <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-1 no-scrollbar sm:-mx-6 sm:px-6">
        {featuredCollections.map((collection, index) => (
          <motion.button
            key={collection.title}
            type="button"
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.06 + index * 0.04, duration: 0.34 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSearch(collection.query)}
            className="relative h-44 w-[78%] max-w-[285px] shrink-0 snap-start overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04] text-left shadow-2xl shadow-black/20"
          >
            <img
              src={collection.image}
              alt=""
              loading="lazy"
              className="absolute inset-0 h-full w-full object-cover opacity-[0.68]"
            />
            <span className={cn("absolute inset-0 bg-gradient-to-br", collection.gradient)} />
            <span className="absolute inset-0 bg-gradient-to-t from-black via-black/35 to-black/10" />
            <span className="relative flex h-full flex-col justify-end p-4">
              <span className="mb-2 inline-flex w-fit items-center gap-1.5 rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.12em] text-green backdrop-blur-md">
                <Zap className="h-3 w-3" />
                Collection
              </span>
              <span className="text-lg font-black leading-tight text-white">{collection.title}</span>
              <span className="mt-1.5 text-xs leading-snug text-white/72">{collection.description}</span>
            </span>
          </motion.button>
        ))}
      </div>
    </DiscoverySection>
  );
}

function RecentSearches({
  items,
  onSearch,
  onRemove,
  onClear,
}: {
  items: string[];
  onSearch: (query: string) => void;
  onRemove: (query: string) => void;
  onClear: () => void;
}) {
  if (items.length === 0) return null;

  return (
    <DiscoverySection
      title="Recent Searches"
      action={
        <button
          type="button"
          onClick={onClear}
          className="text-[11px] font-bold uppercase tracking-[0.1em] text-muted-foreground transition hover:text-green"
        >
          Clear all
        </button>
      }
    >
      <div className="flex flex-wrap gap-2">
        {items.map((item) => (
          <span
            key={item}
            className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.045] py-1 pl-3 pr-1 text-xs font-semibold text-foreground"
          >
            <button type="button" onClick={() => onSearch(item)} className="max-w-[170px] truncate">
              {item}
            </button>
            <button
              type="button"
              onClick={() => onRemove(item)}
              aria-label={`Remove ${item}`}
              className="flex h-6 w-6 items-center justify-center rounded-full text-muted-foreground transition hover:bg-white/[0.06] hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </span>
        ))}
      </div>
    </DiscoverySection>
  );
}

function RecommendedSearches({ onSearch }: { onSearch: (query: string) => void }) {
  return (
    <DiscoverySection title="You Might Like">
      <div className="grid gap-2">
        {recommended.map((item, index) => (
          <motion.button
            key={item.name}
            type="button"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 + index * 0.03, duration: 0.28 }}
            whileTap={{ scale: 0.985 }}
            onClick={() => onSearch(item.query)}
            className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.035] p-3 text-left transition hover:border-green/20 hover:bg-white/[0.055]"
          >
            <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-green/10 text-sm font-black text-green">
              {item.name.charAt(0)}
              <img
                src={`https://www.google.com/s2/favicons?domain=${item.domain}&sz=64`}
                alt=""
                loading="lazy"
                className="absolute inset-2 h-7 w-7 rounded-md object-cover"
                onError={(event) => {
                  (event.currentTarget as HTMLImageElement).style.display = "none";
                }}
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-bold text-foreground">{item.name}</span>
              <span className="mt-0.5 block truncate text-xs text-muted-foreground">{item.note}</span>
            </span>
            <ChevronDown className="-rotate-90 h-4 w-4 shrink-0 text-muted-foreground" />
          </motion.button>
        ))}
      </div>
    </DiscoverySection>
  );
}

function SearchResultSection({
  group,
  delay,
  bookmarks,
  onToggleBookmark,
}: {
  group: ResultGroup;
  delay: number;
  bookmarks: string[];
  onToggleBookmark: (id: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const [showAll, setShowAll] = useState(false);
  const visibleItems = showAll ? group.items : group.items.slice(0, 4);
  const hiddenCount = group.items.length - visibleItems.length;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
      className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025]"
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-green/10 text-green">
            {group.icon}
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {group.eyebrow}
            </span>
            <span className="block truncate text-base font-black text-foreground">
              {group.title}
            </span>
          </span>
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-full bg-white/[0.05] px-2 py-1 text-xs font-bold text-muted-foreground">
            {group.items.length}
          </span>
          <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.2, 0, 0, 1] }}
            className="overflow-hidden"
          >
            <div className="space-y-3 border-t border-white/[0.05] px-3 py-3">
              {visibleItems.map((item, index) => (
                <FeedCard
                  key={item.id}
                  item={item}
                  index={index}
                  bookmarked={bookmarks.includes(item.id)}
                  onToggleBookmark={onToggleBookmark}
                />
              ))}

              {hiddenCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="flex h-11 w-full items-center justify-center rounded-xl border border-green/20 bg-green/10 text-sm font-bold text-green transition hover:bg-green/15 active:scale-[0.99]"
                >
                  Show {hiddenCount} more
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function NoSearchResults({ query, onSearch }: { query: string; onSearch: (query: string) => void }) {
  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.035] p-5 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-green/10 text-green">
        <Search className="h-6 w-6" />
      </div>
      <h2 className="text-base font-black text-foreground">No matching intelligence found</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted-foreground">
        Try a broader AI topic or jump into one of today&apos;s trending searches.
      </p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        {trendingSearches.slice(0, 4).map((term) => (
          <MotionChip key={term} onClick={() => onSearch(term)}>
            {term}
          </MotionChip>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onSearch(query.split(" ").slice(0, 1).join(""))}
        className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/[0.08] bg-white/[0.045] px-4 py-2 text-xs font-bold text-muted-foreground transition hover:border-green/25 hover:text-green"
      >
        <Sparkles className="h-3.5 w-3.5" />
        Broaden search
      </button>
    </div>
  );
}

function DiscoverySection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="section-label">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

function MotionChip({
  children,
  delay = 0,
  onClick,
}: {
  children: React.ReactNode;
  delay?: number;
  onClick: () => void;
}) {
  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, scale: 0.94 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay, type: "spring", stiffness: 380, damping: 24 }}
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      className="rounded-full border border-white/[0.08] bg-white/[0.045] px-3.5 py-2 text-xs font-bold text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.04)] transition hover:border-green/25 hover:bg-green/10 hover:text-green"
    >
      {children}
    </motion.button>
  );
}
