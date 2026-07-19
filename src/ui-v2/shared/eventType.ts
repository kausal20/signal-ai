// Deterministic event-type label for the Top Story badge — derives a real event
// class ("Product Launch", "Funding", "Research", …) from the headline, so the
// card shows what KIND of news this is instead of a generic "Breaking" tag.
// Mirrors the backend editorial classifier; no network, presentation-only.

export interface EventBadge { label: string; className: string }

const GREEN = "border-green/30 bg-green/15 text-green shadow-[0_0_12px_hsl(152_72%_48%/0.25)]";
const AMBER = "border-amber-500/30 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]";
const SKY = "border-sky-500/30 bg-sky-500/15 text-sky-300 shadow-[0_0_12px_rgba(56,189,248,0.2)]";
const RED = "border-red-500/30 bg-red-500/15 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.25)]";
const PURPLE = "border-purple-500/30 bg-purple-500/15 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.22)]";
const TEAL = "border-teal-500/30 bg-teal-500/15 text-teal-300 shadow-[0_0_12px_rgba(20,184,166,0.2)]";

export function eventBadge(title: string, category?: string, tag?: string): EventBadge {
  const t = (title ?? "").toLowerCase();
  const cat = (category ?? "").toLowerCase();

  if (/\bvulnerab|\bexploit|\bbreach|\bhacked?\b|\bmalware\b|\bcve\b|\bsecurity (flaw|risk|hole)\b|\bzero[- ]day\b|\bphishing\b/.test(t))
    return { label: "Security", className: RED };
  if (/\blawsuit\b|\bsues?\b|\bsued\b|\bin court\b|\bregulator|\bantitrust\b|\bftc\b|\bruling\b|\bcopyright\b|\bip suit\b|\bsettlement\b|\bfined?\b|\bprobe\b/.test(t))
    return { label: "Legal", className: RED };
  if (/\braise[sd]?\b|\bseries [a-e]\b|\bseed round\b|\bfunding\b|\bvaluation\b|\bsecures? \$|\b\$\d[\d.]*\s?(m|b|million|billion)\b/.test(t))
    return { label: "Funding", className: AMBER };
  if (/\bacqui(re|res|red|sition)\b|\bbuys\b|\bbought\b|\bmerges? with\b|\bmerger\b/.test(t))
    return { label: "Acquisition", className: SKY };
  if (/\bpartner(s|ship|ed|ing)?\b|\bteams up\b|\bjoins forces\b|\bcollaborat/.test(t))
    return { label: "Partnership", className: SKY };
  if (/\binterview\b|\bq&a\b|\bsits down\b|\bin conversation\b|\bceo\b.{0,24}\btalks\b/.test(t))
    return { label: "Interview", className: PURPLE };
  if (/\bbenchmark|\bmmlu\b|\bswe[- ]?bench\b|\bhumaneval\b|\bleaderboard\b|\boutperforms?\b|\bbeats\b.{0,16}\b(gpt|claude|gemini)\b/.test(t))
    return { label: "Benchmark", className: TEAL };
  if (/\bopen[- ]source\b|\bopen[- ]weights?\b|\bapache 2\b|\bmit license\b/.test(t))
    return { label: "Open Source", className: GREEN };
  if (/\bpaper\b|\bresearch(ers)?\b|\barxiv\b|\bstudy\b|\bbreakthrough\b|\bstate[- ]of[- ]the[- ]art\b/.test(t) || cat === "models" || cat === "research")
    return { label: "Research", className: TEAL };
  if (/\blaunch(es|ed)?\b|\bintroduc(es|ed|ing)\b|\bunveils?\b|\breleases?\b|\bdebuts?\b|\brolls out\b|\bnow available\b|\bgeneral availability\b|\bships?\b/.test(t))
    return { label: "Product Launch", className: GREEN };

  return { label: "News", className: GREEN };
}
