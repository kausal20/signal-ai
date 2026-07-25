import { lazy, Suspense } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { AnimatePresence } from "framer-motion";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Settings from "./pages/Settings.tsx";
import Onboarding from "./pages/Onboarding.tsx";
import Advisor from "./pages/Advisor.tsx";
import Strategy from "./pages/Strategy.tsx";
import Weekly from "./pages/Weekly.tsx";
import AiPulsePage from "./ui-v2/pages/AiPulsePage.tsx";
import PromptLibrary from "./pages/PromptLibrary.tsx";
import { PhoneFrame } from "@/components/PhoneFrame";
import { PageTransition } from "@/ui-v2/layouts/PageTransition";

// Showcase is a fullscreen cinematic route — lazy-loaded so it never enters
// the main bundle or the PhoneFrame layout.
const Showcase = lazy(() => import("./pages/Showcase.tsx"));

const queryClient = new QueryClient();

/** Inner component that uses location for AnimatePresence keying. */
function AnimatedRoutes() {
  const location = useLocation();
  return (
    <AnimatePresence mode="wait">
      <PageTransition key={location.pathname}>
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
