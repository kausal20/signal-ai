import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";
import { toast } from "sonner";
import { canRegister, subscribeUser, getCurrentSubscription, isIOS, isStandalone } from "@/lib/push";

const KEY = "signal:push-prompt-dismissed-at";
const COOLDOWN_MS = 7 * 24 * 3600 * 1000;

export function PushPermissionBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    (async () => {
      if (!canRegister()) return;
      if (Notification.permission !== "default") return;
      if (await getCurrentSubscription()) return;
      if (isIOS() && !isStandalone()) return;
      const last = Number(localStorage.getItem(KEY) ?? 0);
      if (Date.now() - last < COOLDOWN_MS) return;
      const t = setTimeout(() => setShow(true), 2500);
      return () => clearTimeout(t);
    })();
  }, []);

  const dismiss = () => { localStorage.setItem(KEY, String(Date.now())); setShow(false); };

  const enable = async () => {
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") { dismiss(); return; }
      await subscribeUser();
      toast.success("Notifications on", { description: "3–5 high-signal pings per day, max." });
      setShow(false);
    } catch { dismiss(); }
  };

  if (!show) return null;
  return (
    <div className="fixed bottom-20 sm:bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-40 glass-card p-4 animate-fade-up" style={{ borderColor: "hsl(var(--green) / 0.2)" }}>
      <div className="flex items-start gap-3">
        <div className="shrink-0 w-9 h-9 rounded-xl bg-green/10 border border-green/20 flex items-center justify-center">
          <Bell className="w-4 h-4 text-green" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-tight">Stay ahead in AI</p>
          <p className="text-xs text-muted-foreground mt-0.5 leading-snug">Get a quiet ping when something genuinely useful drops.</p>
          <div className="flex gap-2 mt-3">
            <button onClick={enable} className="h-7 px-3 text-xs font-semibold rounded-lg bg-green text-black hover:bg-green/90 transition-colors">Turn on</button>
            <button onClick={dismiss} className="h-7 px-3 text-xs font-medium rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-colors">Not now</button>
          </div>
        </div>
        <button onClick={dismiss} className="text-muted-foreground hover:text-foreground p-1 -m-1 rounded-lg hover:bg-white/5 transition-colors" aria-label="Dismiss">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
