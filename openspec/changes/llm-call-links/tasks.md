# Tasks: llm-call-links

## 1. Pure helper + tests

- [x] 1.1 `web/src/components/callLink.ts`: `callLinkOf`, `isCallHash`, `parseCallHash`, `callDetailsText` (link, blank line, formatted JSON of the whole `LlmCallDetail`), documented like `stepLink.ts`.
- [x] 1.2 `tests/callLink.test.ts`: link shape; `isCallHash` true for `#/llm-calls/<id>` and `#/llm-calls/x`, false for `#/llm-calls`, `#/steps/<id>`, `#/`; `parseCallHash` accepts trailing slash, rejects a non-uuid and a stray `%`; `callDetailsText` starts with the link and round-trips `request`, `response` and `documentFileId: null`. Add the file to the `test` script list in `package.json`.

## 2. Call modal copy buttons

- [x] 2.1 `web/src/i18n.tsx`: `callCopyLink`, `callCopyDetails`, `callNotFound`, `callNotFoundHint` (Hebrew, same register as the step keys).
- [x] 2.2 `web/src/components/admin/AdminLlmCalls.tsx`: in `CallDetailModal`, wrap the title in `gate-modal-head` and, once `call` is loaded, render two `CopyButton`s (`callLinkOf(call.id, window.location.origin)`, `callDetailsText(call, window.location.origin)`) with the new labels in a `btn-row gate-modal-copy`. Verify in the browser from a trace chip (impersonating), from the admin call browser, and from a call link: both buttons copy, show the check mark, and the copied details JSON equals what the panes show.

## 3. Call link while impersonating

- [x] 3.1 `web/src/components/CallLinkPage.tsx`: parse the hash; valid id → `CallDetailModal` with `onClose`; malformed → "call not found" card (reuse the step card markup, `stepBackToApp` button).
- [x] 3.2 `web/src/App.tsx`: when `isAdmin && impersonating && isCallHash(hash)`, render the env banner + `CallLinkPage` with `onClose` setting the hash to `#/`, before the admin / workspace split. Verify: paste a call link while impersonating → modal; close → workspace; malformed id → not-found card; the same link without impersonation still opens over the admin call browser; a signed-in accountant lands in their workspace.

## 4. Shell command

- [x] 4.1 `scripts/showCall.ts`: last uuid of the argument → `llmCalls.getById` → print the call as JSON with camelCase keys (same fields as "copy details", plus `clientName` from `clients.getById`); exit 1 with the usage / not-in-this-database hints like `showStep.ts`; `pool.end()` in `finally`.
- [x] 4.2 `package.json`: `"call": "tsx scripts/showCall.ts"`. Verify with a real local call id and with a pasted link.

## 5. Docs

- [x] 5.1 `CLAUDE.md` "Step links" section: add that a call link (`<site>/#/llm-calls/<id>`) is read with `npm run call -- "<link>"`, same host rule, same "copy details" fallback.
- [x] 5.2 `docs/agents.md` trace section: describe the call modal's two copy buttons, the impersonation intercept in `App.tsx`, and `npm run call`.
- [x] 5.3 `npm run typecheck` and `npm test` pass; commit per the Git workflow.
