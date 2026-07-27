import { lazy, Suspense, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import { PhoneFrame } from "@/components/PhoneFrame";
import { PageTransition } from "@/ui-v2/layouts/PageTransition";

// Landing (Index) + Onboarding stay eager (first paint). Secondary routes are
// code-split so the initial bundle is smaller (faster first paint), then quietly
// PREFETCHED on idle so navigation to them still feels instant.
const loadAdvisor = () => import("./pages/Advisor.tsx");
const loadSettings = () => import("./pages/Settings.tsx");
const loadStrategy = () => import("./pages/Strategy.tsx");
const loadWeekly = () => import("./pages/Weekly.tsx");
const loadAiPulse = () => import("./ui-v2/pages/AiPulsePage.tsx");
const loadPrompts = () => import("./pages/PromptLibrary.tsx");

const Advisor = lazy(loadAdvisor);
const Settings = lazy(loadSettings);
const Strategy = lazy(loadStrategy);
const Weekly = lazy(loadWeekly);
const AiPulsePage = lazy(loadAiPulse);
const PromptLibrary = lazy(loadPrompts);

// Showcase is a fullscreen cinematic route — lazy-loaded so it never enters
// the main bundle or the PhoneFrame layout.
const Showcase = lazy(() => import("./pages/Showcase.tsx"));

// Predictive prefetch: after the app is idle, warm the chunks the user is most
// likely to open next so route transitions never wait on a network fetch.
function useRoutePrefetch() {
  useEffect(() => {
    const idle = (window as any).requestIdleCallback ?? ((cb: () => void) => setTimeout(cb, 400));
    const id = idle(() => { loadAdvisor(); loadPrompts(); loadSettings(); loadStrategy(); loadWeekly(); loadAiPulse(); });
    return () => (window as any).cancelIdleCallback?.(id);
  }, []);
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,          // 5 min — serve cached, revalidate quietly
      gcTime: 30 * 60 * 1000,            // keep in memory 30 min for instant reopen
      refetchOnWindowFocus: false,       // no jarring refetch flashes on focus
      retry: 1,
    },
  },
});

/** Inner component that uses location for AnimatePresence keying. */
function AnimatedRoutes() {
  const location = useLocation();
  useRoutePrefetch();
  // mode="popLayout" makes navigation interruptible (a rapid second nav cancels
  // the first instead of queueing). Suspense fallback=null: chunks are
  // prefetched on idle, so a route swap rarely waits and never flashes.
  return (
    <AnimatePresence mode="popLayout">
      <PageTransition key={location.pathname}>
        <Suspense fallback={null}>
          <Routes location={location}>
            <Route path="/" element={<Index />} />
            <Route path="/advisor" element={<Advisor />} />
            <Route path="/strategy" element={<Strategy />} />
            <Route path="/weekly" element={<Weekly />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/ai-pulse" element={<AiPulsePage />} />
            <Route path="/prompts" element={<PromptLibrary />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </PageTransition>
    </AnimatePresence>
  );
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <BrowserRouter>
        <Routes>
          {/* Showcase renders FULLSCREEN — outside the PhoneFrame wrapper */}
          <Route
            path="/showcase"
            element={
              <Suspense fallback={null}>
                <Showcase />
              </Suspense>
            }
          />
          {/* All other app routes render inside the phone frame */}
          <Route
            path="*"
            element={
              <PhoneFrame>
                <Toaster />
                <Sonner />
                <AnimatedRoutes />
              </PhoneFrame>
            }
          />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
