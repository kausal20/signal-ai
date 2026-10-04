# Signal application design

## Direction
Preserve the current editorial layouts, Newsreader headings, Inter body text, restrained green accents, and flat surfaces.

## Runtime ownership
`src/ui-editorial/tokens.css` owns colors and typography. `AppShell` resolves the persisted light, dark, or system preference for all five main destinations. Signal AI follows that same preference.

## Motion
`src/ui-editorial/motion.tsx` owns easing, duration, stagger, reveal, and state-swap primitives. Use short entrances, viewport reveals, sliding navigation indicators, and press feedback. AppShell's MotionConfig respects reduced motion. Avoid perpetual decorative animation.

Motion durations are 140ms for feedback, 220ms for page/state changes, and 280ms for section reveals. Page entrances travel 6px; story rows reveal independently when scrolled into view, once per mount. Stagger delays are capped at 180ms across a group. Navigation icons settle by 2px, and presses compress by at most 3% for shared row controls. A root MotionConfig also protects secondary routes under reduced motion. Keep opacity and transform as the primary animated properties; do not animate blur or large shadows.

## Interaction
Home’s TodayBrief uses at most five unique stories in 220×158px cards, looping from the fifth back to the first at 22px/second with Framer Motion. A duplicate of that same sequence provides the seamless join, never extra unique stories. Per the user’s explicit continuous-motion request, the strip starts automatically without play/pause controls; hover, touch, keyboard focus, and expanded reading pause it. Expansion respects reduced motion. Tapping a card reveals its summary and actions below. The standalone lead story is removed to avoid repetition. Source dates remain visible; older feed stories are not relabelled as published today.

Profile uses native select controls intentionally, with operating-system popup and keyboard behavior. Shared segmented controls and row menus own arrow-key navigation and focus restoration.

Home's SignalAIEntry is a real form. Empty or whitespace-only questions cannot submit or navigate. Valid questions enter Signal via route state. New conversation resets messages, context, and pending prompts. Search URL parameters own the query so browser history and displayed results agree. Profile saves preserve drafts on failure and release busy state.

## Scope
The editorial shell owns Home, Search, Signal, Saved, and Profile. Onboarding uses the same editorial tokens, persisted appearance preference, Newsreader headings, Inter body text, and 430px app width in its own navigation-free shell. All onboarding steps use flat surfaces and restrained green controls. Older secondary tools still use the legacy shell.

## AI cost controls
MeshAPI uses the pinned `google/gemini-2.5-flash-lite` model for all text generation. Background story reasoning is capped at five stories per publish run through `AI_REASONING_STORY_LIMIT`; the managing-editor second pass is capped at ten stories through `AI_REVIEW_STORY_LIMIT`. These are server-side limits and can be tightened without changing the client.
