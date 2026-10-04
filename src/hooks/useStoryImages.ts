// Real publisher images for stories. The feed (`feed_items`) carries no image
// field, but the Content Archive does (`content_archive.image`, captured at
// ingest from the publisher's own feed / og:image). feed ids and archive ids
// differ, so we join on the article URL. Read-only, cached per session, and
// best-effort: when no image exists the UI falls back to a typography-led layout.

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const CHUNK = 25;
// url → image URL, or null when the archive has no image for it.
const cache = new Map<string, string | null>();
const inflight = new Set<string>();

type Row = { url: string | null; original_url: string | null; image: string | null };

async function fetchChunk(urls: string[]): Promise<void> {
  const db = supabase as any;
  const [byOriginal, byUrl] = await Promise.all([
    db.from("content_archive").select("url,original_url,image").in("original_url", urls).not("image", "is", null),
    db.from("content_archive").select("url,original_url,image").in("url", urls).not("image", "is", null),
  ]);
  const rows: Row[] = [...(byOriginal.data ?? []), ...(byUrl.data ?? [])];
  for (const r of rows) {
    if (!r.image || !/^https:\/\//i.test(r.image)) continue;
    if (r.original_url) cache.set(r.original_url, r.image);
    if (r.url) cache.set(r.url, r.image);
  }
  for (const u of urls) if (!cache.has(u)) cache.set(u, null);
}

/** Returns a lookup `(url) => imageUrl | undefined` that re-renders when images arrive. */
export function useStoryImages(urls: (string | undefined)[]): (url?: string) => string | undefined {
  const [, bump] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const unique = Array.from(new Set(urls.filter((u): u is string => !!u)));
  const key = unique.join("\n");

  useEffect(() => {
    const missing = unique.filter((u) => !cache.has(u) && !inflight.has(u));
    if (missing.length === 0) return;
    missing.forEach((u) => inflight.add(u));
    (async () => {
      try {
        for (let i = 0; i < missing.length; i += CHUNK) {
          const chunk = missing.slice(i, i + CHUNK);
          try { await fetchChunk(chunk); } catch { chunk.forEach((u) => cache.set(u, null)); }
          chunk.forEach((u) => inflight.delete(u));
          if (alive.current) bump((n) => n + 1);
        }
      } finally {
        missing.forEach((u) => inflight.delete(u));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return (url?: string) => (url ? cache.get(url) ?? undefined : undefined);
}
