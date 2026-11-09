## 1. Toggle state

- [x] 1.1 In `web/src/components/Timeline.tsx`, add a `costs` kind to `TRACE_KEYS` (`fm.conversationTrace.costs`), give `readTraceToggle` a default-on path for it, and add `showCosts` state wired through the shared `toggleTrace` handler; verify with `npm run typecheck`.
- [x] 1.2 Render the third checkbox (`id="conversation-trace-costs"`, label from a new `conversationTraceCosts` key in `web/src/i18n.tsx`) beside the two existing toggles, only while `showCalls` is true; verify in the browser that it appears and disappears with the LLM calls toggle and that its choice survives a reload.

## 2. Cost pill

- [x] 2.1 Pass `showCosts` down to `TraceRow` → `CallChip` and render, after the chip button, a `span.timeline-trace-cost` with `formatUsd(call.cost)` or `—` plus an "unpriced" hover text (new i18n key) when `cost` is null; verify a priced call, an unpriced call and an error call each show the right pill.
- [x] 2.2 Add the `.timeline-trace-cost` style in `web/src/styles.css` next to `.timeline-trace-chip` (muted mono, rounded, thin border, nowrap); verify the pill sits to the right of the chip and does not change on an error row.

## 3. Verification

- [x] 3.1 Run `npm run typecheck` and `npm test`; both pass.
- [ ] 3.2 Browser check as admin under impersonation: with LLM calls on and costs on, every call row shows a pill; costs off removes every pill while the cost remains in the chip tooltip; LLM calls off hides the costs toggle. Then as an accountant (or staff) viewer: no toggles, no rows, no pills.
