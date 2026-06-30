import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Bell, BellOff, Moon, Zap, Save } from "lucide-react";
import { BottomNav } from "@/components/BottomNav";
import { ProfileInsights } from "@/components/ProfileInsights";
import { useOnboarding, type OnboardingProfile } from "@/hooks/useOnboarding";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import {
  canRegister, pushSupported, isIOS, isStandalone,
  getCurrentSubscription, subscribeUser, unsubscribeUser,
  loadPrefs, updatePrefs, DEFAULT_PREFS,
  type PushPrefs, type ImportanceLevel,
} from "@/lib/push";

const LEVELS: { id: ImportanceLevel; label: string; desc: string }[] = [
  { id: "minimal", label: "Minimal", desc: "Only true Signal Alerts. ~1/day max." },
  { id: "balanced", label: "Balanced", desc: "High-signal items only. ~2/day max." },
  { id: "aggressive", label: "Aggressive", desc: "Anything worth a look. ~3/day max." },
];

const ROLE_OPTIONS = ["founder", "developer", "student", "ai_engineer", "freelancer", "marketer", "researcher", "investor", "product_manager", "other"];
const GOAL_OPTIONS = ["build_ai_startup", "grow_business", "automate_work", "become_ai_developer", "learn_ai", "discover_business_opportunities", "stay_updated", "ai_research"];
const TIME_BUDGET_OPTIONS = ["lt_2h", "2_5h", "5_10h", "10_20h", "20h_plus"];
const EXPERIENCE_OPTIONS = ["beginner", "intermediate", "advanced", "expert"];
const INTERESTS_LIST = ["AI Coding", "Automation", "AI Agents", "Business", "Startups", "Marketing", "Design", "Video AI", "Voice AI", "Productivity", "Research", "Open Source", "Robotics", "Education", "Developer Tools", "MCP", "Memory", "Reasoning", "Coding Assistants", "Generative AI"];

const formatLabel = (key: string) => {
  return key
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export default function Settings() {
  const { profile } = useOnboarding();
  const [formData, setFormData] = useState<OnboardingProfile | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  const [supported, setSupported] = useState(false);
  const [unsupportedReason, setUnsupportedReason] = useState("");
  const [permission, setPermission] = useState<NotificationPermission>("default");
  const [subscribed, setSubscribed] = useState(false);
  const [prefs, setPrefs] = useState<PushPrefs>(DEFAULT_PREFS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profile) {
      setFormData(profile);
    }
  }, [profile]);

  useEffect(() => {
    if (!pushSupported()) { setSupported(false); setUnsupportedReason("Your browser doesn't support push notifications."); return; }
    if (!canRegister()) {
      setSupported(false);
      setUnsupportedReason(isIOS() && !isStandalone()
        ? "On iPhone, add Signal to your Home Screen and open it from there to enable notifications."
        : "Notifications only work in the published app, not the editor preview.");
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

  const handleToggle = async (on: boolean) => {
    setBusy(true);
    try {
      if (on) {
        const perm = await Notification.requestPermission();
        setPermission(perm);
        if (perm !== "granted") { toast.error("Notifications blocked", { description: "Allow them in your browser settings." }); return; }
        await subscribeUser(); setSubscribed(true);
        toast.success("Signal is watching", { description: "We'll only ping you when it really matters." });
      } else { await unsubscribeUser(); setSubscribed(false); toast.success("Notifications off"); }
    } catch (e) { toast.error("Couldn't update notifications", { description: String(e) }); }
    finally { setBusy(false); }
  };

  const persist = async (next: PushPrefs) => { setPrefs(next); if (subscribed) await updatePrefs(next); };
  const notifsOn = subscribed && permission === "granted";

  const handleSaveProfile = async () => {
    if (!formData) return;
    setSavingProfile(true);
    try {
      await supabase.functions.invoke("save-onboarding-profile", {
        body: {
          client_id: localStorage.getItem("signal:client_id"),
          primary_role: formData.primary_role,
          primary_goal: formData.primary_goal,
          interests: formData.interests,
          weekly_time_budget: formData.weekly_time_budget,
          experience_level: formData.experience_level,
        },
      });

      localStorage.setItem("signal:onboardingProfile", JSON.stringify(formData));
      localStorage.setItem("signal:primary_role", formData.primary_role);
      localStorage.setItem("signal:primary_goal", formData.primary_goal);
      localStorage.setItem("signal:weekly_time_budget", formData.weekly_time_budget);
      localStorage.setItem("signal:experience_level", formData.experience_level);
      localStorage.setItem("signal:interests", JSON.stringify(formData.interests));

      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2000);
    } catch (err) {
      console.error("Failed to save profile:", err);
      toast.error("Failed to save profile");
    } finally {
      setSavingProfile(false);
    }
  };

  const toggleInterest = (interest: string) => {
    if (!formData) return;
    const interests = formData.interests.includes(interest)
      ? formData.interests.filter(i => i !== interest)
      : [...formData.interests, interest];
    setFormData({ ...formData, interests });
  };

  return (
    <div className="min-h-screen bg-background pb-20 sm:pb-8">
      <header className="sticky top-0 z-30 border-b border-white/[0.04] bg-background/80 backdrop-blur-xl">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <Link to="/" className="w-8 h-8 rounded-full bg-white/[0.04] border border-white/[0.06] flex items-center justify-center hover:bg-white/[0.08] transition-colors" aria-label="Back">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <h1 className="font-bold tracking-tight text-lg">Settings</h1>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-8 animate-fade-up">
        {/* Premium profile + learning insights */}
        <ProfileInsights />

        {/* Profile Settings */}
        {formData && (
          <section>
            <p className="section-label mb-4">Profile</p>
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] focus:border-green/50 focus:bg-green/[0.04] outline-none transition-all text-sm"
                />
              </div>

              {/* Role */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Role</label>
                <select
                  value={formData.primary_role}
                  onChange={(e) => setFormData({ ...formData, primary_role: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] focus:border-green/50 focus:bg-green/[0.04] outline-none transition-all text-sm"
                >
                  {ROLE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{formatLabel(opt)}</option>
                  ))}
                </select>
              </div>

              {/* Goal */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Primary Goal</label>
                <select
                  value={formData.primary_goal}
                  onChange={(e) => setFormData({ ...formData, primary_goal: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] focus:border-green/50 focus:bg-green/[0.04] outline-none transition-all text-sm"
                >
                  {GOAL_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{formatLabel(opt)}</option>
                  ))}
                </select>
              </div>

              {/* Interests */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Interests ({formData.interests.length})</label>
                <div className="flex flex-wrap gap-2">
                  {INTERESTS_LIST.map(interest => (
                    <button
                      key={interest}
                      onClick={() => toggleInterest(interest)}
                      className={cn(
                        "px-3 py-1.5 rounded-full text-xs font-semibold transition-all border",
                        formData.interests.includes(interest)
                          ? "bg-green text-black border-green"
                          : "bg-white/[0.04] text-muted-foreground border-white/[0.06] hover:text-foreground hover:bg-white/[0.07]"
                      )}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
              </div>

              {/* Time Budget */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">Weekly Time Budget</label>
                <select
                  value={formData.weekly_time_budget}
                  onChange={(e) => setFormData({ ...formData, weekly_time_budget: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] focus:border-green/50 focus:bg-green/[0.04] outline-none transition-all text-sm"
                >
                  {TIME_BUDGET_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{formatLabel(opt)}</option>
                  ))}
                </select>
              </div>

              {/* Experience */}
              <div>
                <label className="text-xs font-semibold text-muted-foreground mb-2 block">AI Experience</label>
                <select
                  value={formData.experience_level}
                  onChange={(e) => setFormData({ ...formData, experience_level: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-white/[0.06] bg-white/[0.04] focus:border-green/50 focus:bg-green/[0.04] outline-none transition-all text-sm"
                >
                  {EXPERIENCE_OPTIONS.map(opt => (
                    <option key={opt} value={opt}>{formatLabel(opt)}</option>
                  ))}
                </select>
              </div>

              {/* Save Button */}
              <button
                onClick={handleSaveProfile}
                disabled={savingProfile}
                className={cn(
                  "w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-semibold transition-all text-sm mt-4",
                  profileSaved || savingProfile
                    ? "bg-green text-black"
                    : "bg-green text-black hover:shadow-[0_0_24px_hsl(152_72%_48%/0.25)]"
                )}
              >
                <Save className="w-4 h-4" />
                {profileSaved ? "Saved!" : savingProfile ? "Saving..." : "Save Profile"}
              </button>
            </div>
          </section>
        )}

        <section>
          <p className="section-label mb-4">Notifications</p>
          {!supported ? (
            <div className="glass-card p-4"><p className="text-sm text-muted-foreground leading-relaxed">{unsupportedReason}</p></div>
          ) : (
            <div className="glass-card divide-y divide-white/[0.04] overflow-hidden">
              <Row
                icon={notifsOn
                  ? <div className="w-8 h-8 rounded-lg bg-green/10 flex items-center justify-center"><Bell className="w-4 h-4 text-green" /></div>
                  : <div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center"><BellOff className="w-4 h-4 text-muted-foreground" /></div>}
                title="Push notifications"
                desc="Get alerted only when something genuinely important drops."
                right={<Switch checked={notifsOn} disabled={busy} onCheckedChange={handleToggle} />}
              />
              {permission === "denied" && (
                <div className="p-4 bg-destructive/5"><p className="text-xs text-destructive leading-relaxed">Blocked by your browser. Allow notifications for this site.</p></div>
              )}
              {notifsOn && (
                <Row
                  icon={<div className="w-8 h-8 rounded-lg bg-white/[0.04] flex items-center justify-center"><Moon className="w-4 h-4 text-muted-foreground" /></div>}
                  title="Quiet mode" desc="Pause notifications without unsubscribing."
                  right={<Switch checked={prefs.quietMode} onCheckedChange={(v) => persist({ ...prefs, quietMode: v })} />}
                />
              )}
            </div>
          )}
        </section>

        {supported && notifsOn && (
          <section>
            <p className="section-label mb-4"><Zap className="w-3 h-3" /> Importance Level</p>
            <div className="glass-card divide-y divide-white/[0.04] overflow-hidden">
              {LEVELS.map((lvl) => {
                const sel = prefs.importanceLevel === lvl.id;
                return (
                  <button key={lvl.id} onClick={() => persist({ ...prefs, importanceLevel: lvl.id })} className="w-full text-left p-4 flex items-start gap-3 hover:bg-white/[0.02] transition-colors">
                    <span className={`mt-0.5 w-4 h-4 rounded-full border-2 shrink-0 transition-colors ${sel ? "border-green bg-green" : "border-white/20"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{lvl.label}</span>
                      <span className="block text-xs text-muted-foreground mt-0.5 leading-relaxed">{lvl.desc}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground mt-4 leading-relaxed">
              Signal watches AI news, tools, and workflows in the background and decides when something is worth interrupting you.
            </p>
          </section>
        )}
      </main>

      {/* Bottom nav — Settings active */}
      <BottomNav activeSection="settings" />
    </div>
  );
}

function Row({ icon, title, desc, right }: { icon: React.ReactNode; title: string; desc: string; right: React.ReactNode }) {
  return (
    <div className="p-4 flex items-center gap-4">
      <div className="shrink-0">{icon}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{desc}</div>
      </div>
      <div className="shrink-0">{right}</div>
    </div>
  );
}
