## Context

See proposal.md for the motivation. Today identity has two layers (`src/api/auth.ts`): `requireAuth` reads the session cookie into `req.realUserId`, lets an admin's signed view-as cookie set `req.userId` to the accountant, and `requireWhitelisted` passes only admins and whitelisted emails. Everything below `/api/agents/:agentId` resolves the instance with `getByIdForUser(agentId, req.userId)`, so whoever `req.userId` points at is "the accountant". The workspace already has a `readOnly` flag (`ClientView.readOnly`, threaded through `ClientTabContext`, `Timeline`, `ClientHeader`, `DocumentsCard`) that hides every action control for deleted clients under admin view-as. The admin panel already distinguishes whitelisted, invited and "no access" users (`web/src/components/admin/shared.tsx`).

## Goals / Non-Goals

**Goals:**
- Reuse the existing effective-user model: a viewer's `req.userId` is the accountant, so no workspace query changes.
- Enforce read-only on the server with one rule, not per route.
- Reuse the existing `readOnly` UI path so the viewer's client screen is the same code as the deleted-client screen.

**Non-Goals:**
- Per-employee permissions or an editing role. One role: viewer.
- Staff on the monday surface (monday identity is monday's; staff do not apply there).
- An employee belonging to several accountants.
- Inviting by email (no mail is sent; the accountant tells the employee to sign in).

## Decisions

**D1. Storage: `accountant_staff` table (migration 068).** Columns: `id uuid`, `accountant_user_id uuid REFERENCES users ON DELETE CASCADE`, `email text` (lower-cased, `UNIQUE`), `created_by uuid REFERENCES users ON DELETE SET NULL`, `created_at`. The global unique email is what makes "one accountant per employee" a database fact, so the identity lookup is a single row. Alternative: a role column on `users` plus a parent id — rejected because the employee has no `users` row until their first Google login, and the accountant must be able to list and remove the address before that.

**D2. Identity: viewers resolve in a new async middleware `resolveStaffViewer`, mounted right after `requireAuth` and before `requireWhitelisted`.** It runs only when there is no active view-as session (`req.userId === req.realUserId`). It loads the real user; if the user is not an admin and not whitelisted, it looks up `accountant_staff` by the lower-cased email. On a hit it sets `req.userId = accountant_user_id`, `req.viewerRole = 'viewer'` (new `Express.Request` field) and marks the request as allowed through the whitelist gate. `requireWhitelisted` passes a request with `req.viewerRole` set. This keeps `resolveAgentInstance`, `listAgents`, `clientScope`, SSE and file downloads untouched: they already read `req.userId`. Alternative: a signed "acting-as" cookie like impersonation — rejected; the staff row is the source of truth and must be revocable immediately, so it is read per request (one indexed query; `requireWhitelisted` already does a `users` read per request).

**D3. Read-only gate: `requireNotViewer` + one path/method rule.** A middleware `viewerReadOnlyGate` mounted after `resolveStaffViewer`: when `req.viewerRole === 'viewer'`, allow only `GET` requests whose path is `/agents` or starts with `/agents/`; everything else (any non-GET, every account route, `/staff`, `/admin/*`) is refused with `403 { error: 'Access is read-only.', code: 'read_only' }`. The agent-type router (`src/agents/declarationOfCapital/router.ts`) and the workspace router are mounted under `/agents/:agentId`, so their POST/PUT/PATCH/DELETE routes are covered by the method rule without touching them. GET routes under `/agents/:agentId` are all reads today (dashboard, clients, events, email-sender, wa-sender, client, files, download/view, emails, documents); a task adds a comment on the mount that any future GET with side effects must check `req.viewerRole`. Alternative: per-route `requireAccountant` checks — rejected, easy to forget on a new route.

**D4. `/api/me` reports the role.** Response gains `role: 'accountant' | 'viewer'` (admins and impersonating admins report `accountant`, the current behavior) and, for a viewer, `viewingFor: { id, email, name, hebrewName }` of the accountant. `whitelisted` is `true` for a viewer so `App.tsx`'s existing gate lets them in. After removal, `me` answers `whitelisted: false` and the existing `AccessPending` screen shows (its text already says to contact the administrator; a viewer-specific line is added by the i18n task).

**D5. UI read-only = `viewer` prop into the existing `readOnly` path.** `App.tsx` passes `viewer={me.viewingFor}` to `Workspace`; `Workspace` sets `readOnly` on `ClientView` when the viewer is set (today `readOnly = client.deletedAt != null`; it becomes `deletedAt != null || viewer`), hides the add-client button, the WhatsApp toggle and the delete action, and shows a top notice "You are viewing <hebrewName or name>'s account, read-only". The `ViewerContext` value gains `readOnly: boolean` for components that read it directly. `Settings` gets `viewerOnly` and renders the dashboard tab alone (no general, agent, test or staff tab) and does not fetch the mailbox. The deleted-client banner stays keyed on `deletedAt`, so a viewer does not see it.

**D6. Staff tab = account-level routes `GET /api/staff`, `POST /api/staff { email }`, `DELETE /api/staff/:id`** in a new `src/api/staff.ts`, mounted on `accountRouter`, keyed on `req.userId` (the accountant, also under admin view-as). POST validates with zod (`z.string().email()`), lower-cases, and refuses in this order with distinct `409` messages: own email, admin email (`users.isAdminEmailInDb`), whitelisted email (`whitelist.isWhitelisted`), already on another accountant's list, duplicate on own list (`ON CONFLICT` → look up the owner). GET joins `users` by email to report `signedIn` (`google_sub IS NOT NULL`). Each write records `staff.added` / `staff.removed` audit events (actorType `admin` when `req.realUserId !== req.userId`, else `accountant`; target user = accountant; detail `{ email }`). The tab is a new `web/src/components/StaffSettings.tsx` rendered by `Settings` as a `staff` tab (shown when not `viewerOnly`), with `ConfirmModal` for removal, following the look of the existing whitelist cards in the admin panel.

**D7. Admin list label.** `users.listAll` adds `staff_of_email` via `LEFT JOIN accountant_staff s ON s.email = lower(u.email) LEFT JOIN users a ON a.id = s.accountant_user_id`; the admin accountants API passes `staffOf`, and `StatusBadge` shows a neutral "staff of <email>" badge for such rows instead of the "no access" badge. Deleting an accountant cascades their staff rows (D1), so no admin-side cleanup is needed.

**D8. Impersonating a viewer.** An admin may click view-as on a staff user's row. The effective user is then the employee, who owns no instances, so the workspace shows the existing "no agents" message. Acceptable and unchanged; the admin row label (D7) tells the admin to view as the accountant instead.

## Risks / Trade-offs

- [A viewer's open tab keeps showing data after removal] → each new request is refused (403) and the next page load shows the access screen; the api client turns a `read_only`/not-activated 403 into no banner, as it does for the ended view-as session. Already-loaded data is not recalled; accepted.
- [A future GET route under `/agents/:agentId` that mutates would be open to viewers] → comment at the mount plus the `req.viewerRole` field; the review checklist in `docs/agents.md` names it.
- [Two DB reads per request for every signed-in user] → `resolveStaffViewer` runs the staff lookup only for users that are neither admin nor whitelisted (accountants cost nothing extra); the staff lookup is a unique-index hit.
- [The accountant adds an address with a typo] → the tab shows "not signed in yet" until the employee signs in, and the address can be removed and re-added.

## Migration Plan

1. Deploy code + migration 068 (table + unique index). No backfill.
2. Rollback: dropping the table removes all staff access; the code paths degrade to "not activated" for those users.
