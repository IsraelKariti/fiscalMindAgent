## 1. The words

- [x] 1.1 Add the required field `shortNameHe` to `CapitalDocumentType` in `catalog.ts` and fill it for every catalog type (design.md decision 1); extend `tests/capitalCatalog.test.ts`: every type has a non-empty `shortNameHe` with no digits and no `{{`. Verify `npm run typecheck` and `npm test` pass
- [x] 1.2 Add optional `nameHe` to `Institution` in `institutionsTable.ts`, fill it for every entry that has a Hebrew alias by picking the entry's short brand alias, and add `institutionLabelHe(key)` in `institutions.ts` (design.md decision 2); extend `tests/institutions.test.ts`: every `nameHe` is one of its entry's `aliases`, `institutionLabelHe('harel')` is "הראל", an entry without `nameHe` returns its English `name`. Verify `npm test` passes

## 2. The name rule (pure code)

- [x] 2.1 Add `childLabel({ matchedDocumentName, documentType, issuerName, quarantined })` to `splitChildNames.ts` with the four steps of design.md decision 3, reusing `childDisplayName` for cleaning and the 150-character cap. Verify `npm run typecheck`
- [x] 2.2 Extend `tests/splitChildNames.test.ts` with the spec's scenarios: matched name wins; study fund + recognised company → "קרן השתלמות — הראל"; company not in the table → type word alone; issuer text naming two companies → type word alone; type `'other'`, missing type and unknown key → `null`; quarantined → `null` even with a match; the model's `document_kind` / raw issuer text never appears in the result. Verify `npm test` passes

## 3. Give the name

- [x] 3.1 In `classifyAndStore` (`analyzeInboundFile.ts`) replace the `childDisplayName(matched?.name)` call with `childLabel(...)` fed from the gated analysis (`document_type`, `issuer_name`) and `gate.quarantined`; update the comment above it; leave the failed-analysis path (`null`) and the parent-only guard as they are. Verify `npm run typecheck`, and that `plan.ts` still compiles untouched

## 4. One-time fill

- [x] 4.1 Add `scripts/backfillChildLabels.ts` and the `db:backfill-child-labels` entry in `package.json` (design.md decision 4): child rows with `label IS NULL`, `analysis_status = 'done'` and no linked document get `childLabel` from their stored analysis; print the number of rows named; a second run names 0 rows. Verify by running it twice against the local database
- [x] 4.2 After 4.1, check the observed client (`612cf572-5984-4019-b3e8-fbdcfcbb894c`): all 11 children have a label, the three life-insurance and the study-fund children read as type + company, and the parent row has none. Verify with a read-only query, then ask the user to look at the client page

## 5. Live check

- [ ] 5.1 With the user's dev stack running, send a two-document PDF to a paused test client in review mode (the scratch-script method of `meaningful-split-file-names` task 4.1) where one document is on the list with its company and one is not on the list: the first child gets the list document's name, the second gets the type-based name; the conversation, the documents list and the file viewer show it with the page range next to it; downloading the second child saves `<type-based name> (<original> pX-Y).pdf`. Delete the scratch script after
- [ ] 5.2 In the same run, confirm in the LLM call browser that the planner's prompt lists both children by stored file name with the same content-analysis lines as before

## 6. Docs and wrap-up

- [x] 6.1 Update the file-splitting section of `docs/agents.md` (the display-name rule near line 841) with the type-based name, the two word sources and the backfill command; verify the text matches the delta spec
- [x] 6.2 `npm run typecheck`, `npm test`, `npm run build:gui` all pass; commit per the repo Git workflow
