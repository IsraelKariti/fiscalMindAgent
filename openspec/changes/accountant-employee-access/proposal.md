## Why

An accountant is busy and wants to hand the day-to-day watching of the agent to their office staff: an employee should be able to sign in, open the accountant's clients, read the conversations and see which documents were collected. Today the only way into an accountant's workspace is the accountant's own Google account (or an admin's view-as session), so staff would have to share the accountant's login.

## What Changes

- A new **Staff** tab in the workspace Settings page where the accountant lists the email addresses of employees who may sign in. Each row shows the email, when it was added and whether that person has signed in yet, with a remove action behind a styled in-app confirmation.
- An employee signs in with Google using one of those addresses and lands in the accountant's workspace as a **read-only viewer**: the client list, each client's conversation and documents tab, and the agent dashboard. Viewing and downloading files from the documents tab works.
- A viewer cannot change anything. The server refuses every writing request from a viewer, and the workspace hides every action control: add, edit, pause, resume, redraft, send now, retry, delete client, document row actions, WhatsApp toggle, due-date edit, settings connections.
- A viewer never sees the Staff tab, the general settings or the agent settings; the Settings page shows only the dashboard tab. A viewer cannot add or remove other employees.
- The accountant's own session (and an admin viewing as the accountant) is unchanged; only the accountant and an impersonating admin can manage the staff list.
- Removing an employee takes effect on their next request: they are treated as a signed-in user without access, like an unactivated accountant today.
- Adding and removing an employee is written to the audit trail.
- Admin panel: a signed-in employee appears in the accountants list labelled as staff of their accountant instead of as a user waiting for activation.

## Capabilities

### New Capabilities
- `accountant-staff-access`: who an accountant may let into their workspace, how such a person signs in and what they can and cannot see or do, how the accountant manages the list, and how removal takes effect.

### Modified Capabilities
<!-- none: the accountant-facing specs (workspace-documents, client-lifecycle, admin-impersonation) keep their requirements; the viewer's restrictions live in the new capability -->

## Impact

- Database: new table `accountant_staff` (migration 068) keyed by the accountant's user id and the employee's lower-cased email, one accountant per email.
- Server: `src/api/auth.ts` (identity resolution learns a `viewer` role that acts as the accountant for reads), `src/api/router.ts` (read-only gate for viewers, new `/api/staff` routes), new `src/api/staff.ts` + `src/db/queries/accountantStaff.ts`, `GET /api/me` (reports the role and the accountant), audit actions `staff.added` / `staff.removed`, admin accountants list (`users.listAll`).
- Web: `App.tsx` / `api.ts` (`Me` carries the role), `Workspace.tsx` + `ClientView.tsx` + `Sidebar.tsx` + `Settings.tsx` (read-only viewer mode, hidden controls, dashboard-only settings), new `StaffSettings.tsx` tab, admin `AccountantPage`/`shared.tsx` badge, i18n strings in all locales.
- Docs: `docs/agents.md` tenancy section gets a "Staff viewers" paragraph.
- Production needs migration 068 after deploy.
