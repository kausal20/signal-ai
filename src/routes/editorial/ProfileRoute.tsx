import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useOnboarding, type OnboardingProfile } from "@/hooks/useOnboarding";
import { useFeed } from "@/app/FeedProvider";
import { useChat } from "@/app/ChatProvider";
import { getStats, signalLevel } from "@/lib/stats";
import { SETTINGS_ROLE_LABEL, SETTINGS_TIME_LABEL } from "@/adapters/homeV2";
import {
  canRegister, pushSupported, isIOS, isStandalone,
  getCurrentSubscription, subscribeUser, unsubscribeUser,
  loadPrefs, updatePrefs, DEFAULT_PREFS,
  type PushPrefs, type ImportanceLevel,
} from "@/lib/push";
import { ProfilePage, type ProfileDetails, type ProfileOptions } from "@/ui-editorial/pages/ProfilePage";

const LEVELS: { id: ImportanceLevel; label: string; desc: string }[] = [
  { id: "minimal", label: "Minimal", desc: "Only true Signal Alerts. About one a day at most." },
  { id: "balanced", label: "Balanced", desc: "High-signal items only. Around two a day at most." },
  { id: "aggressive", label: "Aggressive", desc: "Anything worth a look. Up to three a day." },
];

const ROLES = ["founder", "developer", "student", "ai_engineer", "freelancer", "marketer", "researcher", "investor", "product_manager", "other"];
const GOALS = ["build_ai_startup", "grow_business", "automate_work", "become_ai_developer", "learn_ai", "discover_business_opportunities", "stay_updated", "ai_research"];
const TIMES = ["lt_2h", "2_5h", "5_10h", "10_20h", "20h_plus"];
const EXPERIENCE = ["beginner", "intermediate", "advanced", "expert"];
const INTERESTS = ["AI Coding", "Automation", "AI Agents", "Business", "Startups", "Marketing", "Design", "Video AI", "Voice AI", "Productivity", "Research", "Open Source", "Robotics", "Education", "Developer Tools", "MCP", "Memory", "Reasoning", "Coding Assistants", "Generative AI"];

const pretty = (key: string) =>
  key.split("_").map((w) => (w === "ai" ? "AI" : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");

const OPTIONS: ProfileOptions = {
  roles: ROLES.map((v) => ({ value: v, label: SETTINGS_ROLE_LABEL[v] ?? pretty(v) })),
  goals: GOALS.map((v) => ({ value: v, label: pretty(v) })),
  time: TIMES.map((v) => ({ value: v, label: SETTINGS_TIME_LABEL[v] ?? pretty(v) })),
  experience: EXPERIENCE.map((v) => ({ value: v, label: pretty(v) })),
};

// Everything Signal stores on this device. Mirrors the previous Settings reset,
// plus the keys the editorial UI added. Keeps client_id, the server profile and
// any push subscription (same contract as before).
const RESET_KEYS = [
  "signal:onboardingComplete", "signal:onboardingProfile", "signal:userName",
  "signal:primary_role", "signal:primary_goal", "signal:weekly_time_budget",
  "signal:experience_level", "signal:interests", "signal:topics", "signal:persona",
  "signal:stats", "signal:project", "signal:bookmarks", "signal:saved-at", "signal:read",
  "signal:recent-searches", "signal:recentSearches", "signal:conversations",
  "signal:notificationsEnabled", "signal:queue:signals", "signal:queue:outcomes",
];

const strings = (v: unknown, n: number): string[] =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).slice(0, n) : [];

export default function ProfileRoute() {
  const navigate = useNavigate();
  const feed = useFeed();
  const chat = useChat();
  const { profile } = useOnboarding();
  const [data, setData] = useState<OnboardingProfile | null>(null);
  const [stats, setStats] = useState(getStats);

  const [supported, setSupported] = useState(false);
  const [reason, setReason] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);
  const [pushError, setPushError] = useState("");

  useEffect(() => { if (profile) setData(profile); }, [profile]);

  useEffect(() => {
    if (!pushSupported()) { setSupported(false); setReason("Your browser doesn’t support push notifications."); return; }
    if (!canRegister()) {
      setSupported(false);
      setReason(isIOS() && !isStandalone()
        ? "On iPhone, add Signal to your Home Screen and open it from there to turn on notifications."
        : "Notifications only work in the published app, not in a preview.");
      return;
    }
    setSupported(true);
    setPermission(Notification.permission);
    (async () => {
      const sub = await getCurrentSubscription();
      setSubscribed(!!sub);
      if (sub) { const p = await loadPrefs(); if (p) setPrefs({ ...DEFAULT_PREFS, ...p }); }
    })();
  }, []);

  const togglePush = async (on: boolean) => {
    setBusy(true); setPushError("");
    try {
      if (on) {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") return;
        await subscribeUser(); setSubscribed(true);
      } else { await unsubscribeUser(); setSubscribed(false); }
    } catch { setPushError("Couldn’t update notifications. Please try again."); }
    finally { setBusy(false); }
  };

  const persistPrefs = async (next: PushPrefs) => { setPrefs(next); if (subscribed) await updatePrefs(next); };

  // Single persistence path — the SAME edge function and localStorage keys as
  // onboarding and the previous Settings, so there's one source of truth.
  const persistProfile = async (next: OnboardingProfile): Promise<boolean> => {
    try {
      const { data: res, error } = await supabase.functions.invoke("save-onboarding-profile", {
        body: {
          client_id: localStorage.getItem("signal:client_id"),
          primary_role: next.primary_role,
          primary_goal: next.primary_goal,
          interests: next.interests,
          weekly_time_budget: next.weekly_time_budget,
          experience_level: next.experience_level,
        },
      });
      if (error) throw error;
      localStorage.setItem("signal:userName", next.name.trim());
      localStorage.setItem("signal:onboardingProfile", JSON.stringify(next));
      localStorage.setItem("signal:primary_role", next.primary_role);
      localStorage.setItem("signal:primary_goal", next.primary_goal);
      localStorage.setItem("signal:weekly_time_budget", next.weekly_time_budget);
      localStorage.setItem("signal:experience_level", next.experience_level);
      localStorage.setItem("signal:interests", JSON.stringify(next.interests));
      localStorage.setItem("signal:topics", JSON.stringify(next.interests));
      if (res?.profile?.persona) localStorage.setItem("signal:persona", res.profile.persona);
      setData(next);
      return true;
    } catch (err) {
      console.error("[Profile] save failed", err);
      return false;
    }
  };

  const clearSearches = () => {
    try { localStorage.removeItem("signal:recentSearches"); localStorage.removeItem("signal:recent-searches"); } catch { /* private mode */ }
  };
  const clearHistory = () => {
    feed.clearReadHistory();
    try { localStorage.removeItem("signal:stats"); } catch { /* private mode */ }
    setStats(getStats());
  };
  const reset = () => {
    try {
      RESET_KEYS.forEach((k) => localStorage.removeItem(k));
      Object.keys(localStorage).forEach((k) => { if (k.startsWith("signal:advisor-done:")) localStorage.removeItem(k); });
    } catch { /* private mode */ }
    navigate("/onboarding", { replace: true });
  };

  const name = (data?.name?.trim() || "").length > 0 ? data!.name.trim() : "You";
  const level = signalLevel(stats.readCount);
  const knows = useMemo(() => ({
    topics: strings((feed.profile as any)?.top_interests, 5),
    concepts: strings((feed.profile as any)?.top_concepts, 5),
  }), [feed.profile]);

  const details: ProfileDetails | undefined = data ? {
    name: data.name, primary_role: data.primary_role, primary_goal: data.primary_goal,
    weekly_time_budget: data.weekly_time_budget, experience_level: data.experience_level,
  } : undefined;

  return (
    <ProfilePage
      name={name}
      roleLabel={data?.primary_role ? (SETTINGS_ROLE_LABEL[data.primary_role] ?? pretty(data.primary_role)) : undefined}
      levelLabel={`Signal Level ${level.level} · ${level.label}`}
      stats={[
        { value: String(stats.weekRead), label: "read this week" },
        { value: String(stats.streak), label: "day streak" },
        { value: String(feed.bookmarks.length), label: "saved" },
      ]}
      interests={data?.interests ?? []}
      allInterests={INTERESTS}
      knows={knows}
      details={details}
      options={OPTIONS}
      push={{
        supported, reason, blocked: permission === "denied",
        on: subscribed && permission === "granted", busy, error: pushError,
        quiet: prefs.quietMode, level: prefs.importanceLevel, levels: LEVELS,
        onToggle: togglePush,
        onQuiet: (v) => persistPrefs({ ...prefs, quietMode: v }),
        onLevel: (id) => persistPrefs({ ...prefs, importanceLevel: id as ImportanceLevel }),
      }}
      links={[
        { to: "/weekly", label: "Weekly briefing", description: "Your week in AI, summarised." },
        { to: "/prompts", label: "Prompt library", description: "Prompts and playbooks worth reusing." },
        { to: "/ai-pulse", label: "AI Pulse", description: "How the industry is moving." },
      ]}
      onSaveInterests={(next) => (data ? persistProfile({ ...data, interests: next }) : Promise.resolve(false))}
      onSaveDetails={(next) => (data ? persistProfile({ ...data, ...next }) : Promise.resolve(false))}
      onClearSearches={clearSearches}
      onClearChats={chat.clearHistory}
      onClearHistory={clearHistory}
      onReset={reset}
    />
  );
}
