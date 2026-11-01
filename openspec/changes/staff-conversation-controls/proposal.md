## Why

An accountant's staff members can only look at the workspace: every control that moves a client's conversation along (start it, pause it, resume it, send the waiting message now, retry a failed send or draft) is hidden from them and refused by the server. The accountant wants their whole team to be able to press those buttons themselves instead of asking the accountant each time (request of 2026-11-01).

## What Changes

- A staff viewer may press the conversation-flow controls on a client: pause, resume (including the resume that sends the held first message and so starts the conversation), send now, retry send, and retry draft / redraft. The server accepts those requests from a viewer's session exactly as from the accountant, on both sign-in surfaces (standalone app and the monday custom object).
- Everything else a viewer could not do stays refused: editing or deleting a client, the WhatsApp toggle, the due date, document rows, adding documents or clients, settings, connections, the staff list, and the admin panel. The admin-only approve-draft control stays admin-only.
- The viewer notice changes from "read-only, nothing can be changed" to say that the viewer may start, pause and resume conversations but cannot change anything else.
- This applies to every staff member of every accountant; there is no per-member or per-accountant switch (assumption: the accountant asked for "every team member", and the staff list has no roles today).
- No change to who may be added to a staff list, to sign-in, to removal, or to auditing of the staff list.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `accountant-staff-access`: the "signs in as a read-only viewer" requirement becomes "signs in as a viewer who may drive conversations"; the "a viewer cannot change anything" requirement is narrowed to exclude the conversation-flow actions; a new requirement states which conversation-flow actions a viewer may take.

## Impact

- `src/api/viewerAccess.ts` (+ `tests/viewerAccess.test.ts`): the one allow-rule gains the five conversation-flow routes (`PUT .../pause`, `POST .../send-now`, `POST .../retry-send`, `POST .../redraft`) under `/agents/<id>/clients/<id>/`. Both middleware chains (`src/api/router.ts`, `src/api/monday.ts`) already apply this rule, so no route code changes.
- `web/src/components/Workspace.tsx`, `ClientView.tsx`, `Timeline.tsx`: the viewer's read-only flag must no longer hide the pause/resume/send-now/retry controls, while still hiding edit, delete, WhatsApp, due date, document and add-client controls (and the deleted-client read-only path keeps hiding everything).
- `web/src/i18n.tsx`: the viewer notice wording.
- `docs/agents.md` staff-viewer section: the new allow-list.
- No migration, no new dependency, no monday configuration change.
