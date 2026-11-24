## 1. Runner-side provider

- [x] 1.1 In `src/browserRunner/harel.ts`, add the per-kind sector table and an exported pure `resolveHarelSectors(optionLabels, kinds)` that maps each kind to the first תחום option label matching its regex (`study_fund_annual` → /גמל והשתלמות/, `pension_annual` → /פנסיה/) and throws an error listing the labels when a kind has no option. Verify with a new `tests/harelSectors.test.ts` (both found; pension missing → error names the labels) added to the `npm test` list.
- [x] 1.2 Make `downloadDocuments` loop over `opts.documentKeys` (study fund then pension): per kind set the resolved תחום label, "שנתי" and the year, trigger the search, settle on that sector + year, walk every page, download every unseen row with `kind` of the round; `seenDocIds` shared across rounds. Parameterize `waitForFilteredRows` by sector label and make an answered-but-empty initial filter return "empty" for that kind instead of throwing; throw `NoDocumentsOnSiteError` naming both sectors only when both rounds yield nothing. Update the file's header comment. Verify `npm run typecheck`.

## 2. Worker-side spec, mock, catalog

- [x] 2.1 In `taxFetch/providers.ts`, give `harelSpec` `takesAllDocuments: true` and two document types (`pension_annual` with `catalogTypeKey: 'pension_provident'`, name match Harel ∧ פנסיה|גמל ∧ ¬השתלמות; `study_fund_annual` with `catalogTypeKey: 'study_fund'`, name match Harel ∧ השתלמות), each owning files by `kind` (drop `ownsFetchedDocument: () => true`). Add `harelProductNoun`, product-aware `harelDocName`, and rewrite `waConfirmation` (with `createdKinds` sentences), `emailSubject`, `emailBodyLines`, `fileLabel` and `noDocumentsOnSite` per design decision 6. Verify `npm run typecheck`.
- [x] 2.2 Update `tests/accessCatalog.test.ts` (built list gains `harel/pension_annual`, seven entries) and add a Harel case to `tests/fetchedRows.test.ts` (pension found, no Harel pension row, open catalog row → `resolve` named "אישור יתרות קופות גמל ופנסיה ליום 31.12.<year> — הראל"). Verify `npm test` passes, including `tests/siteAccessReport.test.ts`.
- [ ] 2.3 Extend the `harel` branch of `MockTaxFetchClient.downloadDocuments` in `taxFetch/fetchClient.ts` to return, per agreed key, the two study-fund files and one pension file titled "דוח שנתי קרן פנסיה מקיפה — חשבון 12345". Verify with `TAX_FETCH_MOCK=true` on a local test client that has only a pending "… — הראל" study-fund row: the agent offers the fetch with the "brings every annual document" line in its prompt block, a 6-digit code completes it, the pension row "… — הראל" appears with one file and the note "נוצר ממסמך שנמשך מאתר הראל", the study-fund row gets two files, and the WhatsApp confirmation names both products and carries the "also found" sentence.

## 3. Live check (owner drives the code)

- [ ] 3.1 On a local client with a pending Harel study-fund row and a real Harel login, run the fetch without the mock and verify from the worker log that both filter rounds ran, that the pension round resolved to the "פנסיה" option, and that the delivered files carry the right kinds and labels.
- [x] 3.2 Open the admin site-access screen and verify both הראל cards (pension and study fund) show the built badge.

## 4. Docs and wrap-up

- [x] 4.1 Update `docs/agents.md` providers paragraph: Harel now fetches pension + study fund in one login (two תחום filter rounds, bring-everything, row creation at delivery like Phoenix). Verify the text reads correctly.
- [x] 4.2 Run `npm test` and `npm run typecheck`, then commit and push per the repo Git workflow.
