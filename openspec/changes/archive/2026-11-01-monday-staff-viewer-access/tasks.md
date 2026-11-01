## 1. Shared access computation (server)

- [x] 1.1 In `src/api/auth.ts`, extract the admin → whitelist → staff-list lookup from `GET /api/me` into one exported function that takes a `users` row and returns `{ whitelisted, role, viewingFor }`; make `GET /api/me` call it. Verify with `npm run typecheck` and by signing in locally as a staff viewer and as an accountant: `GET /api/me` answers exactly as before.
- [x] 1.2 In `src/api/monday.ts`, make `sessionStatus()` and `GET /api/monday/me` call that function, so a staff viewer gets `whitelisted: true`, `role: 'viewer'` and `viewingFor` naming the accountant. Verify by calling `POST /api/monday/session` locally with a monday identity whose email is on a staff list (mock token signed with the local `MONDAY_CLIENT_SECRET`) and reading `whitelisted: true` + `viewingFor` in the reply.

## 2. Read-only gate on the monday workspace API

- [x] 2.1 In `src/api/monday.ts`, mount `resolveStaffViewer` and `viewerReadOnlyGate` on the `/app` router between `requireMondayUser` and `requireWhitelisted`, same order as `src/api/router.ts`. Verify with `npm run typecheck`, then: a viewer's `GET /api/monday/app/agents` lists the accountant's agents (200) and a viewer's `DELETE /api/monday/app/agents/<id>/clients/<id>` is refused with the `read_only` error (403) and the client is unchanged.
- [x] 2.2 Verify removal: remove the viewer's address from the staff list, repeat `GET /api/monday/app/agents` under the same monday identity, confirm the "not activated" 403, and confirm `POST /api/monday/session` now answers `whitelisted: false`.

## 3. monday shell shows the viewer mode

- [x] 3.1 In `web/src/monday/api.ts`, add the optional `role` and `viewingFor` fields to `MondaySessionStatus` (the `Me` type already has them). In `web/src/monday/MondayObject.tsx`, wrap `Workspace` in `ViewerProvider` with `readOnly: me.viewingFor != null` and pass `viewer={me.viewingFor ?? null}`, mirroring `web/src/App.tsx`. Verify with `npm run typecheck` and `npm run build:gui`.
- [x] 3.2 (owner confirmed 2026-11-01) Browser check in monday (owner): open the FiscalMind custom object as a staff member. Expect the accountant's workspace, the read-only notice naming the accountant, no add-client / delete / pause / document-action controls, and the Settings page showing only the dashboard tab. Then open it as a non-listed monday user and expect the "not activated" screen as before.

## 4. Docs and tests

- [x] 4.1 Update the staff-viewer paragraph in `docs/agents.md` to say both surfaces (standalone and the monday object) share the access function and the middleware order, and note that the Staff tab "signed in" column counts Google sign-ins only. Verify the paragraph reads correctly in the file.
- [x] 4.2 Run `npm test` and confirm `tests/viewerAccess.test.ts` and `tests/signInByEmail.test.ts` still pass.
- [x] 4.3 Commit per the repo Git workflow (`git pull --rebase origin master`, `npm run typecheck`, commit, push) and confirm the push lands on `master`.
