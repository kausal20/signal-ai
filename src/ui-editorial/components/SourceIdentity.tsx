import { useState } from "react";
import type { EdStory } from "../types";
import { cn } from "@/lib/utils";

export function SourceIdentity({ story, className }: { story: Pick<EdStory, "source" | "url" | "domain">; className?: string }) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  let domain = "";
  try {
    const address = story.url || (story.domain ? `https://${story.domain}` : "");
    const parsed = new URL(address);
    if (["http:", "https:"].includes(parsed.protocol)) domain = parsed.hostname;
  } catch {
    domain = "";
  }
  const logoUrl = domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=64` : "";
  return (
    <span className={cn("inline-flex max-w-full items-center gap-1.5 align-middle", className)}>
      {logoUrl && failedUrl !== logoUrl && <img src={logoUrl} alt="" aria-hidden="true" width={18} height={18} loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailedUrl(logoUrl)} className="h-[18px] w-[18px] shrink-0 rounded-sm bg-white object-contain" />}
      <span className="truncate">{story.source}</span>
    </span>
  );
}
