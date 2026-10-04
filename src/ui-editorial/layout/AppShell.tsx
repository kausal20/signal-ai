import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router-dom";
import { MotionConfig, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";
import "../tokens.css";
import { ThemeContext, useEditorialTheme } from "../theme";
import { SignalHeader } from "../components/SignalHeader";
import { BottomNavigation } from "../components/BottomNavigation";
import type { EdNavKey } from "../types";
import { DUR, EASE } from "../motion";

interface Props {
  active: EdNavKey;
  /** "deep" = the darker Signal AI surface. */
  surface?: "paper" | "deep";
  name?: string;
  /** Mobile shows the wordmark bar only on Home. */
  showHeaderOnMobile?: boolean;
  /** Remove the content padding/max-width so a page can lay itself out (chat). */
  children: ReactNode;
}

const GROUND = { light: "#F7F7F4", dark: "#121312", deep: "#171817" } as const;

/** Frame for the five main destinations: theme + surface tokens, header, content
 *  column, bottom navigation. Replaces the old phone-frame chrome — on a desktop
 *  the content uses a wide editorial grid instead of a stretched phone. */
export function AppShell({ active, surface = "paper", name, showHeaderOnMobile = false, children }: Props) {
  const theme = useEditorialTheme();
  const { pathname, hash } = useLocation();
  const reduce = useReducedMotion();
  const mainRef = useRef<HTMLElement>(null);
  const [scrolled, setScrolled] = useState(false);

  const ground = surface === "deep" ? GROUND.deep : GROUND[theme.resolved];

  // Paint the document ground + browser chrome to match, so overscroll and the
  // status bar never show the legacy black behind a light page.
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const prev = { html: html.style.backgroundColor, body: body.style.backgroundColor, scheme: html.style.colorScheme, meta: meta?.content };
    html.style.backgroundColor = ground;
    body.style.backgroundColor = ground;
    html.style.colorScheme = surface === "deep" || theme.resolved === "dark" ? "dark" : "light";
    if (meta) meta.content = ground;
    return () => {
      html.style.backgroundColor = prev.html;
      body.style.backgroundColor = prev.body;
      html.style.colorScheme = prev.scheme;
      if (meta && prev.meta) meta.content = prev.meta;
    };
  }, [ground, surface, theme.resolved]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // New page → start at the top and move focus to the content (screen readers).
  useEffect(() => {
    if (!hash) window.scrollTo(0, 0);
    mainRef.current?.focus({ preventScroll: true });
  }, [pathname, hash]);

  const themeValue = useMemo(() => theme, [theme.pref, theme.resolved]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <ThemeContext.Provider value={themeValue}>
      <MotionConfig reducedMotion="user">
      <div className="ed-stage">
      <div
        className={cn("ed-root relative min-h-[100dvh] w-full")}
        data-ed-theme={theme.resolved}
        data-ed-surface={surface === "deep" ? "deep" : undefined}
      >
        <a href="#main" className="ed-skip-link">Skip to content</a>
        <SignalHeader active={active} name={name} showOnMobile={showHeaderOnMobile} scrolled={scrolled} />
        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="mx-auto w-full max-w-[1120px] px-5 pb-[calc(88px+env(safe-area-inset-bottom))] outline-none md:px-8 lg:pb-24"
        >
          <motion.div
            key={pathname}
            initial={reduce ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: DUR.base, ease: EASE }}
          >
            {children}
          </motion.div>
        </main>
        <BottomNavigation active={active} />
      </div>
      </div>
      </MotionConfig>
    </ThemeContext.Provider>
  );
}
