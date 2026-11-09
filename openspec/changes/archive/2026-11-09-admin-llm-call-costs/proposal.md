## Why

An admin reading a client's conversation trace cannot see what each LLM call cost without hovering every chip (the cost sits in the tooltip) or opening the call modal. Putting the cost next to each call makes expensive stages and runaway cycles visible at a glance, while a toggle keeps the trace uncluttered when the admin is reading the flow, not the bill.

## What Changes

- In the workspace conversation tab under impersonation, every LLM call row shows a small cost pill to the right of the call chip, with the call's recorded cost in USD (the same value the call modal and the call browser show). An unpriced call shows a dash pill.
- A new "costs" toggle sits beside the existing "LLM calls" and "code steps" toggles. It shows only while the LLM calls toggle is on, is on by default, and is remembered per browser like the other two.
- Admin-only, like the rest of the trace: the toggles and the rows exist only for an admin viewer, and the data comes from the admin conversation endpoint, which already refuses an accountant's or staff member's session. No new server data is needed — the cost is already in the payload.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `conversation-trace`: adds the per-call cost pill and the costs toggle to the workspace trace; restates that accountants and their staff never see either.

## Impact

- `web/src/components/Timeline.tsx`: call chip row gains the pill; trace toolbar gains the third toggle and its per-browser key.
- `web/src/styles.css`: pill style (muted, mono, rounded) next to the existing chip styles.
- `web/src/i18n.tsx`: toggle label and pill tooltips.
- No API, database, or agent changes. The admin conversation viewer modal (#/agents card) already prints the cost inline and is unchanged.
