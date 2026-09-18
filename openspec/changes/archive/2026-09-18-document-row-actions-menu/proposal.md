## Why

In the workspace documents card, a row that is still required shows a pill button labelled "לא נדרש" ("not required") and no status badge. The button is an action ("mark as not required"), but it reads as the row's status, so a `pending` row looks like a `not_required` row. The accountant cannot tell status from action at a glance.

## What Changes

- Every row of the capital-declaration documents list shows a status badge, including `unresolved`, `pending` and `not_required` rows, which show none today.
- All per-row actions (mark required, mark not required, confirm receipt, approve manually, return to required, remove) move out of the row into one "⋯" actions menu at the end of the row. The inline action buttons and the standalone "×" remove button go away.
- Action labels become verb phrases ("סימון כלא נדרש" instead of "לא נדרש"), so a label can never be read as a status.
- The menu is a styled in-app popover (no browser popups), keyboard operable, and correct in the RTL layout.
- Which actions each status offers, and what each action does, stay exactly as today. No API, database or agent change.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `workspace-documents`: adds requirements for the per-row status badge, the per-row actions menu, and the actions offered per status. Existing requirements are unchanged.

## Impact

- `web/src/components/DocumentsCard.tsx` — capital row rendering (badge for every status, menu instead of inline buttons). The unreachable classic row is left as is.
- New small menu component under `web/src/components/` plus its styles in `web/src/styles.css`.
- `web/src/i18n.tsx` — new status-badge strings, verb-form action labels, menu trigger label. The app is Hebrew-only, so no other language is touched.
- The card is also rendered inside the monday custom object (`/monday-object`); that surface needs `npm run build:gui` before it shows the change.
- No server, migration, prompt or eval impact.
