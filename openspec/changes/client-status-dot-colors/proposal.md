## Why

The colored dot next to each client (sidebar list and overview list) answers "what is the agent doing with this client?": yellow pulsing = chasing, green = all documents collected, red = the collection window ended. The accountant reads it differently: they want to know whether the file is now in their hands, and whether the client refused. Today a window-ended client is red (looks like a problem), and a client who declined the WhatsApp collection (change `intro-template-decline`, 2026-11-01) is red in the overview but still yellow in the sidebar.

## What Changes

- The dot gets three meanings, the same in the sidebar and the overview: **green** when the agent is finished with the client, either because every document was collected or because the collection window ended; **yellow** (pulsing, as today) while the collection is in progress inside the window; **red** when the client refused the WhatsApp collection.
- The hover text of the dot names the exact state (done / window ended / in progress / refused), so the two green cases stay distinguishable on hover.
- The donut "clients by status" on the overview is unchanged (it counts complete / active / not started, not the dot states).

## Capabilities

### New Capabilities
- `client-status-indicator`: what the client dot in the sidebar and the overview list means, which color each client state gets, and the hover text.

### Modified Capabilities
- (none in `openspec/specs/`; the not-yet-archived `client-decline` delta says the overview list uses "the same handed-off styling as an overdue stop" — this spec supersedes that sentence: a refused client is red on its own, an overdue stop is green.)

## Impact

- `web/src/components/Sidebar.tsx` (`dotFor`), `web/src/components/Overview.tsx` (status dot), a shared `clientDotState` helper in `web/src/format.ts`, `web/src/styles.css` (`.status-dot.*` classes), `web/src/i18n.tsx` (dot titles).
- `src/db/queries/dashboard.ts` already exposes `overdue_stopped` and `declined` per client; no server change.
