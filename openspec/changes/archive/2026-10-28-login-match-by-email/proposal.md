## Why

On 2026-10-28 an accountant's employee could not sign in: Google login answered `{"error":"Internal server error."}`. The log shows `duplicate key value violates unique constraint "users_email_key"`. The user row for that email already existed (most likely created when the employee opened FiscalMind inside monday, which stores a synthetic `monday:` Google ID), and the login code looks users up by Google ID first, so it tried to insert a second row with the same email. The app already treats the email as the real identity (one row per email, invites by email, staff list by email, whitelist by email); the Google ID as a lookup key only adds a way to fail.

## What Changes

- Google sign-in finds the user row by email (case-insensitive) and updates it; it adds a row only when no row with that email exists. The Google ID is stored on the row as information but is never used to find a user.
- A row created by an admin invite (no Google ID) or by monday (synthetic `monday:` ID) is taken over by the first Google sign-in with its email, the same way for both.
- The uniqueness constraint on the Google ID column is dropped, so a changed email on the Google side creates a new account instead of crashing (migration).
- "Signed in yet" (staff list, whitelist list, admin accountants list) means a real Google sign-in; a monday-provisioned row no longer counts as signed in.
- monday auto-provisioning inserts its row with a plain insert; the "email already exists" refusal stays as today.
- Docs (`docs/agents.md`, `docs/monday-app.md`) describe the email-keyed sign-in.

## Capabilities

### New Capabilities
- `google-sign-in`: how a Google sign-in is matched to a user row (by email), what happens with invited and monday-provisioned rows, what the stored Google ID is for, and what "signed in yet" means.

### Modified Capabilities
- (none — `accountant-staff-access` keeps its wording; the meaning of "signed in yet" is defined in the new capability)

## Impact

- `src/api/auth.ts` (`googleLoginCallback`), `src/db/queries/users.ts` (`claimInvitedByEmail`, `upsertFromGoogle` replaced by one email-keyed function), `src/api/monday.ts` (plain insert for provisioning), `src/db/queries/accountantStaff.ts`, `src/db/queries/whitelist.ts`, `src/api/staff.ts` (signed-in expression), `src/api/admin.ts` accountants list if it computes signed-in itself.
- New migration `069_users_google_sub_not_unique.sql` (drop the unique constraint on `users.google_sub`). Production needs it with the deploy.
- No API shape change; no web change.
