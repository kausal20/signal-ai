// signal-ui-v2 · animations/useAmbientPause.ts
// ---------------------------------------------------------------------------
// Performance hook that pauses CSS animations on elements when they leave the
// viewport. Saves GPU cycles for off-screen ambient effects (aurora, particles,
// floating cards, etc.).
//
// Usage:
//   const pauseRef = useAmbientPause();
//   <div ref={pauseRef} className="signal-aurora" />
// ---------------------------------------------------------------------------

import { useEffect, useRef, useCallback } from "react";

/**
 * Returns a ref to attach to an element with ambient CSS animations.
 * The element's `animation-play-state` toggles between `running` and `paused`
 * based on viewport intersection.
 */
export function useAmbientPause<T extends HTMLElement = HTMLDivElement>() {
  const ref = useRef<T>(null);

  const handleIntersection = useCallback((entries: IntersectionObserverEntry[]) => {
    for (const entry of entries) {
      const el = entry.target as HTMLElement;
      // Pause/resume all CSS animations on this element and its children
      const state = entry.isIntersecting ? "running" : "paused";
      el.style.animationPlayState = state;
      // Also pause child elements with animations
      const animated = el.querySelectorAll<HTMLElement>(
        '[class*="animate-"], [class*="signal-"], [class*="motion-"]'
      );
      animated.forEach((child) => {
        child.style.animationPlayState = state;
      });
    }
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Check prefers-reduced-motion — if enabled, pause permanently
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (mq.matches) {
      el.style.animationPlayState = "paused";
      return;
    }

    const observer = new IntersectionObserver(handleIntersection, {
      rootMargin: "100px", // Start a bit before entering viewport
      threshold: 0,
    });

    observer.observe(el);
    return () => observer.disconnect();
  }, [handleIntersection]);

  return ref;
}
