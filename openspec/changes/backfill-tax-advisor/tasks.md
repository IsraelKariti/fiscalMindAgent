## 1. Resolution reuse

- [x] 1.1 `src/agents/declarationOfCapital/kickoff.ts`: give `resolveTaxAdvisor` an optional last parameter `lookup` (a users-lookup function with the `fetchUsers(accessToken, ids)` shape, default `fetchUsers`) and call it instead of `fetchUsers` directly; verify `npm run typecheck` passes and `tests/taxAdvisor.test.ts` + `tests/kickoffIdNumber.test.ts` still pass with `npm test`.
- [x] 1.2 `src/audit/audit.ts`: add `'client.tax_advisor_backfilled'` to the action union; verify typecheck.

## 2. Backfill module

- [x] 2.1 Create `src/agents/declarationOfCapital/taxAdvisorBackfill.ts` with the named steps from design.md decision 3: `backfillTaxAdvisors(instance, adminUserId)` (refuses `{ ok: false, error }` when `mondayOauthTokens.getByUserId(instance.user_id)` is null; lists `clients.listForInstance(instance.id)`; walks sequentially; memoises the users lookup per run and passes it to `resolveTaxAdvisor`), `rememberedRow`, `boardForRow`, `rereadAdvisor`, `advisorChanged` (compares `monday_user_id` + `match`; both null = unchanged), `storeBackfilledAdvisor` (`setDeclarationEngagement({ taxAdvisor })`, `null` clears; audit `client.tax_advisor_backfilled` with `actorType` and actor id as in `testClient.ts`, detail = previous + new via `taxAdvisorAuditDetail`); returns `{ ok: true, updated, cleared, unchanged, skipped, failed }`; logs progress every 25 clients; verify typecheck.
- [x] 2.2 Unit test `tests/taxAdvisorBackfill.test.ts` for the pure steps (in `taxAdvisorBackfillRules.ts`, see design decision 3): `advisorChanged` (same person same match → false; same person other match → true; null→person, person→null → true; name-only change → false), `rememberedRow` (missing or non-string ids → null), `boardForRow` (unknown board → null, board without `taxAdvisorColumnId` → null); verify `npm test` passes.

## 3. Route

- [x] 3.1 `src/agents/declarationOfCapital/router.ts`: `POST /clients/tax-advisor-backfill` next to `POST /clients/test`, refused 403 unless `isViewingAs(req)`, calls `backfillTaxAdvisors(req.agentInstance!, req.realUserId!)`, answers 409 with the reason when `ok` is false, else 200 with the counts; verify with curl in the accountant's own session that the route answers 403 and that under admin view-as it answers the counts JSON (curl check done against the running stack: 403 for the accountant's session, 409 no_monday_connection under admin view-as — the local accountant has no monday connection).

## 4. Web panel

- [x] 4.1 `web/src/api.ts`: `TaxAdvisorBackfillResult` type and a workspace `backfillTaxAdvisors()` call on the agent API (view-as only, documented like `createTestClient`); verify typecheck.
- [x] 4.2 New `web/src/components/TaxAdvisorBackfillPanel.tsx`: a `SettingsGroup` with a one-line explanation (re-reads the advisor column of every client's remembered monday row; reconnect monday first if the users permission is missing), a button, a busy state, the last result as five labelled counts, and the refusal reason inline when the request fails; no browser popup. `web/src/agents/declarationOfCapital.tsx`: render it under `TestClientForm` inside `adminTestPanel`. `web/src/i18n.tsx`: Hebrew strings (the app has a single Hebrew table, no English one); verify typecheck and in the browser that the test tab shows the form followed by the new group, and that the accountant's own session shows no test tab (browser check left to the owner: the dev stack was not running).

## 5. Docs and verification

- [x] 5.1 `docs/pipeline.md` section C: one row per new named step in `taxAdvisorBackfill.ts`; `docs/agents.md`: one sentence in the admin-only controls paragraph naming the action and its tab; verify both read correctly.
- [ ] 5.2 Live check on the local stack: as admin view-as, with the local board mapped with the advisor column, run the action; verify the result counts match the roster (clients with a row and a named person → updated on the first run, unchanged on a second run; a client with an empty cell and a stored advisor → cleared; a test client → skipped), the audit page shows `client.tax_advisor_backfilled` with the admin as actor, and the details tab of an updated client shows the advisor chip.
- [x] 5.3 Run `npm run typecheck` and `npm test`; commit per the Git workflow.
