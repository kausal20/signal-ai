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
import { motion as fm, useReducedMotion } from "framer-motion";
import { pageVariants } from "../animations/motion";

interface Props {
  children: React.ReactNode;
  className?: string;
}

/**
 * Animates page transitions with fade + slide + blur.
 * Wrap each route's content to get smooth enter/exit transitions.
 */
export function PageTransition({ children, className }: Props) {
  const reduce = useReducedMotion();

  if (reduce) {
    return (
      <div className={className} style={{ height: "100%", width: "100%" }}>
        {children}
      </div>
    );
  }

  return (
    <fm.div
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
}
