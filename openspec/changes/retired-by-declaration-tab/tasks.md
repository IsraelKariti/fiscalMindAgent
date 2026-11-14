## 1. Data model

- [x] 1.1 Add `migrations/075_client_documents_replaced_by.sql` (nullable text column `replaced_by`, CHECK IN ('documents','client_declaration'), comment explaining both values) and verify `npm run db:migrate` applies it and `\d client_documents` shows the column
- [x] 1.2 Add `replaced_by: 'documents' | 'client_declaration' | null` to `ClientDocumentRow` in `src/db/types.ts` and to `ClientDocument` in `web/src/api.ts`, and verify `npm run typecheck` passes

## 2. Backend rule

- [x] 2.1 Create `src/agents/declarationOfCapital/retirementReplacement.ts` exporting the pure `replacementOfRetirement(retiredRow, createdRows, statedRows)` that returns `'client_declaration'` when any given row shares the retired row's `type_key` and has a statable paper (`paperMayBeStatedInChat`), else `'documents'`; verify with `tests/retirementReplacement.test.ts` covering: declaration added, declaration stated on an existing item, documents only, declaration of another type, no rows at all
- [x] 2.2 Extend `clientDocuments.retire` with a `replacedBy` argument written to the new column, and verify the typecheck passes and existing callers compile
- [x] 2.3 In `applyRetirements` (`plan.ts`) resolve the retired row from `run.documents`, collect the created rows (`changes.createdWithFiles`) and the stated rows (`decision.statedCosts` / `decision.statedVehicles` ids looked up in `run.documents`), call the rule, pass the result to `retire`, and add `replacedBy` to the audit detail; verify by running `npm test` and by a local planner cycle that retires a vehicle licence after the client states the car's facts (row shows `replaced_by = 'client_declaration'` in psql) (code + npm test done; the local planner-cycle check is the live check of 4.2)
- [x] 2.4 Add `replacedBy` to `retireDocumentDetail` in `toolStepDetails.ts` and extend `tests/toolStepDetails.test.ts` to assert it appears; verify `npm test` passes
- [x] 2.5 List `replacementOfRetirement` under `apply_retirements` in `docs/pipeline.md` and mention `replaced_by` next to `retired` in `docs/agents.md`; verify both files read correctly

## 3. Web

- [x] 3.1 Add i18n keys `groupRetiredDeclaration` ('הוחלפו בהצהרת הלקוח') and `retiredDeclarationStatus` ('הוחלף בהצהרת הלקוח') in `web/src/i18n.tsx`; verify the typecheck passes
- [x] 3.2 In `DocumentsCard.tsx` give `CAPITAL_GROUPS` entries an optional `match(doc)` and split `retired` into two groups (documents: `replaced_by !== 'client_declaration'`; declaration: `replaced_by === 'client_declaration'`, tab key `retired_declaration`, placed after the documents group); make the `retired` badge label follow the same field; verify in the browser that a client with both kinds shows two tabs with count 1 each and matching badges, and that a client with only old retired rows shows just the documents tab (code done, web tsc passes; browser look left to the owner — Chrome tools unavailable in the build session)
- [x] 3.3 Add `.doc-group-retired_declaration` to the retired tab dot rule in `web/src/styles.css`; verify the new tab's dot matches the documents tab's colour

## 4. Verification

- [x] 4.1 Run `npm run typecheck` and `npm test`; verify both pass
- [ ] 4.2 Live check on the local stack: reopen the retired licence row of the local vehicle test client, let the client's next message retire it again, and verify the row moves to "הוחלפו בהצהרת הלקוח" while the progress count is unchanged; then commit per the Git workflow
