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
import { PhoneFrame } from "@/components/PhoneFrame";
import { PageTransition } from "@/ui-v2/layouts/PageTransition";

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
      <PhoneFrame>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <AnimatedRoutes />
        </BrowserRouter>
      </PhoneFrame>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
