// V4.1 — personalization overlay on top of the live feed.
// Calls the `personalize` edge function (compute-only, zero LLM) and merges its
// per-user intelligence + ranking onto the base feed. Falls back to the plain
// feed for new users or any error. Never blocks first paint.

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useLiveFeed } from "@/hooks/useLiveFeed";
import { getClientId, getPersona } from "@/lib/clientId";
import type { FeedItem, PersonalIntel } from "@/data/feed";

interface PersonalizeCard {
  id: string;
  personalized_takeaway?: string;
  opportunity?: any;
  action?: string;
  estimated_impact?: any;
  roi?: any;
  priority?: PersonalIntel["priority"];
  effort?: PersonalIntel["effort"];
  risk?: PersonalIntel["risk"];
  confidence?: string;
  signal_score?: number;
  recommendation_reason?: string;
  why_signal_picked_this?: string[];
  trend?: any;
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
  const [advisor, setAdvisor] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
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
      for (const c of data.cards as PersonalizeCard[]) {
        intelById.set(c.id, cardToIntel(c, data.profile?.persona ?? persona));
        order.push(c.id);
      }
      // Merge intel + reorder: personalized cards first (their score order), rest after.
      const merged = feed.map((it) => (intelById.has(it.id) ? { ...it, intel: intelById.get(it.id) } : it));
      const rank = new Map(order.map((id, i) => [id, i]));
      merged.sort((a, b) => {
        const ra = rank.has(a.id) ? rank.get(a.id)! : Infinity;
        const rb = rank.has(b.id) ? rank.get(b.id)! : Infinity;
        if (ra !== rb) return ra - rb;
        return (b.score ?? 0) - (a.score ?? 0);
      });
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
