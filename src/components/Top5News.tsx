import type { FeedItem } from "@/data/feed";

interface Props {
  items: FeedItem[];
}

/* ── Company logo detection ── */
const COMPANIES: Record<string, { name: string; domain: string }> = {
  openai: { name: "OpenAI", domain: "openai.com" },
  anthropic: { name: "Anthropic", domain: "anthropic.com" },
  google: { name: "Google", domain: "google.com" },
  meta: { name: "Meta", domain: "meta.com" },
  microsoft: { name: "Microsoft", domain: "microsoft.com" },
  github: { name: "GitHub", domain: "github.com" },
  cursor: { name: "Cursor", domain: "cursor.com" },
  perplexity: { name: "Perplexity", domain: "perplexity.ai" },
  claude: { name: "Claude", domain: "anthropic.com" },
  chatgpt: { name: "ChatGPT", domain: "openai.com" },
  gemini: { name: "Gemini", domain: "google.com" },
  mistral: { name: "Mistral", domain: "mistral.ai" },
  nvidia: { name: "NVIDIA", domain: "nvidia.com" },
  apple: { name: "Apple", domain: "apple.com" },
};

function detectCompany(title: string) {
  const text = title.toLowerCase();
  for (const [key, val] of Object.entries(COMPANIES)) {
    if (text.includes(key)) return val;
  }
  return null;
}

function truncate(s: string, n: number) {
  return s.length > n ? s.slice(0, n) + "…" : s;
}

export function Top5News({ items }: Props) {
  // Get top 5 by impact + score
  const top5 = [...items]
    .sort((a, b) => {
      const impactRank = (i: FeedItem) => i.impact === "critical" ? 3 : i.impact === "major" ? 2 : 1;
      return (impactRank(b) - impactRank(a)) || (b.score - a.score);
    })
    .slice(0, 5);

  if (top5.length === 0) return null;

  return (
    <div className="mb-6 animate-fade-up" style={{ animationDelay: "80ms" }}>
      <p className="section-label mb-3">Top 5 Today</p>
      <div className="glass-card overflow-hidden divide-y divide-white/[0.04]">
        {top5.map((item, i) => {
          const company = detectCompany(item.title);
          return (
            <a
              key={item.id}
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-3 px-4 py-3 hover:bg-white/[0.03] transition-colors group"
            >
              {/* Rank number */}
              <span className="text-xs font-bold text-green w-4 shrink-0 font-mono-tight">
                {i + 1}
              </span>

              {/* Company logo with initials fallback underneath */}
              <div className="relative w-5 h-5 shrink-0">
                <span className="absolute inset-0 rounded bg-green/15 text-green text-[9px] font-bold flex items-center justify-center">
                  {(company?.name ?? item.source).charAt(0).toUpperCase()}
                </span>
                {company && (
                  <img
                    src={`https://www.google.com/s2/favicons?domain=${company.domain}&sz=32`}
                    alt={company.name}
                    className="absolute inset-0 w-5 h-5 rounded object-cover"
                    loading="lazy"
                    onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                  />
                )}
              </div>

              {/* One-line headline */}
              <span className="text-sm font-medium text-foreground/90 truncate flex-1 group-hover:text-green transition-colors">
                {truncate(item.title, 65)}
              </span>

              {/* Tag */}
              <span className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground shrink-0">
                {item.tag}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
