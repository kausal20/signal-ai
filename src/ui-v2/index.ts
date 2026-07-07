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
export { RecommendationCard } from "./components/RecommendationCard";
export { ProjectCard } from "./components/ProjectCard";
export { ProfileCard } from "./components/ProfileCard";
export { Timeline } from "./components/Timeline";
export { SettingsCard, SettingsRow } from "./components/SettingsCard";
export { TrendingRow } from "./components/TrendingRow";
export { TrendingTicker } from "./components/TrendingTicker";
export { CollectionCard } from "./components/CollectionCard";
export { SourceRow } from "./components/SourceRow";

// Icons
export { BrandLogo } from "./icons/BrandLogo";

// Motion
export { motion, stagger } from "./animations/motion";

// Types
export type * from "./shared/types";
