## Context

See proposal.md — Why. Today `googleLoginCallback` (`src/api/auth.ts`) runs `users.claimInvitedByEmail` (takes a row with `google_sub IS NULL` and the same email) and otherwise `users.upsertFromGoogle` (`INSERT … ON CONFLICT (google_sub) DO UPDATE`). A row whose `google_sub` is a monday placeholder (`monday:<account>:<user>`, written by `POST /api/monday/session`) matches neither path, so the insert hits `users_email_key` and the request ends in the generic 500.

`users.google_sub` is `TEXT UNIQUE`, nullable since migration 043. `users.email` is `TEXT UNIQUE` (case-sensitive index; every writer lowercases or matches with `lower()`). "Signed in" is derived as `google_sub IS NOT NULL` in `accountantStaff.listForAccountant`, `whitelist` listing and `src/api/staff.ts` (add route).

## Goals / Non-Goals

**Goals:**
- One code path for every Google sign-in: match by `lower(email)`, else insert.
- A `monday:` placeholder row and an invited row are handled identically (both are "no real Google ID yet").
- The Google ID can never block a sign-in.

**Non-Goals:**
- Removing the `google_sub` column. It stays as information and as the "has signed in with Google" marker.
- Changing the monday link popup (`monday_link` state) or the `monday_accounts` mapping.
- Making `users.email` case-insensitively unique at the index level (writers already lowercase; left as is).

## Decisions

1. **One function `users.signInByEmail(profile)` replaces `claimInvitedByEmail` + `upsertFromGoogle`.**
   First `UPDATE users SET google_sub, email, name, picture_url, updated_at WHERE lower(email) = lower($email) RETURNING *`. If no row: `INSERT … ON CONFLICT (email) DO UPDATE SET google_sub, name, picture_url, updated_at RETURNING *` (the conflict clause only covers two first sign-ins racing on the same email). The stored email is overwritten with Google's casing, which is what today's upsert does.
   Alternative considered: keep the sub lookup and add a third "monday:" branch. Rejected: three lookups for one identity, and the owner decided the email is the key.

2. **Drop the unique constraint on `google_sub` (migration `069_users_google_sub_not_unique.sql`: `ALTER TABLE users DROP CONSTRAINT users_google_sub_key`).**
   With email as the key, the same Google account under a renamed address must become a new row; a unique sub would turn that into another 500. Nothing reads users by sub after this change, so no index is needed.
   Alternative: keep the constraint and catch the violation. Rejected: a key that is not used for lookup should not be able to reject writes.

3. **monday provisioning uses a plain insert (`users.createFromMonday(email, name, placeholderSub)`).**
   `upsertFromGoogle`'s `ON CONFLICT (google_sub)` cannot exist without the unique index. The route already checks `getByEmail` first and maps `23505` to the 409 "email in use" answer; that stays.

4. **"Signed in" = `google_sub IS NOT NULL AND google_sub NOT LIKE 'monday:%'`.**
   One SQL fragment exported from `src/db/queries/users.ts` (e.g. `SIGNED_IN_SQL(alias)`) and used by `accountantStaff.listForAccountant`, `whitelist` listing, and the staff add route (via a `users.hasSignedIn(email)` helper). The admin accountants list derives `signed_in` from one of these queries; reuse the same fragment there. Same rule as monday's existing `linked` flag.

5. **Monday link popup unchanged.** It runs through the same callback, so it now also matches by email; the `mondayAccounts.upsert` afterwards still points the monday identity at the signed-in row.

## Risks / Trade-offs

- [An office reassigns an old address to a new worker] → the new worker inherits the old row. Accepted by the owner; the office controls its Workspace addresses, and the whitelist/staff lists are by email already.
- [Two rows differing only in email casing already exist in a database] → the `UPDATE … lower(email)` would touch both. Mitigation: migration 069 first asserts no such pair exists (`SELECT lower(email) … GROUP BY 1 HAVING count(*) > 1` raises), so the deploy stops instead of merging accounts.
- [A row with the real sub already exists under another email when the renamed account signs in] → with the constraint dropped this simply creates a second row; the old row keeps its data. Documented behavior (spec scenario).

## Migration Plan

1. Deploy code + migration 069 together (production runs migrations in its deploy flow; local: `npm run db:migrate`).
2. The affected employees sign in again; their monday rows are taken over. No data fix needed.
3. Rollback: revert the code; the dropped constraint can stay (nothing depends on it) or be re-added once no duplicate subs exist.
