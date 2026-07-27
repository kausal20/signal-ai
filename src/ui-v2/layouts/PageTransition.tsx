// signal-ui-v2 · layouts/PageTransition.tsx
// ---------------------------------------------------------------------------
// Page transition wrapper for route-level fade + slide + shared-element feel.
// Wrap your route outlet content with this to get smooth page transitions.
//
// Usage in App.tsx:
//   <AnimatePresence mode="wait">
//     <PageTransition key={location.pathname}>
//       <Routes location={location}>...</Routes>
//     </PageTransition>
//   </AnimatePresence>
// ---------------------------------------------------------------------------
import { forwardRef } from "react";
import { motion as fm, useReducedMotion } from "framer-motion";
import { pageVariants } from "../animations/motion";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * Animates page transitions with fade + slide. forwardRef so AnimatePresence
 * `mode="popLayout"` can measure the exiting page and keep navigation
 * interruptible (a second nav cancels the first instead of queueing).
 */
export const PageTransition = forwardRef<HTMLDivElement, Props>(function PageTransition({ children, className }, ref) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div ref={ref} className={className} style={{ height: "100%", width: "100%" }}>
        {children}
      </div>
    );
  }

  return (
    <fm.div
      ref={ref}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      className={className}
      style={{ height: "100%", width: "100%" }}
    >
      {children}
    </fm.div>
  );
});
