# Signal UI behavior

## Canonical UI Map

| Capability | Canonical owner | Source of truth | Allowed variants | Verification |
|---|---|---|---|---|
| Select/Listbox | ProfilePage Select | DESIGN.md | native OS popup | keyboard inspection |
| Form | SignalAIEntry, SignalPage composer | DESIGN.md | question, conversation | SignalAIEntry.test.tsx |
| Navigation | AppShell, SignalHeader, BottomNavigation | editorial routes | desktop, mobile | browser navigation at 390px |
| Theme | theme.ts, tokens.css | DESIGN.md | light, dark, system | browser cross-page comparison |
| Motion | ui-editorial/motion.tsx | DESIGN.md | reveal, stagger, swap, press | browser and reduced-motion policy |
| Conversation | ChatProvider | useAskSignal | article context, general | ChatProvider.test.tsx |

## Source and scope
The user requested coherent page appearance, empty-submit prevention, smoother Framer Motion, and correction of interaction gaps. Existing backend and data-lifecycle behavior remain authoritative. This contract covers the five editorial destinations; the whole-project static audit additionally reports outstanding legacy UI findings.
