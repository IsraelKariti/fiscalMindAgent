## 1. Board mapping (server + web)

- [x] 1.1 Add `taxAdvisorColumnId` (optional, declaration-only comment) to `BoardSourceSchema` in `src/agents/shared/clientSources.ts`; verify `npm run typecheck` passes and `parseClientSources` keeps a board carrying the key (quick unit assertion in an existing clientSources test or a new one).
- [x] 1.2 Web types: add `taxAdvisorColumnId` to the board mapping type in `web/src/api.ts` and `BoardMapping` in `BoardMappingModal.tsx`; add `taxAdvisorColumn` to `ColumnMapping`/`MappingDraft` defaults in `SourceMappingForm.tsx`; verify typecheck.
- [x] 1.3 `BoardMappingModal.tsx`: build `peopleOptions` from `people`-typed columns, preselect by `/יועץ/`, pass `taxAdvisorOptions` when `withDeclarationColumns`; `SourceMappingForm.tsx`: render the dropdown (with a "none" option) inside the declaration block after the year field and emit it on confirm; verify in the browser that adding a board with a people column shows the field preselected and the stored settings carry `taxAdvisorColumnId`.
- [x] 1.4 `ClientSourcesSettings.tsx`: summary chip `t.sourcesTaxAdvisorColumn` after the year chip; `i18n.tsx`: Hebrew + English strings for the field label and chip; verify the chip appears on the board card after confirming.

## 2. monday data access

- [ ] 2.1 `src/api/mondayOauth.ts`: add `users:read` to `MONDAY_OAUTH_SCOPES`; confirm the monday Developer Center app lists that scope (manual check, note the result in the commit message); verify a fresh connect shows the users permission on the consent screen.
- [x] 2.2 `src/agents/shared/mondayData.ts`: `ItemColumnDetail.personIds` from the `PeopleValue` fragment (persons only), empty elsewhere; new `fetchUsers(accessToken, ids)` returning `{ id, name, email }[]`; verify typecheck and the fixture helper in `tests/kickoffIdNumber.test.ts` (`col`) still compiles (add `personIds: []`).

## 3. Kickoff resolution + storage

- [x] 3.1 `src/db/queries/accountantStaff.ts`: `findForAccountantByEmail(accountantUserId, email)` (lower-cased); verify with a quick psql/unit check that a different accountant's row is not returned.
- [x] 3.2 `src/agents/declarationOfCapital/taxAdvisor.ts`: pure `matchTaxAdvisor({ name, email, mondayUserId }, accountantEmail, staffRow)` returning the stored shape with `match` accountant/staff/none, plus the stored-shape type and a `readTaxAdvisor(agentFields)` reader; unit test `tests/taxAdvisor.test.ts` covering accountant match, staff match in another letter case, unmatched, and email-less input; verify `npm test` passes.
- [x] 3.3 `kickoff.ts`: named step `resolveTaxAdvisor(instance, board, row, accessToken)` — no mapping → `undefined` (leave stored), empty cell → `null` (clear), else first person → `fetchUsers` → `matchTaxAdvisor`; any error → name-only unmatched + warning naming the reconnect; call it in `resolveDeclarationClient` for both the enrollment and the refresh branches, passing `taxAdvisor` through `clients.setDeclarationEngagement` (new optional field; `null` deletes the key with `agent_fields - 'tax_advisor'`); add `taxAdvisor: { name, match }` to the audit detail; list the step in `docs/pipeline.md`; verify typecheck and a kickoff on the local board stores `agent_fields.tax_advisor` (check via `docker psql`).
- [x] 3.4 Web `ClientAgentFields.tax_advisor` typed in `web/src/api.ts`; verify typecheck.

## 4. Details tab

- [x] 4.1 `ClientHeader.tsx`: person icon + `MetaChip` for the advisor in the read view (label `t.taxAdvisorLabel`, value name or `t.taxAdvisorUnlisted(name)` when `match === 'none'`, title with the email when present); `i18n.tsx` strings in both languages; verify in the browser as the accountant, as a staff viewer and under admin view-as that the chip shows and nothing in the edit grid refers to it.

## 5. Docs + verification

- [x] 5.1 `docs/agents.md`: kickoff resolution paragraph gains the advisor column and the `users:read` reconnect note; verify the paragraph reads correctly.
- [ ] 5.2 End-to-end on the local stack: reconnect monday, re-add the declarations board with the advisor column, fire the kickoff for a row whose advisor is on the staff list and one whose advisor is not; verify the details tab shows "matched" and "not on the staff list" respectively, and the worker log shows no error.
- [x] 5.3 Run `npm run typecheck` and `npm test`; commit per the Git workflow.
