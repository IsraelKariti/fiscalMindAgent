## 1. Database

- [x] 1.1 Add `migrations/068_accountant_staff.sql` (table per design D1: id, accountant_user_id FK cascade, email unique lower-cased, created_by FK set null, created_at; index on accountant_user_id) and run `npm run db:migrate`; verify the table exists with `\d accountant_staff` through docker psql
- [x] 1.2 Add `src/db/queries/accountantStaff.ts`: `listForAccountant(userId)` (with `signed_in` from a users join), `findByEmail(email)`, `add(accountantUserId, email, createdBy)` returning null on conflict, `removeForAccountant(id, accountantUserId)`; add the row type to `src/db/types.ts`; verify with `npm run typecheck`

## 2. Server identity and read-only gate

- [x] 2.1 In `src/api/auth.ts` add `req.viewerRole` to the Express request type, the async `resolveStaffViewer` middleware (design D2) and the `viewerReadOnlyGate` middleware (design D3) as pure, unit-testable functions where possible (`src/api/viewerAccess.ts` for the path/method rule); mount both in `src/api/router.ts` between `requireAuth` and `requireWhitelisted`, and let `requireWhitelisted` pass a request with `viewerRole` set; add `tests/viewerAccess.test.ts` to `npm test` covering: GET /agents allowed, GET /agents/x/clients/y/files/z/download allowed, DELETE /agents/x/clients/y refused, POST /agents/x/clients/y/documents/d/approve refused, GET /staff refused, GET /mailbox refused, GET /admin/accountants refused; verify `npm test` passes
- [x] 2.2 Extend `GET /api/me` with `role` and `viewingFor` (design D4), `whitelisted: true` for a viewer; update the `Me` type in `web/src/api.ts`; verify by curling `/api/me` as a staff user (manual check noted in the task once done)
- [x] 2.3 Add a comment on the `/agents/:agentId` mount in `src/api/router.ts` stating that every GET under it is served to read-only viewers and a GET with side effects must check `req.viewerRole`; verify by reading the diff

## 3. Staff routes

- [x] 3.1 Add `src/api/staff.ts` with `GET /staff`, `POST /staff`, `DELETE /staff/:id` on `accountRouter` (design D6) with the refusal order own email → admin → whitelisted accountant → other accountant's staff → duplicate, each with its own 409 message; audit `staff.added` / `staff.removed` (add the two actions to `AuditAction` in `src/audit/audit.ts`); verify with curl as the accountant: add, list shows `signedIn: false`, duplicate in upper case is refused, remove, list is empty, and `#/audit` shows the two events
- [x] 3.2 Make `users.listAll` return `staff_of_email` (design D7) and pass it as `staffOf` from `GET /api/admin/accountants`; verify `npm run typecheck` and the admin list JSON shows the field

## 4. Workspace UI for viewers

- [x] 4.1 `App.tsx`: read `role`/`viewingFor` from `me`, pass `viewer` to `Workspace`, and make `request()` in `web/src/api.ts` treat a 403 with code `read_only` like the ended-session error (no banner); verify in the browser that a viewer sees no red banner on load
- [x] 4.2 `Workspace.tsx` + `ClientView.tsx`: `readOnly` becomes `deletedAt != null || viewer`; hide add-client (sidebar), delete-client and WhatsApp toggle for a viewer; `ViewerContext` gains `readOnly`; show the read-only notice naming the accountant at the top of the workspace; verify in the browser as a viewer: client screen has no edit/pause/redraft/send-now/retry/delete control, no actions menu on document rows, no add-document control, while view and download on a file work
- [x] 4.3 `Settings.tsx`: `viewerOnly` prop renders the dashboard tab alone and skips the mailbox fetch; verify in the browser that a viewer's Settings page has one tab
- [x] 4.4 Add `web/src/components/StaffSettings.tsx` (list with email, added date, signed-in badge, add form, remove via `ConfirmModal`) and the `staff` tab in `Settings.tsx` shown to the accountant and to an impersonating admin, never to a viewer; add i18n strings (tab name, column labels, add/remove/confirm texts, the five refusal messages, the read-only notice, the access-pending line for removed staff) to every locale in `web/src/i18n.tsx`; verify in the browser: add an address, see it listed as not signed in, remove it through the modal
- [x] 4.5 Admin panel: `shared.tsx` `AccountantRow` carries `staffOf`, `StatusBadge` shows "staff of <email>" instead of the no-access badge; verify in the browser on the admin accountants list after a staff user signed in once

## 5. End-to-end check and docs

- [x] 5.1 Live check with two Google accounts: accountant adds the second account's address; the second account signs in and lands in the accountant's workspace read-only; a DELETE sent from the viewer's devtools is answered 403 `read_only`; the accountant removes the address; the viewer's next click is refused and a reload shows the access-pending screen; record the result in this task — owner checked live on 2026-10-27: passed
- [x] 5.2 Update `docs/agents.md` (tenancy section: "Staff viewers" paragraph covering the table, the middleware order, the GET-only rule and the `readOnly` UI path) and `.env.example` if any setting was added (none expected); run `npm run typecheck` and `npm test`; commit per the repo git workflow
