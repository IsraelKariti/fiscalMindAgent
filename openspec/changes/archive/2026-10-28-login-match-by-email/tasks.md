## 1. Database

- [x] 1.1 Add `migrations/069_users_google_sub_not_unique.sql`: assert no two rows share `lower(email)` (raise otherwise), then `ALTER TABLE users DROP CONSTRAINT users_google_sub_key`; verify `npm run db:migrate` applies it locally and `\d users` (docker psql) shows no unique index on `google_sub`

## 2. Sign-in by email

- [x] 2.1 In `src/db/queries/users.ts` add `signInByEmail(profile)` (update by `lower(email)`, else insert with `ON CONFLICT (email) DO UPDATE`), add `createFromMonday(email, name, placeholderSub)` (plain insert), export the signed-in SQL fragment and `hasSignedIn(email)`, and remove `claimInvitedByEmail` and `upsertFromGoogle`; verify `npm run typecheck` passes
- [x] 2.2 In `src/api/auth.ts` `googleLoginCallback` call `users.signInByEmail(profile)` only; verify a local Google sign-in of an existing account still lands in the workspace
- [x] 2.3 In `src/api/monday.ts` provision with `users.createFromMonday`, keeping the `getByEmail` pre-check and the 23505 → 409 mapping; verify `npm run typecheck` passes and the monday session test (if any) still passes

## 3. "Signed in" meaning

- [x] 3.1 Use the signed-in fragment in `accountantStaff.listForAccountant`, the whitelist listing (`src/db/queries/whitelist.ts`) and the staff add route (`src/api/staff.ts`), and in the admin accountants list query if it derives `signed_in` separately; verify a row with a `monday:` sub shows "not signed in yet" on the Staff tab and the admin whitelist

## 4. Verification

- [ ] 4.1 Local end-to-end: with docker psql insert a user row `{email: <your test Google address>, google_sub: 'monday:1:1'}`, add that email to an accountant's staff list, sign in with that Google account at the local site; verify the sign-in succeeds, the same row now carries the real sub (no second row), and the workspace opens read-only for the accountant
- [x] 4.2 Add `tests/signInByEmail.test.ts` (DB test, in `npm run test:db`) covering: new email → insert, other casing → same row, invited row taken over, monday placeholder row not signed in and taken over, same sub under a renamed address → new row; verify `npm run test:db` passes
- [x] 4.3 Update `docs/agents.md` (invited rows paragraph) and `docs/monday-app.md` (synthetic `monday:` sub paragraph) to say sign-in matches by email and takes over placeholder rows; verify the two paragraphs read correctly
