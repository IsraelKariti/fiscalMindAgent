## 1. Runner-side provider

- [x] 1.1 Create `src/browserRunner/migdal.ts` exporting `migdalProvider` with `startLogin` (goto the login URL, wait for `input#username`, type the id, assert `#otpToCell` is checked, click the form's submit button, wait for `input[name=otp]`), `submitOtp` (click the first box, keyboard-type the six digits, fall back to per-box fills when any box stays empty, click submit; success = URL contains `/mymigdal/lobby/` within 45 s, timeout with the boxes still visible = `OtpRejectedError` with the boxes cleared), and `downloadDocuments` (goto `/mymigdal/info/approvals`, run the four rounds of design decision 5 — type/product/year by label, priming search when the year select is absent, missing product label ends the round, missing year throws, search answered by the "נמצאו" heading or the "לא מצאנו נתונים לתצוגה" text — download every title link via the `download` event, `NoDocumentsOnSiteError` when every round answered empty). Verify with `npm run typecheck`.
- [x] 1.2 Put the row filter in a pure exported function `selectMigdalRows(rows, taxYear, kind)` (title carries the year as a four-digit string, dedup by collapsed title within a kind, kind assigned from the round) and cover it in a new `tests/migdalSelect.test.ts` (full + short pension titles both kept, a title without the year skipped, duplicate title downloaded once, the double-space title normalized); add it to the `npm test` list and verify it passes.
- [x] 1.3 Register `migdal: migdalProvider` in `src/browserRunner/server.ts` and verify with `npm run typecheck`.

## 2. Worker-side spec, mock, catalog

- [x] 2.1 Add `migdalSpec` to `src/agents/declarationOfCapital/taxFetch/providers.ts` (id `migdal`, siteNameHe "מגדל", otpChannel sms, `takesAllDocuments: true`, the two document types with the name regexes and `catalogTypeKey`s of design decision 9, `buildCredentials` = `clientIdNumber(client, 'migdal')` + require `wa_phone`, returning `{ idNumber }`, canned messages with the "registered mobile number" wording in `otpSent`, delivery wording with per-file titles and `fileLabel` "<title> — מגדל <year>") and register it in `SPECS`; add `'migdal'` to `PortalProvider` in `src/db/queries/clientPortalCredentials.ts`. Verify `npm run typecheck`.
- [x] 2.2 Update `tests/accessCatalog.test.ts` so the built list includes `migdal/pension_annual` and `migdal/study_fund_annual` (nine entries) and verify `npm test` passes, including `tests/siteAccessReport.test.ts`.
- [ ] 2.3 (mock branch written; the mock run below is the owner's) Add a `migdal` branch to `MockTaxFetchClient.downloadDocuments` in `taxFetch/fetchClient.ts` returning the two titled files per agreed key of design decision 10, and verify with `TAX_FETCH_MOCK=true` on a local test client that has only a pending "… — מגדל" pension row: the agent offers the fetch, a 6-digit code completes it, two labelled pension files land on the pension row, the study-fund row "… — מגדל" is created with two files, the confirmation carries the "also found" sentence and the email wording lists all four titles.

## 3. Live check (owner drives the code)

- [ ] 3.1 (script written) Create `scripts/migdalFetchSmoke.ts <idNumber> [taxYear]` (design decision 12) and run it (the owner, in their own terminal) with a year the owner's account holds reports for: verify the SMS code is accepted, the four rounds log their outcome (product offered / not offered, rows found / empty), and the pension PDFs arrive with their on-site titles; no health report is downloaded.
- [ ] 3.2 Type a wrong code once and confirm the script reports a rejected code and accepts the right code afterwards; if the site shows a distinct error element, tighten the detection in `submitOtp` and note the markup in the file header comment.
- [ ] 3.3 Run the script with a year the dropdown does not offer (e.g. 2016) and confirm it fails loudly without downloading anything; confirm whether the year select rendered before the priming search and remove the priming step if it did.
- [ ] 3.4 Open the admin site-access screen and verify both מגדל cards show the built badge.

## 4. Docs and wrap-up

- [x] 4.1 Update `docs/agents.md` (providers + credentials paragraphs) to list `migdal` with its two products, the four filter rounds (two report types × two products), the id-only login and the "registered mobile number" SMS, and verify the text reads correctly.
- [x] 4.2 Run `npm test` and `npm run typecheck`, then commit and push per the repo Git workflow.
