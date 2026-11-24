## 1. Verify the entry point

- [x] 1.1 In a logged-out browser (a private window is enough), open `https://my.fnx.co.il/` (the public site's "לאיזור האישי" link target) and confirm it redirects to the Auth0 login page showing the "מספר ת.ז*" field; record the final login URL pattern in the provider file's header comment.

## 2. Runner-side provider

- [x] 2.1 Create `src/browserRunner/phoenix.ts` exporting `phoenixProvider` with `startLogin` (goto entry URL, fill the ת.ז and phone inputs by placeholder, click "שלחו לי קוד כניסה", wait for the code-page input), `submitOtp` (type the code, click "כניסה", success = URL on `my.fnx.co.il` within 45 s, timeout with the code input still visible = `OtpRejectedError`), and `downloadDocuments` (goto `/mails/reports`, wait for rows, walk pages with the next arrow until the current page equals the highest number, download selected rows per page via the `download` event, `NoDocumentsOnSiteError` when the walk completes with no match, generic error when no rows ever rendered). Verify with `npm run typecheck`.
- [x] 2.2 Put the row selection in a pure exported function `selectPhoenixRows(rows, taxYear, keys)` (sector → kind, year string in the name, no "רבעון", kind in agreed keys) and cover it in a new `tests/phoenixSelect.test.ts` with the four spec scenarios (study fund 2024, quarterly skipped, year from name not date, both types with partial consent); add the test to the `npm test` list and verify it passes.
- [x] 2.3 Register `phoenix: phoenixProvider` in `src/browserRunner/server.ts` and verify the runner starts locally (`npm run typecheck`, then the runner process logs the provider list or accepts a `phoenix` start-login call in mock-free dry run).

## 3. Worker-side spec, mock, catalog

- [x] 3.1 Add `phoenixSpec` to `src/agents/declarationOfCapital/taxFetch/providers.ts` (id `phoenix`, siteNameHe "הפניקס", otpChannel sms, two document types with the name regexes from design decision 8, `buildCredentials` via `clientIdNumber(client, 'phoenix')` + `wa_phone`, canned messages, delivery wording with per-file titles and `fileLabel` "<title> — הפניקס <year>") and register it in `SPECS`; add `'phoenix'` to `PortalProvider` in `src/db/queries/clientPortalCredentials.ts`. Verify `npm run typecheck`.
- [x] 3.2 Update `tests/accessCatalog.test.ts` so the built list includes `phoenix/pension_annual` and `phoenix/study_fund_annual` (six entries) and verify `npm test` passes, including `tests/siteAccessReport.test.ts`.
- [ ] 3.3 Add a `phoenix` branch to `MockTaxFetchClient.downloadDocuments` in `taxFetch/fetchClient.ts` returning two titled files per agreed key, and verify with `TAX_FETCH_MOCK=true` on a local test client that has a pending "… — הפניקס" study-fund row: the agent offers the fetch, a 6-digit code completes it, two labelled files land on the Documents tab and the WhatsApp/email wording names the study fund.

## 4. Bring everything it finds (owner's decision 2026-11-24)

- [x] 4.1 Add `takesAllDocuments?: true` to `FetchProviderSpec` and `catalogTypeKey` to `FetchDocumentType`; set them on `phoenixSpec` (`pension_annual → pension_provident`, `study_fund_annual → study_fund`); make `flow.ts` `effectiveKeys` return every provider key for such a provider and `prompt.ts` print the "brings every annual document for the year" line instead of the per-document consent line in the Phoenix block. Verify with a unit test on `effectiveKeys` (exported or via a thin wrapper) and `npm run typecheck`.
- [x] 4.2 Add the `fetched_file` evidence variant to `src/db/types.ts` and `web/src/api.ts`, and the row-creation step to `deliver.ts` (per design decision 12: resolveRequired for an open / not-needed catalog row, addInstances otherwise, catalog name + " — הפניקס", files linked, row collected, verified in the same batch, audit `tax_fetch.document_created`). Verify with a new `tests/fetchedRowCreation.test.ts` that drives the pure planning helper (which row to settle/add and the name) over the five spec scenarios.
- [x] 4.3 Add the "also found … added to the list" sentence to the Phoenix `waConfirmation` (per created kind) and the documents-tab note "נוצר ממסמך שנמשך מאתר הפניקס" (DocumentsCard + i18n) plus the `toolStepDetails.ts` rendering. Verify the phoenixSelect test's wording assertions and a browser look at a documents tab with a row carrying `fetched_file` evidence (temporary row, deleted after).
- [ ] 4.4 Mock run (`TAX_FETCH_MOCK=true`) on a local test client with only a Phoenix pension row: after the 6-digit code, verify the study-fund row "… — הפניקס" appears with two files, the confirmation carries the "also found" sentence, and the pension row got its files.

## 5. Live check (owner drives the code)

- [ ] 5.1 Run `npx tsx scripts/phoenixFetchSmoke.ts <id> <phone> 2024` (the owner, in their own terminal): verify the SMS code is accepted and the 2024 study-fund and pension annual documents arrive as real PDFs with their on-site names, and no quarterly report.
- [ ] 5.2 Run the same for 2023 and verify the three annual pension documents arrive and the quarterly rows do not.
- [ ] 5.3 Type a wrong code once and confirm the script reports a rejected code and accepts the right code afterwards; if the site shows a distinct error element, tighten the detection in `submitOtp` and note the markup in the file header comment.
- [ ] 5.4 Open the admin site-access screen and verify both הפניקס cards show the built badge.

## 6. Docs and wrap-up

- [x] 6.1 Update `docs/agents.md` (providers + credentials paragraphs) to list `phoenix` with its two products and the owner's selection rule, and verify the text reads correctly.
- [x] 6.2 Run `npm test` and `npm run typecheck`, then commit and push per the repo Git workflow (provider build, commits a18ebc9 + df6db6f).
- [x] 6.3 Update `docs/agents.md` with the bring-everything rule and the row creation at delivery; run `npm test` and `npm run typecheck`, then commit and push.
