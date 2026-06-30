import { supabase } from "@/integrations/supabase/client";

const SW_URL = "/sw.js";

export type ImportanceLevel = "minimal" | "balanced" | "aggressive";

export type PushPrefs = {
  enabled: boolean;
  quietMode: boolean;
  importanceLevel: ImportanceLevel;
};

export const DEFAULT_PREFS: PushPrefs = {
  enabled: true,
  quietMode: false,
  importanceLevel: "balanced",
};

export function isPreviewHost(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return h.includes("id-preview--") || h.includes("lovableproject.com");
}

export function isInIframe(): boolean {
  try { return window.self !== window.top; } catch { return true; }
}

export function pushSupported(): boolean {
  return typeof window !== "undefined"
    && "serviceWorker" in navigator
    && "PushManager" in window
    && "Notification" in window;
}

export function canRegister(): boolean {
  return pushSupported() && !isInIframe() && !isPreviewHost();
}

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // @ts-expect-error iOS Safari
  return window.matchMedia?.("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

export function isIOS(): boolean {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

async function getPublicKey(): Promise<string> {
  const { data, error } = await supabase.functions.invoke("register-push", { method: "GET" });
  if (error || !data?.publicKey) throw new Error("missing VAPID public key");
  return data.publicKey as string;
}

function urlBase64ToUint8Array(base64: string): ArrayBuffer {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const buf = new ArrayBuffer(raw.length);
  const view = new Uint8Array(buf);
  for (let i = 0; i < raw.length; i++) view[i] = raw.charCodeAt(i);
  return buf;
}

export async function ensureRegistration(): Promise<ServiceWorkerRegistration> {
  if (!canRegister()) throw new Error("push not supported here");
  const existing = await navigator.serviceWorker.getRegistration(SW_URL);
  return existing ?? (await navigator.serviceWorker.register(SW_URL));
}

export async function getCurrentSubscription(): Promise<PushSubscription | null> {
  if (!canRegister()) return null;
  const reg = await navigator.serviceWorker.getRegistration(SW_URL);
  if (!reg) return null;
  return (await reg.pushManager.getSubscription()) ?? null;
}

export async function subscribeUser(): Promise<PushSubscription> {
  const reg = await ensureRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (!sub) {
    const key = await getPublicKey();
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(key),
    });
  }
  await supabase.functions.invoke("register-push", {
    body: { action: "subscribe", subscription: sub.toJSON(), userAgent: navigator.userAgent },
  });
  return sub;
}

export async function unsubscribeUser(): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  await supabase.functions.invoke("register-push", {
    body: { action: "unsubscribe", endpoint: sub.endpoint },
  });
  try { await sub.unsubscribe(); } catch { /* ignore */ }
}

export async function updatePrefs(prefs: Partial<PushPrefs>): Promise<void> {
  const sub = await getCurrentSubscription();
  if (!sub) return;
  await supabase.functions.invoke("register-push", {
    body: { action: "update", endpoint: sub.endpoint, prefs },
  });
}

export async function loadPrefs(): Promise<PushPrefs | null> {
  const sub = await getCurrentSubscription();
  if (!sub) return null;
  const { data } = await supabase.functions.invoke("register-push", {
    body: { action: "get", endpoint: sub.endpoint },
  });
  return (data?.prefs as PushPrefs) ?? null;
}
