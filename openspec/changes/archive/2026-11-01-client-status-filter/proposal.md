## Why

The client list shows each client's state as a colored dot (green = the agent is finished, yellow = in progress, red = the client refused; change `client-status-dot-colors`, 2026-11-01), but the accountant cannot narrow the list to one state. With dozens of clients, "show me only the ones that refused" or "only the ones still in progress" means scanning dots by eye.

## What Changes

- A segmented control (one bar of four buttons, exactly one pressed) sits between the search box and the client list: "הכל" with the total count, then a green, a yellow and a red button, each a dot plus the count of clients in that state.
- "הכל" is pressed when the page opens. Pressing a color shows only the clients whose dot has that color; pressing "הכל" shows everyone again.
- The search box and the control combine: the list shows clients that match both.
- Counts follow the list currently loaded (live clients, or the deleted list when the admin's toggle is on) and ignore the search text.
- The choice is kept while the page is open and reset on reload (no browser storage).

## Capabilities

### New Capabilities
- (none)

### Modified Capabilities
- `client-search`: adds the status control and how it combines with the search; the existing search requirements are unchanged.

## Impact

- `web/src/components/Sidebar.tsx` (control + filter), `web/src/format.ts` (reuse `clientDotState`), `web/src/i18n.tsx` (labels, titles), `web/src/styles.css` (segmented control).
- No server change.
