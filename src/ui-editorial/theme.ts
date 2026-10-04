// Appearance preference for the editorial UI: light, dark, or follow the system.
// Persisted under `signal:theme`. Components never read this directly — the
// AppShell resolves it and sets `data-ed-theme` on the `.ed-root` wrapper.

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemePref = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

export interface ThemeState {
  pref: ThemePref;
  resolved: ResolvedTheme;
  setPref: (next: ThemePref) => void;
}

/** Provided by AppShell; read by the Profile page's Appearance setting. */
export const ThemeContext = createContext<ThemeState>({ pref: "system", resolved: "light", setPref: () => {} });
export const useTheme = () => useContext(ThemeContext);

const KEY = "signal:theme";

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" || v === "system" ? v : "system";
  } catch { return "system"; }
}

function systemDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true;
}

export function useEditorialTheme() {
  const [pref, setPrefState] = useState<ThemePref>(readPref);
  const [sysDark, setSysDark] = useState<boolean>(systemDark);

  useEffect(() => {
    const mq = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!mq) return;
    const on = () => setSysDark(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);

  const setPref = useCallback((next: ThemePref) => {
    setPrefState(next);
    try { localStorage.setItem(KEY, next); } catch { /* private mode */ }
  }, []);

  const resolved: ResolvedTheme = pref === "system" ? (sysDark ? "dark" : "light") : pref;
  return { pref, resolved, setPref };
}
