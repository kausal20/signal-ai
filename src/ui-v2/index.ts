// signal-ui-v2 · index.ts
// ---------------------------------------------------------------------------
// Barrel export for the whole UI package. Import from here in the production
// app, e.g.  import { HomePage, FeedCard, SignalButton } from "@/signal-ui-v2";
// ---------------------------------------------------------------------------

// Pages
export { HomePage } from "./pages/HomePage";
export { SearchPage } from "./pages/SearchPage";
export { AdvisorPage } from "./pages/AdvisorPage";
export { SavedPage } from "./pages/SavedPage";
export { SettingsPage } from "./pages/SettingsPage";
export { SignalDetailPage } from "./pages/SignalDetailPage";

// Layouts
export { ScreenShell } from "./layouts/ScreenShell";
export { BottomNav } from "./layouts/BottomNav";
export { PageTransition } from "./layouts/PageTransition";

// Components — primitives
export { SignalButton } from "./components/SignalButton";
export { SignalInput } from "./components/SignalInput";
export { SignalToggle } from "./components/SignalToggle";
export { SignalBadge } from "./components/SignalBadge";
export { SignalModal } from "./components/SignalModal";
export { SignalProgress } from "./components/SignalProgress";
export { SignalSkeleton, FeedCardSkeleton } from "./components/SignalSkeleton";
export { SignalEmptyState } from "./components/SignalEmptyState";
export { SignalScoreRing, SignalScoreChip, tierFor } from "./components/SignalScoreRing";
export { SectionHeader } from "./components/SectionHeader";
export { LivePulse } from "./components/LivePulse";
export { MetricChip } from "./components/MetricChip";
export { InterestChip } from "./components/InterestChip";

// Components — domain
export { FeedCard } from "./components/FeedCard";
export { TopStoryCard } from "./components/TopStoryCard";
export { RecommendationCard } from "./components/RecommendationCard";
export { ProjectCard } from "./components/ProjectCard";
export { ProfileCard } from "./components/ProfileCard";
export { Timeline } from "./components/Timeline";
export { SettingsCard, SettingsRow, SettingsAccordionBody } from "./components/SettingsCard";
export { TrendingRow } from "./components/TrendingRow";
export { TrendingTicker } from "./components/TrendingTicker";
export { CollectionCard } from "./components/CollectionCard";
export { SourceRow } from "./components/SourceRow";

// Icons
export { BrandLogo } from "./icons/BrandLogo";

// Motion
export {
  motion,
  motionTokens,
  stagger,
  styleDelay,
  haptic,
  pageVariants,
  pageTransition,
  containerVariants,
  sectionVariants,
  itemVariants,
  scrollRevealVariants,
  floatVariants,
  cardHover,
  cardTap,
  buttonHover,
  buttonTap,
  navIconHover,
  navIconTap,
  accordionVariants,
  modalVariants,
  backdropVariants,
  bookmarkSpring,
  celebrationVariants,
  viewportOnce,
  viewportRepeat,
} from "./animations/motion";
export { useScrollReveal } from "./animations/useScrollReveal";
export { useAmbientPause } from "./animations/useAmbientPause";

// Types
export type * from "./shared/types";
