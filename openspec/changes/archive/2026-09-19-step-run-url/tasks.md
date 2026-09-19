## 1. Read one step by id (backend)

- [x] 1.1 Add `getById(id)` to `src/db/queries/auditEvents.ts` next to `listForClient`, returning one row or null. Verify with `npm run typecheck`.
- [x] 1.2 In `src/api/llmAdmin.ts`, extract the step mapper the conversation endpoint uses into a shared function and add `adminGetAuditEvent` (zod uuid on `:id`, 404 when missing, same `AdminConversationStep` shape without `discarded`). Register `GET /admin/audit-events/:id` behind `requireAdmin` in `src/api/router.ts`. Verify against the running dev stack: an admin session gets the row for a real id, 404 for a random uuid and for a non-uuid, and a non-admin session gets 403.
- [x] 1.3 Confirm the conversation endpoint's output is unchanged after the mapper extraction by comparing `GET /api/admin/clients/:id/conversation` steps for one client before and after (same keys, same values).

## 2. Step link and copy button (frontend)

- [x] 2.1 Add `stepLinkOf(stepId)` and `parseStepHash(hash)` in a new `web/src/components/stepLink.ts` (uuid check, tolerant of `#/steps/<id>` with or without a trailing slash). Add `tests/stepLink.test.ts` covering a valid link, a malformed id, another hash, and the round trip; add it to the `npm test` list. Verify with `npm test`.
- [x] 2.2 Add `api.adminGetStep(id)` in `web/src/api.ts` calling the new endpoint. Verify with `npm run typecheck`.
- [x] 2.3 Add the "copy link" button at the top of the modal, beside the title (remove the bottom action row and the close button; focus the dialog on open), in `web/src/components/StepDetailModal.tsx` using `CopyButton` with a visible label (add an optional `label` prop to `CopyButton` if needed), plus the i18n keys in `web/src/i18n.tsx` (Hebrew and English) and any small style in `web/src/styles.css`. Verify in the browser: from a gate row in the workspace trace and from a row in the admin conversation viewer the clipboard holds `<origin>/#/steps/<id>`, the button shows the copied state, and Tab reaches it.
- [x] 2.4 Add `stepDetailsText(step, origin)` to `web/src/components/stepLink.ts` (link on line one, blank line, then the step as two-space JSON without `discarded`) and the "copy details" button beside "copy link" in `StepDetailModal.tsx`, with its own i18n label and accessible name. Extend `tests/stepLink.test.ts`: the first line is the link, the JSON parses, and its `detail` deep-equals the input including a failed check's observed / expected / note. Verify with `npm test`, and in the browser by pasting the clipboard into an editor for a failed gate row and for an `apply_retirements` row.
- [x] 2.5 Create `web/src/components/StepLinkPage.tsx`: load the step, show the spinner, render `StepDetailModal`, and on 404 or a malformed id show an in-app "step not found" card with a back button. Closing sets the hash to `#/`. Verify with `npm run typecheck`.
- [x] 2.6 In `web/src/App.tsx`, after `api.me()` resolves, render `StepLinkPage` when the hash is a step link and the real user is an admin; track the hash with a `hashchange` listener so closing returns to the normal shell without a reload. Verify in the browser: the link opens as a non-impersonating admin (close lands on the overview), as an impersonating admin (close lands in the workspace), an unknown id shows "not found", and an accountant session lands in their own workspace with no request to the step endpoint succeeding.

## 3. Reading a link from Claude's shell

- [x] 3.1 Add `scripts/showStep.ts` and the npm script `step`: accept a full link or a bare id, print the row as JSON (id, time, action, severity, target, client id, detail), exit 1 with a plain message when not found or when the argument holds no uuid. Verify by running `npm run step -- "<a link copied from the modal>"` against the local database and comparing with the modal's raw JSON.
- [x] 3.2 Add one short section to the repo `CLAUDE.md` ("Step links"): a pasted `#/steps/<id>` link is read with `npm run step -- <link>`, never fetched over HTTP; the host says which environment it belongs to; a link from a non-local host cannot be read from the shell, so ask the owner for the "copy details" text. Verify by reading the section.

## 4. Docs and wrap-up

- [x] 4.1 Update the trace section of `docs/agents.md`: the step link form, the two copy buttons (link, details), the new endpoint and the script. Verify by reading the section.
- [x] 4.2 Run `npm run typecheck` and `npm test`, then commit per the repo git workflow and push.
