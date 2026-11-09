## Context

See proposal.md - Why. Today the workspace timeline (`web/src/components/Timeline.tsx`) renders each LLM call as a `CallChip` inside a `li.timeline-trace.timeline-trace-call` row (a wrapping flex row, `dir="ltr"`). The chip's tooltip already carries `formatUsd(call.cost)`. The trace rows come from `api.adminGetClientConversation`, whose `calls[]` entries (`LlmCallSummary`) already include `cost: number | null` as recorded at call time by `llm_calls.cost`. The endpoint is mounted behind `requireAdmin` (checked on the real user, not the impersonated one), and the toggles render only when `useViewer().isAdmin` is true and a client id is present. Two toggles exist, each remembered under a `localStorage` key in `TRACE_KEYS`.

## Goals / Non-Goals

**Goals:**
- Show the recorded cost beside each call chip with one shared formatter (`formatUsd`), so the pill, the modal and the call browser never disagree.
- Add a third toggle that follows the pattern of the two existing ones (state, persistence, placement).
- Zero server change; zero change to what an accountant can receive.

**Non-Goals:**
- A running total or per-conversation sum of costs (not asked; the admin clients table already has a cost column).
- Changing the admin conversation viewer modal (`AgentConversationsCard.tsx`), which already prints the cost inline per call.
- Showing costs in the step rows or the discarded-draft bubbles.
- Recomputing costs with current prices.

## Decisions

1. **Pill outside the chip, as a sibling in the same row.** The chip is a `<button>` that opens the modal; nesting the pill inside would make the cost part of the clickable surface and clip it with the file label. A sibling `<span className="timeline-trace-cost">` after the button, in the row's flex line, lands to the right because the row is `dir="ltr"`. Alternative considered: a trailing segment inside the chip — rejected for the clipping and hit-area reasons above.

2. **Toggle state lives in `TRACE_KEYS` as a third kind (`costs`).** `readTraceToggle` returns false when nothing is stored; the costs toggle must default to on, so the reader takes a default parameter (or a small `TRACE_DEFAULTS` map) rather than a special case in the component. Alternative: a separate `useState` with its own key — rejected to keep the three toggles symmetrical and the `toggleTrace` handler shared.

3. **Toggle shown only while LLM calls is on.** Conditional render on `showCalls`; the stored value is untouched when hidden, so turning LLM calls back on restores the previous costs choice. Alternative: always show but disabled — rejected as noise in a toolbar that is already tight.

4. **Unpriced call shows a `—` pill, not nothing.** Keeps every call row the same shape, so a missing pill never reads as "free". The hover text explains.

5. **Formatting reuses `formatUsd` from `web/src/format.ts`.** It already handles the `<$0.0001` floor and 4-vs-2 decimals.

6. **Style**: muted mono text, `border-radius: 999px`, thin border, no gradient, so it reads as a label and never competes with the purple chip. Error rows keep the chip's red border; the pill does not change color.

## Risks / Trade-offs

- [Pill wraps under the chip on narrow widths because the row is `flex-wrap: wrap`] → acceptable; the pill stays adjacent to its chip. `white-space: nowrap` on the pill keeps the amount in one piece.
- [Hebrew UI with an LTR row] → the row is already `dir="ltr"`; the pill text is ASCII, so no bidi issue.
- [Admin leak] → none: no new endpoint, no new field; the component gates on `isAdmin` exactly where the existing toggles do.
