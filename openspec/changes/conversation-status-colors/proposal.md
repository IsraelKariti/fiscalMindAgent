## Why

Today the client dot folds two different outcomes into one green: "every document collected" and "the collection window ended with documents still missing". The accountant cannot tell a finished file from an unfinished one at a glance, and the in-progress color (yellow) reads as a warning although nothing is wrong. The owner wants four colors with one outcome each.

## What Changes

- The client dot gets **four** colors instead of three, one meaning each:
  - **blue**: the agent is still collecting inside the collection window (pending client, not declined, not stopped by the window; includes paused, held-first-message and never-contacted clients).
  - **green**: every document was collected (goal complete).
  - **red**: the client declined the WhatsApp collection on the first message (or later) and the agent stopped.
  - **orange**: the collection window passed and the documents were not fully collected (overdue stop).
- The two former greens split: "window ended" moves from green to orange. "In progress" moves from yellow to blue. Red and complete-green keep their meaning.
- The hover texts stay as today (one per state); only the colors change.
- The status filter bar under the search box grows from four buttons to **five**: "הכל", blue, green, orange, red, each with its count. Orange gets its own button because it is now a color of its own.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `client-status-indicator`: the dot has four colors (blue / green / red / orange) instead of three; "window ended" is orange, not green; "in progress" is blue, not yellow.
- `client-search`: the status control has five buttons (all, blue, green, orange, red) instead of four.

## Impact

- Web only, no server or database change: `web/src/format.ts` (dot color mapping and counts), `web/src/components/Sidebar.tsx` (filter buttons), `web/src/components/Overview.tsx` (uses the same rule, no change expected), `web/src/i18n.tsx` (filter button hover texts), `web/src/styles.css` (dot colors, one new blue token and one orange token).
- Tests: a new `tests/clientDot.test.ts` for the state → color mapping and the counts, added to the `npm test` list.
- `STYLE.md` / Notion: none. `docs/agents.md`: no mention of the dot colors today, nothing to update.
