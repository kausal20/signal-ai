# signal-ui-v2 — Signal UI Package (design export)

A **UI-only** React + TypeScript component package for Signal. It contains the
visual layer for every screen and nothing else — no Supabase, no backend, no
APIs, no hooks, no routing, no auth, no state management, no business logic.

Every component is driven by **props**. The production app supplies the data.

> This folder is **not** an application. It is a drop-in visual layer that
> Claude Code can merge into the existing Signal codebase.

---

## Why it merges cleanly

It was built to match your existing architecture exactly:

| Concern | This package uses | Same as your app? |
|---|---|---|
| Framework | React + TypeScript (`.tsx`) | ✅ |
| Styling | Tailwind + your HSL CSS-var tokens | ✅ (`bg-green`, `text-muted-foreground`, `bg-background`…) |
| Utilities | `.glass-card`, `.premium-card`, `.green-halo`, `.pill`, `.section-label`, `.font-mono-tight`, `.no-scrollbar`, `.pb-safe` | ✅ (already in your `index.css`) |
| Class merge | `cn()` | ✅ (mirror of `@/lib/utils`) |
| Icons | `lucide-react` | ✅ |
| Fonts | Inter + JetBrains Mono | ✅ |
| Motion | `animate-fade-up`, `animate-scale-in`, `animate-bookmark` + reduced-motion | ✅ |

Because it reuses your tokens and utilities, **no theme wiring is required** —
components inherit your look the moment they render inside the app.

---

## Folder structure

```
signal-ui-v2/
├── README.md              ← this file
├── index.ts               ← barrel export for the whole package
├── shared/
│   ├── types.ts           ← all prop/data interfaces (the data contract)
│   └── utils.ts           ← cn(), clamp(), prefersReducedMotion() (mirror of @/lib/utils)
├── styles/
│   └── tokens.css         ← tokens + utilities, ONLY for standalone preview (do not import in prod)
├── animations/
│   └── motion.ts          ← named animation-class constants + stagger() helper
├── icons/
│   └── BrandLogo.tsx      ← bundled real brand marks + monogram fallback
├── components/            ← reusable pieces
│   ├── SignalButton.tsx        ├── SignalInput.tsx        ├── SignalToggle.tsx
│   ├── SignalBadge.tsx         ├── SignalModal.tsx        ├── SignalProgress.tsx
│   ├── SignalSkeleton.tsx      ├── SignalEmptyState.tsx   ├── SignalScoreRing.tsx
│   ├── SectionHeader.tsx       ├── LivePulse.tsx          ├── MetricChip.tsx
│   ├── InterestChip.tsx        ├── FeedCard.tsx           ├── RecommendationCard.tsx
│   ├── ProjectCard.tsx         ├── ProfileCard.tsx        ├── Timeline.tsx
│   ├── SettingsCard.tsx        ├── TrendingRow.tsx        ├── CollectionCard.tsx
│   └── SourceRow.tsx
├── layouts/
│   ├── ScreenShell.tsx    ← page scaffold (ambient glow + sticky header + scroll body + footer)
│   └── BottomNav.tsx      ← 5-tab nav (drop-in replacement for components/BottomNav.tsx)
└── pages/
    ├── HomePage.tsx
    ├── SearchPage.tsx
    ├── AdvisorPage.tsx
    ├── SavedPage.tsx
    ├── SettingsPage.tsx
    └── SignalDetailPage.tsx
```

---

## Pages → which production screen each replaces

| Page component | Replaces in production | Key props |
|---|---|---|
| `HomePage` | `pages/Index.tsx` body + `HeroOpportunity` + `DailyBrief` + `TopSignals` + feed | `profile`, `hero`, `brief[]`, `topSignals[]`, `feed[]`, `categories[]`, callbacks |
| `SearchPage` | `components/SearchDiscovery.tsx` | `query`, `trending[]`, `collections[]`, `sources[]`, `intents[]`, `matchCount`, callbacks |
| `AdvisorPage` | `pages/Advisor.tsx` | `greeting`, `recommendation`, `reasons[]`, `plan[]`, `skip`, `project`, `tomorrow`, callbacks |
| `SavedPage` | `components/SavedCollections.tsx` | `items[]`, `tabs[]`, `activeTab`, callbacks |
| `SettingsPage` | `pages/Settings.tsx` | `profile`, `goal`, `observations[]`, `learning[]`, `allInterests[]`, `selectedInterests[]`, `routine[]`, `whyReasons[]`, callbacks |
| `SignalDetailPage` | *new* (feed cards currently expand in place) | `signal`, `body[]`, `relevance`, `sources[]`, `related[]`, callbacks |

---

## Reusable components (23)

**Primitives:** `SignalButton`, `SignalInput`, `SignalToggle`, `SignalBadge`,
`SignalModal`, `SignalProgress`, `SignalSkeleton` (+`FeedCardSkeleton`),
`SignalEmptyState`, `SignalScoreRing` (+`SignalScoreChip`, `tierFor`),
`SectionHeader`, `LivePulse`, `MetricChip`, `InterestChip`, `BrandLogo`.

**Domain:** `FeedCard`, `RecommendationCard`, `ProjectCard`, `ProfileCard`,
`Timeline`, `SettingsCard`(+`SettingsRow`), `TrendingRow`, `CollectionCard`,
`SourceRow`.

**Layout:** `ScreenShell`, `BottomNav`.

`SignalScoreRing` and `BottomNav` intentionally match your existing component
APIs so they are **direct replacements**.

---

## The data contract (`shared/types.ts`)

All prop shapes live in one file. Map your Supabase rows / recommendation-engine
output onto these at the call site. Nothing here fetches or computes. Example:

```tsx
import { HomePage } from "@/signal-ui-v2";

<HomePage
  profile={{ name: user.fullName, initials: user.initials, confidence: profile.confidence }}
  briefSummary={`${todayCount} things worth your time · ${readMins} min read`}
  hero={mapRecommendation(topPick)}       // → Recommendation
  brief={briefItems.map(mapSignal)}        // → Signal[]
  topSignals={top5.map(mapSignal)}
  feed={feedItems.map(mapSignal)}
  categories={CATEGORIES}
  activeCategory={category}
  bookmarkCount={saved.length}
  onNavigate={(s) => navigate(ROUTES[s])}
  onOpenSignal={(id) => navigate(`/signal/${id}`)}
  onToggleSave={toggleBookmark}
  onStartHero={openRecommendation}
/>;
```

Formatting note: values like `timeAgo`, `signals` counts, and `matchCount` are
**pre-formatted strings/numbers** — do the formatting in your data layer so the
UI stays presentation-only.

---

## Components requiring backend props (all data, no logic)

Everything is prop-driven, but these depend most directly on live data:

- `HomePage` / `FeedCard` — feed, scores, saved state, live-pulse counts.
- `AdvisorPage` / `RecommendationCard` / `Timeline` — the daily pick, conviction, plan steps + done state.
- `SearchPage` / `TrendingRow` / `CollectionCard` — trending momentum, match count, collections.
- `SettingsPage` / `ProfileCard` — profile, confidence, observations, learning strengths, interests.
- `BrandLogo` — renders bundled SVG brand marks so source logos are offline/CSP-safe.

---

## Intentionally left out (belongs to business logic)

- Data fetching, Supabase, APIs, edge functions.
- Routing — `BottomNav` emits `onNavigate(section)`; wire it to your router.
- The typewriter placeholder, live match count, momentum %, and Signal scores
  are **displayed**, not computed. Feed the finished values in.
- Recommendation/personalization/notification engines.
- Auth & the real "reset" action — `SettingsPage` renders the confirm dialog and
  calls `onReset()`; the actual wipe is yours.
- Persistence — the only local state is the Settings interest-chip **draft**
  (committed vs unsaved) so the "Save changes" bar can appear; the final array
  is handed back via `onSaveInterests(next)`. No storage, no effects.

---

## Merge checklist for Claude Code

1. Copy `components/`, `layouts/`, `pages/`, `icons/`, `shared/types.ts`,
   `animations/` into `src/` (e.g. `src/ui-v2/`).
2. Delete `shared/utils.ts` and repoint imports to `@/lib/utils` (identical `cn`).
   Keep `clamp`/`prefersReducedMotion` or move them into `@/lib/utils`.
3. **Do not** import `styles/tokens.css` — your `index.css` already defines all
   of it. (Add only the two extra keyframes if missing: `fillBar`, `pulse-dot`.)
4. Wire `onNavigate` and `onOpen*` callbacks to `react-router`.
5. Map domain models → `shared/types.ts` shapes at each page's call site.
6. `SignalScoreRing` + `BottomNav` can replace the existing files directly.

---

## Accessibility & responsiveness

- Semantic elements, `role="switch"`/`"dialog"`/`"checkbox"` where relevant,
  `aria-*` labels, visible `focus-visible` rings, ≥44px touch targets.
- Reduced motion honored globally (mirrors your `index.css` media query;
  `BrandLogo`/ring/sparkline drop shadows and animations degrade gracefully).
- Layouts fill their parent and scroll internally — render inside your existing
  route outlet / phone frame; nothing assumes a fixed device width.
