import { useState, useRef, useEffect } from "react";
import { Bookmark, ChevronDown, Clock, ArrowRight, ExternalLink, Zap, Target, Globe, Lightbulb, Rocket, Star, Link2, Share2, TrendingUp, DollarSign, ThumbsUp, ThumbsDown, Sparkles, Hammer } from "lucide-react";
import type { FeedItem } from "@/data/feed";
import { track, trackOutcome, readingStart, readingStop } from "@/lib/signals";
import { SignalScoreRing } from "@/components/SignalScoreRing";
import { startProject } from "@/lib/projects";

/* ═══════════════════════════════════════════════
   COMPANY DETECTION
   ═══════════════════════════════════════════════ */
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
  replit: { name: "Replit", domain: "replit.com" },
  elevenlabs: { name: "ElevenLabs", domain: "elevenlabs.io" },
  runway: { name: "Runway", domain: "runwayml.com" },
  huggingface: { name: "Hugging Face", domain: "huggingface.co" },
  "hugging face": { name: "Hugging Face", domain: "huggingface.co" },
  midjourney: { name: "Midjourney", domain: "midjourney.com" },
  nvidia: { name: "NVIDIA", domain: "nvidia.com" },
  apple: { name: "Apple", domain: "apple.com" },
  vercel: { name: "Vercel", domain: "vercel.com" },
  supabase: { name: "Supabase", domain: "supabase.com" },
  chatgpt: { name: "ChatGPT", domain: "openai.com" },
  gemini: { name: "Gemini", domain: "google.com" },
  mistral: { name: "Mistral", domain: "mistral.ai" },
  cohere: { name: "Cohere", domain: "cohere.com" },
  stability: { name: "Stability AI", domain: "stability.ai" },
};

function detectCompany(title: string, summary: string) {
  const text = `${title} ${summary}`.toLowerCase();
  for (const [key, val] of Object.entries(COMPANIES)) {
    if (text.includes(key)) return val;
  }
  return null;
}

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */
function timeAgo(iso: string) {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function readTime(text: string) {
  const words = text.split(/\s+/).length;
  return `${Math.max(1, Math.ceil(words / 200))} min`;
}

function firstSentence(text: string): string {
  const match = text.match(/^[^.!?]+[.!?]/);
  return match ? match[0].trim() : text.slice(0, 120);
}

/** Derive a short, punchy takeaway (≤18 words) from whyItMatters */
function deriveTakeaway(whyItMatters: string): string {
  const first = firstSentence(whyItMatters);
  const words = first.split(/\s+/);
  if (words.length <= 18) return first;
  return words.slice(0, 18).join(" ") + "…";
}

/** Split summary into TL;DR bullet points */
function deriveTldr(summary: string): string[] {
  const sentences = summary.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 3).map((s) => s.trim());
}

/** Generate practical actions from the item */
function deriveActions(item: FeedItem): string[] {
  const actions: string[] = [];
  if (item.tag === "tool") {
    actions.push("Try the tool and evaluate it for your workflow");
    if (item.source === "github") actions.push("Star the repo and watch for updates");
    else actions.push("Sign up for early access or free tier");
  } else if (item.tag === "prompt") {
    actions.push("Test the prompt in your current project");
    actions.push("Adapt it to your specific use case");
  } else if (item.tag === "news") {
    actions.push("Monitor this company for follow-up announcements");
    actions.push("Evaluate how this affects your current stack");
  } else {
    actions.push("Explore how this applies to your workflow");
    actions.push("Share with your team for discussion");
  }
  if (item.url) actions.push("Read the original source for full details");
  return actions.slice(0, 4);
}

const IMPACT_CONFIG: Record<string, { label: string; bg: string; text: string }> = {
  critical: { label: "Critical", bg: "bg-red-500/10 border-red-500/20", text: "text-red-400" },
  major: { label: "Major", bg: "bg-amber-500/10 border-amber-500/20", text: "text-amber-400" },
  useful: { label: "Useful", bg: "bg-green/10 border-green/20", text: "text-green" },
};

const TAG_PILL: Record<string, string> = {
  tool: "pill",
  news: "pill-news",
  prompt: "pill-prompt",
  "use-case": "pill-usecase",
};

/* ═══════════════════════════════════════════════
   FEED CARD — Two-State Progressive Disclosure
   ═══════════════════════════════════════════════ */
interface Props {
  item: FeedItem;
  bookmarked: boolean;
  onToggleBookmark: (id: string) => void;
  index?: number;
}

export function FeedCard({ item, bookmarked, onToggleBookmark, index = 0 }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [building, setBuilding] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const stagger = Math.min(index, 15) * 60;
  const company = detectCompany(item.title, item.summary);
  const impact = IMPACT_CONFIG[item.impact ?? "useful"];
  const intel = item.intel;
  // Prefer the per-user reasoned takeaway; fall back to the derived one.
  const takeaway = intel?.personalizedTakeaway ?? deriveTakeaway(item.whyItMatters);

  // Measure expanded content height for smooth animation
  useEffect(() => {
    if (contentRef.current) {
      setContentHeight(contentRef.current.scrollHeight);
    }
  }, [expanded]);

  // Stop the reading timer if the card unmounts while expanded.
  useEffect(() => () => { readingStop(item.id); }, [item.id]);

  const toggle = () => setExpanded((prev) => {
    const next = !prev;
    if (next) { track("opened", { feed_item_id: item.id }); readingStart(item.id); }
    else { readingStop(item.id); }
    return next;
  });

  const openSource = () => {
    track("external_link", { feed_item_id: item.id });
    if (item.tag === "tool") track("tool_clicked", { feed_item_id: item.id });
  };

  const shareItem = (e: React.MouseEvent) => {
    e.stopPropagation();
    track("shared", { feed_item_id: item.id });
    const data = { title: item.title, text: item.summary, url: item.url };
    if (typeof navigator !== "undefined" && (navigator as any).share) {
      (navigator as any).share(data).catch(() => {});
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(item.url).catch(() => {});
    }
  };

  return (
    <article
      className={`premium-card is-lift overflow-hidden animate-fade-up ${
        expanded ? "ring-1 ring-green/15" : ""
      }`}
      style={{ animationDelay: `${stagger}ms`, animationFillMode: "backwards" }}
    >
      {/* ━━━ COLLAPSED STATE ━━━ */}
      <div className="p-5 sm:p-6 cursor-pointer" onClick={toggle}>
        {/* Row 1: Company · Tag · Time */}
        <div className="flex items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2 min-w-0">
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
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide truncate">
              {company?.name ?? item.source}
              <span className="opacity-30 mx-1.5">·</span>
              <span className={TAG_PILL[item.tag] || "pill"}>{item.tag}</span>
              <span className="opacity-30 mx-1.5">·</span>
              {timeAgo(item.timestamp)}
            </span>
          </div>
        </div>

        {/* Headline */}
        <h3 className="text-[17px] sm:text-lg font-bold leading-snug text-foreground mb-2 tracking-[-0.01em]">
          {item.title}
        </h3>

        {/* One-sentence summary */}
        <p className="text-sm text-foreground/60 leading-relaxed mb-4">
          {firstSentence(item.summary)}
        </p>

        {/* 🎯 YOUR TAKEAWAY — the hook */}
        <div className="rounded-lg bg-green/[0.06] border border-green/[0.12] px-3.5 py-2.5 mb-4">
          <div className="flex items-start gap-2">
            <Target className="w-3.5 h-3.5 text-green shrink-0 mt-0.5" />
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-green mb-0.5">Your Takeaway</p>
              <p className="text-[13px] font-medium text-foreground/90 leading-snug">{takeaway}</p>
            </div>
          </div>
        </div>

        {/* Bottom bar: impact + reading time + expand */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Impact badge */}
            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${impact.bg} ${impact.text}`}>
              <Zap className="w-2.5 h-2.5" />
              {impact.label}
            </span>
            {/* Reading time */}
            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Clock className="w-3 h-3" />
              {readTime(`${item.summary} ${item.whyItMatters}`)}
            </span>
            {/* Signal score (compact, always visible per spec) */}
            <span className="flex items-center gap-1 text-[11px] font-semibold text-green/90 font-mono-tight">
              <Star className="w-2.5 h-2.5" />
              {item.intel?.signalScore ?? item.score}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Priority (personalized) */}
            {intel?.priority && (
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                intel.priority === "High" ? "bg-green/10 border-green/20 text-green"
                : intel.priority === "Medium" ? "bg-amber-500/10 border-amber-500/20 text-amber-400"
                : "bg-white/[0.03] border-white/[0.08] text-muted-foreground"
              }`}>
                <Sparkles className="w-2.5 h-2.5" />{intel.priority}
              </span>
            )}
            {/* Share */}
            <button
              onClick={shareItem}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all"
              aria-label="Share"
            >
              <Share2 className="w-3.5 h-3.5" />
            </button>
            {/* Bookmark */}
            <button
              onClick={(e) => { e.stopPropagation(); onToggleBookmark(item.id); }}
              className={`p-1.5 rounded-lg transition-all ${
                bookmarked ? "text-green bg-green/10" : "text-muted-foreground hover:text-foreground hover:bg-white/5"
              }`}
              aria-label={bookmarked ? "Remove bookmark" : "Bookmark"}
            >
              <Bookmark className={`w-3.5 h-3.5 ${bookmarked ? "fill-green animate-bookmark" : ""}`} />
            </button>
            {/* Chevron */}
            <ChevronDown
              className={`w-4 h-4 text-muted-foreground transition-transform duration-300 ${expanded ? "rotate-180" : ""}`}
            />
          </div>
        </div>
      </div>

      {/* ━━━ EXPANDED STATE ━━━ */}
      <div
        className="overflow-hidden transition-all duration-400 ease-[cubic-bezier(0.2,0,0,1)]"
        style={{ maxHeight: expanded ? contentHeight : 0, opacity: expanded ? 1 : 0 }}
      >
        <div ref={contentRef} className="border-t border-white/[0.04]">
          <div className="px-5 sm:px-6 py-5 space-y-5">

            {/* 🧠 PERSONALIZED INTELLIGENCE (from the personalize engine) */}
            {intel && (
              <div className="rounded-lg bg-green/[0.04] border border-green/[0.1] p-3.5 space-y-3">
                {intel.recommendationReason && (
                  <p className="text-[12px] text-green/90 leading-snug flex items-start gap-2">
                    <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                    <span>{intel.recommendationReason}</span>
                  </p>
                )}
                {intel.personalizedTakeaway && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-green mb-1">What this means for you</p>
                    <p className="text-sm text-foreground/85 leading-relaxed">{intel.personalizedTakeaway}</p>
                  </div>
                )}
                {intel.action && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-green mb-1">Do this week</p>
                    <p className="text-sm text-foreground/85 leading-relaxed">{intel.action}</p>
                  </div>
                )}
                {intel.opportunity && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-green mb-1">Opportunity · {intel.opportunity.type}</p>
                    <p className="text-sm text-foreground/85 leading-relaxed">{intel.opportunity.title} — {intel.opportunity.explanation}</p>
                  </div>
                )}
                {/* Priority / Effort / Risk / Confidence chips */}
                <div className="flex flex-wrap gap-1.5">
                  {intel.priority && <Chip label={`Priority ${intel.priority}`} />}
                  {intel.effort && <Chip label={`Effort ${intel.effort}`} />}
                  {intel.risk && <Chip label={`Risk ${intel.risk}`} />}
                  {intel.confidence && <Chip label={`Confidence ${intel.confidence}`} />}
                  {typeof intel.signalScore === "number" && <Chip label={`Signal ${intel.signalScore}`} />}
                </div>
                {/* ROI */}
                {intel.roi && (intel.roi.time_saved || intel.roi.money_saved) && (
                  <div className="rounded-md bg-white/[0.03] border border-white/[0.06] p-2.5">
                    <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-muted-foreground mb-1.5 flex items-center gap-1">
                      <DollarSign className="w-3 h-3" />Estimated ROI
                    </p>
                    <div className="grid grid-cols-2 gap-1.5 text-[12px] text-foreground/75">
                      {intel.roi.time_saved && <span>⏱ {intel.roi.time_saved}</span>}
                      {intel.roi.money_saved && <span>💰 {intel.roi.money_saved}</span>}
                      {intel.roi.payback_period && <span>↩ Payback {intel.roi.payback_period}</span>}
                      {typeof intel.roi.confidence === "number" && <span>✓ {intel.roi.confidence}% conf.</span>}
                    </div>
                  </div>
                )}
                {/* Trend context */}
                {intel.trend?.name && (
                  <p className="text-[12px] text-foreground/70 flex items-start gap-2">
                    <TrendingUp className="w-3.5 h-3.5 shrink-0 mt-0.5 text-green/70" />
                    <span><b className="text-foreground/85">{intel.trend.name}</b> {intel.trend.direction} — {intel.trend.prediction || intel.trend.evidence}</span>
                  </p>
                )}
                {/* I'm Building This → starts the Continue Building project */}
                <button
                  onClick={(e) => { e.stopPropagation(); startProject(item); trackOutcome("built", item.id); setBuilding(true); }}
                  className={`w-full h-10 rounded-xl text-[13px] font-bold flex items-center justify-center gap-1.5 transition-all pressable ${
                    building ? "bg-green/10 border border-green/25 text-green" : "bg-green text-black shadow-[0_0_20px_hsl(152_72%_48%/0.2)]"
                  }`}
                >
                  <Hammer className="w-3.5 h-3.5" />
                  {building ? "Building — track it on Home" : "I'm Building This"}
                </button>

                {/* Useful / not-useful outcome capture (CAP 6) */}
                <div className="flex items-center gap-2 pt-1">
                  <span className="text-[11px] text-muted-foreground">Was this useful?</span>
                  <button onClick={(e) => { e.stopPropagation(); trackOutcome("useful", item.id); }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-green hover:bg-green/10 transition-all" aria-label="Useful">
                    <ThumbsUp className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); trackOutcome("not_useful", item.id); }}
                    className="p-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-all" aria-label="Not useful">
                    <ThumbsDown className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* ⚡ TL;DR */}
            <ExpandedSection icon={<Zap className="w-4 h-4" />} title="TL;DR">
              <ul className="space-y-1.5">
                {deriveTldr(item.summary).map((bullet, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/80 leading-relaxed">
                    <span className="text-green mt-1.5 text-[6px]">●</span>
                    <span>{bullet}</span>
                  </li>
                ))}
              </ul>
            </ExpandedSection>

            {/* 📖 WHAT HAPPENED */}
            <ExpandedSection icon={<Globe className="w-4 h-4" />} title="What Happened">
              <p className="text-sm text-foreground/75 leading-relaxed">{item.summary}</p>
            </ExpandedSection>

            {/* 🌍 WHY IT MATTERS */}
            <ExpandedSection icon={<Lightbulb className="w-4 h-4" />} title="Why It Matters">
              <p className="text-sm text-foreground/75 leading-relaxed">{item.whyItMatters}</p>
            </ExpandedSection>

            {/* 🎯 WHY THIS MATTERS FOR YOU */}
            {item.whoFor && (
              <ExpandedSection icon={<Target className="w-4 h-4" />} title="Why This Matters For You" accent>
                <p className="text-sm text-foreground/85 leading-relaxed">{item.whoFor}</p>
              </ExpandedSection>
            )}

            {/* 🚀 OPPORTUNITY */}
            {item.growth && (
              <ExpandedSection icon={<Rocket className="w-4 h-4" />} title="Opportunity">
                <p className="text-sm text-foreground/75 leading-relaxed">
                  Growth: <span className="text-green font-semibold">{item.growth}</span>.
                  {item.tag === "tool" && " Evaluate this tool for integration into your workflow."}
                  {item.tag === "prompt" && " Test and adapt this approach for your projects."}
                  {item.tag === "news" && " Monitor this development for emerging opportunities."}
                </p>
              </ExpandedSection>
            )}

            {/* ⚡ ACTION YOU CAN TAKE TODAY */}
            <ExpandedSection icon={<ArrowRight className="w-4 h-4" />} title="Actions You Can Take">
              <ul className="space-y-1.5">
                {deriveActions(item).map((action, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-foreground/75 leading-relaxed">
                    <span className="text-green/60 mt-1.5 text-[6px]">▸</span>
                    <span>{action}</span>
                  </li>
                ))}
              </ul>
            </ExpandedSection>

            {/* ⭐ SIGNAL SCORE — signature metric, circular ring */}
            <ExpandedSection icon={<Star className="w-4 h-4" />} title="Signal Score">
              <div className="flex items-center gap-4">
                <SignalScoreRing score={item.intel?.signalScore ?? item.score} size={56} showLabel />
                <div className="flex-1">
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    Summarizes business impact, personal relevance, confidence, trend strength, and opportunity quality.
                    {item.impact === "critical" && " · Official release"}
                    {item.engagement > 500 && ` · ${item.engagement.toLocaleString()} engagements`}
                  </p>
                </div>
              </div>
            </ExpandedSection>

            {/* 🔗 SOURCE */}
            <div className="pt-2">
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={openSource}
                className="inline-flex items-center gap-2 text-sm font-medium text-green hover:text-green/80 transition-colors"
              >
                <Link2 className="w-3.5 h-3.5" />
                Read original source
                <ExternalLink className="w-3 h-3" />
              </a>
              <p className="text-[11px] text-muted-foreground mt-1 capitalize">
                via {item.source}
              </p>
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

/* Small labelled chip for personalized metadata */
function Chip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-white/[0.04] border border-white/[0.08] text-foreground/70">
      {label}
    </span>
  );
}

/* ═══════════════════════════════════════════════
   Expanded Section — reusable block
   ═══════════════════════════════════════════════ */
function ExpandedSection({
  icon, title, children, accent,
}: { icon: React.ReactNode; title: string; children: React.ReactNode; accent?: boolean }) {
  return (
    <div className={accent ? "rounded-lg bg-green/[0.04] border border-green/[0.1] p-3.5" : ""}>
      <div className="flex items-center gap-2 mb-2">
        <span className={accent ? "text-green" : "text-muted-foreground"}>{icon}</span>
        <h4 className={`text-xs font-bold uppercase tracking-[0.12em] ${accent ? "text-green" : "text-muted-foreground"}`}>
          {title}
        </h4>
      </div>
      {children}
    </div>
  );
}
