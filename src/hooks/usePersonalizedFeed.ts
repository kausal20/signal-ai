// V4.1 — personalization overlay on top of the live feed.
// Calls the `personalize` edge function (compute-only, zero LLM) and merges its
// per-user intelligence + ranking onto the base feed. Falls back to the plain
// feed for new users or any error. Never blocks first paint.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import { getClientId, getPersona } from "@/lib/clientId";
import { normalizeUrl } from "@/lib/url";
import type { FeedItem, PersonalIntel } from "@/data/feed";

interface PersonalizeCard {
  id: string;
  headline?: string;
  what_happened?: string;
  why_it_matters?: string;
  url?: string;
  content_category?: string;
  personalized_takeaway?: string;
  opportunity?: PersonalIntel["opportunity"];
  action?: string;
  estimated_impact?: PersonalIntel["roi"];
  roi?: PersonalIntel["roi"];
  priority?: PersonalIntel["priority"];
  effort?: PersonalIntel["effort"];
  risk?: PersonalIntel["risk"];
  confidence?: string;
  signal_score?: number;
  recommendation_reason?: string;
  why_signal_picked_this?: string[];
  trend?: PersonalIntel["trend"];
  /** Real publisher when known (e.g. "TechCrunch"); backend falls back to a
   * clean "Signal" for genuine archive-only rows — never an internal key. */
  source_label?: string;
}

// Materialise a personalize card (which may be an archive-sourced supplement not
// present in feed_items) into a FeedItem so the Advisor list can render it.
function cardToFeedItem(c: PersonalizeCard, intel?: PersonalIntel): FeedItem {
  const score = Math.round(c.signal_score ?? 60);
  return {
    id: c.id,
    title: c.headline ?? "Signal",
    summary: c.what_happened ?? "",
    whyItMatters: c.why_it_matters ?? c.what_happened ?? "",
    what_happened: c.what_happened ?? "",
    who_for: "",
    opportunity: "",
    // Archive-supplement rows can carry empty/redirect/malformed URLs — the old
    // `?? "#"` placeholder masked that. Normalize → "" so the button is hidden.
    url: normalizeUrl(c.url) ?? "",
    tag: "news",
    // "blog" is this codebase's existing "generic source, defer to the real
    // label" convention (see sourceIdentityFor in adapters/homeV2.ts) — never
    // display an internal identifier. Real publisher passes through via
    // sourceLabel when the backend knows it; otherwise it resolves to a clean
    // "Signal" (sourceLabelFor's own built-in fallback for an empty label).
    source: "blog",
    sourceLabel: c.source_label && c.source_label !== "Signal archive" ? c.source_label : undefined,
    category: (c.content_category as any) ?? "news",
    content_category: c.content_category ?? "Must Know",
    score,
    usefulness: score, vibe_friendly: true, humanized: false, engagement: 0,
    published_at: new Date().toISOString(),
    timestamp: new Date().toISOString(),
    impact: score >= 80 ? "critical" : "major",
    novelty_score: score, business_impact_score: score, builder_value_score: score,
    adoption_potential_score: score, market_impact_score: score, confidence_score: 70,
    opportunity_score: score, corroboration_score: score, source_count: 1,
    leverage_score: 6, trend_score: 0, momentum_score: 0,
    action_label: "watch", trend_entities: [], ranking_reason: c.recommendation_reason ?? "",
    intel,
  } as unknown as FeedItem;
}

function cardToIntel(c: PersonalizeCard, persona: string): PersonalIntel {
  return {
    personalizedTakeaway: c.personalized_takeaway,
    opportunity: c.opportunity ?? null,
    action: c.action,
    roi: c.roi ?? c.estimated_impact,
    priority: c.priority,
    effort: c.effort,
    risk: c.risk,
    confidence: c.confidence,
    signalScore: c.signal_score,
    recommendationReason: c.recommendation_reason,
    whyPicked: c.why_signal_picked_this,
    trend: c.trend,
    persona,
  };
}

export function usePersonalizedFeed() {
  const base = useLiveFeed();
  const [items, setItems] = useState<FeedItem[]>(base.items);
  const [personalized, setPersonalized] = useState(false);
  const [advisor, setAdvisor] = useState<Record<string, unknown> | null>(null);
  const [profile, setProfile] = useState<Record<string, unknown> | null>(null);
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const lastKey = useRef<string>("");

  const personalize = useCallback(async (feed: FeedItem[], searches: string[] = []) => {
    if (feed.length === 0) { setItems(feed); return; }
    const persona = getPersona();
    const t0 = performance.now();
    try {
      const { data, error } = await supabase.functions.invoke("personalize", {
        body: { client_id: getClientId(), persona, limit: 20, searches },
      });
      setLatencyMs(Math.round(performance.now() - t0));
      if (error || !data?.cards?.length) { setItems(feed); setPersonalized(false); return; }

      const intelById = new Map<string, PersonalIntel>();
      const order: string[] = [];
      const cardsById = new Map<string, PersonalizeCard>();
      for (const c of data.cards as PersonalizeCard[]) {
        intelById.set(c.id, cardToIntel(c, data.profile?.persona ?? persona));
        cardsById.set(c.id, c);
        order.push(c.id);
      }
      const feedById = new Map(feed.map((it) => [it.id, it]));
      // Build the list in the backend's ranked order. Cards that exist in the
      // base feed get their intel merged; cards that DON'T (archive-sourced
      // supplements — the never-empty / freshness guard in `personalize`) are
      // materialised as feed items so the Advisor hero + list actually surface them.
      const ordered: FeedItem[] = order.map((id) => {
        const base = feedById.get(id);
        if (base) return { ...base, intel: intelById.get(id) };
        return cardToFeedItem(cardsById.get(id)!, intelById.get(id));
      });
      // Keep any base feed items the backend didn't rank, appended after.
      const seen = new Set(order);
      const merged = [...ordered, ...feed.filter((it) => !seen.has(it.id))];
      setItems(merged);
      setPersonalized(true);
      setAdvisor(data.advisor ?? null);
      setProfile(data.profile ?? null);
    } catch {
      setLatencyMs(Math.round(performance.now() - t0));
      setItems(feed);
      setPersonalized(false);
    }
  }, []);

  // Re-personalize whenever the base feed changes (new fetch / refresh).
  useEffect(() => {
    const key = base.items.map((i) => i.id).join(",");
    if (key === lastKey.current) return;
    lastKey.current = key;
    setItems(base.items);            // show base immediately (no blocking)
    personalize(base.items);         // overlay intelligence async
  }, [base.items, personalize]);

  return {
    items,
    status: base.status,
    refresh: base.refresh,
    reload: base.reload,
    personalized,
    advisor,
    profile,
    latencyMs,
    repersonalize: personalize,
  };
}
