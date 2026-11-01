## 1. Server gate

- [x] 1.1 Widen `viewerMayRequest` in `src/api/viewerAccess.ts` so PUT/POST on `/agents/<id>/clients/<id>/(pause|send-now|retry-send|redraft)` pass for a viewer, keeping every other rule; update the file comment. Verify with `npm run typecheck`.
- [x] 1.2 Extend `tests/viewerAccess.test.ts`: the four allowed routes pass (both methods where relevant), and create / patch / delete client, whatsapp, due-date, documents, approve, and a look-alike path (`/agents/a1/pause`, `DELETE .../pause`) still refuse. Verify with `npm test` (the viewerAccess suite is green).

## 2. Workspace UI

- [x] 2.1 In `web/src/components/ClientView.tsx` take the viewer flag as its own prop, compute `readOnly` from the deleted-client case only, and pass `readOnly || viewer` to `ClientHeader`, `WhatsAppCard` and `DocumentsCard` while `Timeline` gets `readOnly` alone; update `web/src/components/Workspace.tsx` to pass the new prop. Verify with `npm run typecheck` and by signing in as a staff viewer: a live client shows pause / resume / send now / retry / regenerate but no edit, delete, WhatsApp toggle, due-date edit or document actions; a deleted client (admin view-as) still shows nothing.
- [x] 2.2 Change the viewer notice in `web/src/i18n.tsx` to say the viewer looks at the named accountant's account, may start, pause and resume conversations, and cannot change anything else. Verify the notice in the standalone app and in the monday object (`npm run build:gui` before testing in monday).

## 3. Live check and docs

- [ ] 3.1 As a staff viewer in the standalone app: pause a client, resume it, send a scheduled message now, and resume a client whose first message is held; each succeeds and the conversation updates as for the accountant. Then try an edit through the API (e.g. `PATCH /api/agents/<id>/clients/<id>`) under the viewer session and confirm the "Access is read-only." refusal.
- [ ] 3.2 Repeat pause and resume from the monday custom object under a staff viewer; both succeed.
- [x] 3.3 Update the "Staff viewers" section of `docs/agents.md` with the new allow-list and the split UI flag. Verify the section reads correctly.
- [x] 3.4 Commit per the repo Git workflow (`git pull --rebase origin master`, `npm run typecheck`, commit, push).
