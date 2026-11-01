## Context

See proposal.md for motivation. Two surfaces answer "may this person in, and as whom?":

- Standalone app: `GET /api/me` (`src/api/auth.ts`) checks admin, then `whitelisted_emails`, then `accountant_staff` by email, and answers `whitelisted` + `role` + `viewingFor`. Every later `/api/*` request runs `requireAuth` → `resolveStaffViewer` (rewrites `req.userId` to the accountant, sets `req.viewerRole`) → `viewerReadOnlyGate` → `requireWhitelisted`.
- monday object: `POST /api/monday/session` and `GET /api/monday/me` (`src/api/monday.ts`) check admin and `whitelisted_emails` only. The `/api/monday/app` mount runs `requireMondayUser` → `requireWhitelisted` with no staff step. The web shell `MondayObject.tsx` renders `Workspace` without a `viewer` prop and without `ViewerProvider`, so even if the server let a viewer in, the object would show write controls.

The monday user row is keyed by email too (`users.createFromMonday` on first contact, `users.signInByEmail` takes it over on a later Google login), so the staff lookup by email works on both surfaces without a new mapping.

## Goals / Non-Goals

**Goals:**
- One shared access computation for both surfaces, so they can never disagree again.
- The monday `/app` mount gets the same middleware order as the standalone router.
- The monday shell gets the same viewer rendering as the standalone shell.

**Non-Goals:**
- No change to how a monday user is provisioned, linked, or whitelisted.
- No change to the read-only rule itself (`viewerAccess.ts`) or to the Settings tabs a viewer sees.
- No admin views inside monday (they stay standalone-only, as today).

## Decisions

1. **Extract the access computation from `GET /api/me` into one function in `auth.ts`** (input: a `users` row; output: `whitelisted`, `role`, `viewingFor`), and call it from `GET /api/me`, `sessionStatus()` and `GET /api/monday/me`.
   Alternative: copy the staff lookup into `monday.ts`. Rejected because the bug is exactly a copy that drifted; a single function removes the class of error.

2. **The monday session status keeps its `whitelisted` boolean** and sets it true for a viewer; it also gains `role` and `viewingFor`. The web gate (`useMondaySession.tsx`) keys only on `whitelisted`, so the pending/ready decision needs no change. `GET /api/monday/me` returns the same shape as `GET /api/me` (`Me` type already carries optional `role`/`viewingFor`), so `MondayObject.tsx` reads `me.viewingFor` exactly as `App.tsx` does.
   Alternative: have the object call the standalone `GET /api/me`. Rejected: that route needs the session cookie, which the iframe never has.

3. **Mount `resolveStaffViewer` and `viewerReadOnlyGate` on the monday `/app` router between `requireMondayUser` and `requireWhitelisted`**, in the order `router.ts` uses. `requireMondayUser` already sets `req.userId === req.realUserId`, which is the precondition `resolveStaffViewer` checks. Express strips the `/app` mount prefix, so `req.path` inside those middlewares is `/agents/...`, the form `viewerMayRequest` expects, with no change to the rule.
   Alternative: a monday-specific gate. Rejected: same rule, same code.

4. **`MondayObject.tsx` wraps `Workspace` in `ViewerProvider` with `readOnly: me.viewingFor != null` and passes `viewer={me.viewingFor ?? null}`**, mirroring `App.tsx`. `isAdmin` stays false in monday (admins never use the object). `Workspace` already skips the account-level fetches and hides write controls when `viewer` is set, so no further UI work.

## Risks / Trade-offs

- [A staff member whose monday email differs from the address on the staff list] → still refused; the accountant must list the monday email. Same rule as Google; documented, not changed.
- [The Staff tab "signed in" column reads a Google sign-in only, so a monday-only staff member shows "not signed in yet"] → accepted for this change; the column's wording matches the existing spec ("signed in with Google"). Noted in docs.
- [A viewer's monday session makes SSE and download requests with `?sessionToken=`] → those are GET under `/agents/`, so the read-only gate passes them; no change.

## Migration Plan

Deploy only; no migration, no env change. Rollback = revert the commit. Verification: the reporter (michal@arierotem.com) reopens the FiscalMind object in monday and sees Arie Rotem's workspace with the read-only notice.
