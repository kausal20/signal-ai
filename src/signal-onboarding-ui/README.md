# signal-onboarding-ui — Signal Onboarding Flow (UI-only)

The complete **9-step onboarding** for Signal, as a UI-only React + TypeScript
package. Prop-driven, no backend: no Supabase, APIs, hooks, routing, auth,
storage, or business logic. Matches your stack (Tailwind + Signal tokens,
`cn()`, lucide-react, Inter + JetBrains Mono).

> Sibling to `signal-ui-v2`. Same conventions, so it merges the same way.

## The 9 steps

| # | Step | Component | Behavior |
|---|---|---|---|
| 1 | Welcome | `WelcomeStep` | Product-peek feed rail + headline + Get Started |
| 2 | Name | `NameStep` | Conversational input with live echo, gated Continue |
| 3 | Role | `RoleStep` | Icon grid, **auto-advances** on pick |
| 4 | Goal | `GoalStep` | Icon rows, **auto-advances** on pick |
| 5 | Interests | `InterestsStep` | Multi-select chips, live counter, min-3 gate |
| 6 | Time | `TimeStep` | Radio rows + Continue |
| 7 | Experience | `ExperienceStep` | Radio rows + Continue |
| 8 | Notifications | `NotificationsStep` | Sample push + real permission ask |
| 9 | Success | `SuccessStep` | Personalized "first signals" reveal + Enter |

Shared: `OnboardingShell` (progress bar + back), `OptionCard`/`OptionRow`/`RadioRow`, `PrimaryButton`.

## Structure

```
signal-onboarding-ui/
├── README.md · index.ts
├── OnboardingFlow.tsx        ← orchestrator (owns step index + answers only)
├── shared/  types.ts · utils.ts · peek.ts
├── data/    onboarding-options.ts   (default roles/goals/interests/etc. + icon map)
├── components/  OnboardingShell.tsx · PrimaryButton.tsx · OptionCard.tsx
└── steps/   Welcome · Name · Role · Goal · Interests · Time · Experience · Notifications · Success
```

## Usage

```tsx
import { OnboardingFlow, type OnboardingData } from "@/onboarding-ui";

<OnboardingFlow
  onRequestNotifications={(enabled) => enabled && Notification.requestPermission()}
  onComplete={(data: OnboardingData) => {
    saveProfile(data);       // your Supabase write
    navigate("/home");        // your router
  }}
  onSignIn={() => navigate("/login")}
/>;
```

Drive each step yourself instead? Import them individually and pass
`value/onSelect/onContinue` — `OnboardingFlow` is just the reference wiring.

## ⚠ One required keyframe

The Welcome step uses a scrolling feed rail via `animate-[scrollUp_...]`. Add
this to your `src/index.css` if it isn't already there (the app's other
keyframes — `fade-up`, `slide-down`, `ping` — already exist):

```css
@keyframes scrollUp { from { transform: translateY(0); } to { transform: translateY(-50%); } }
```

## Merge checklist (Claude Code)

1. Copy the folder into `src/` (e.g. `src/onboarding-ui/`).
2. Delete `shared/utils.ts`, repoint `cn` to `@/lib/utils`.
3. Add the `scrollUp` keyframe above to `index.css` if missing.
4. Wire `onComplete` (persist + route) and `onRequestNotifications` (OS request).
5. Replace your existing `pages/Onboarding.tsx` body with `<OnboardingFlow …/>`.

## Left out (business logic)

Persistence, the real notification request, routing, and analytics — all
delegated via callbacks. The only local state is the current step + in-progress
answers, which is view state, not business logic; lift it out via individual
steps if you prefer.
