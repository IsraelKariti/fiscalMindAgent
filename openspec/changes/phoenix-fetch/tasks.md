## 1. Verify the entry point

- [ ] 1.1 In a logged-out browser (a private window is enough), open `https://my.fnx.co.il/` (the public site's "לאיזור האישי" link target) and confirm it redirects to the Auth0 login page showing the "מספר ת.ז*" field; record the final login URL pattern in the provider file's header comment.

## 2. Runner-side provider

- [x] 2.1 Create `src/browserRunner/phoenix.ts` exporting `phoenixProvider` with `startLogin` (goto entry URL, fill the ת.ז and phone inputs by placeholder, click "שלחו לי קוד כניסה", wait for the code-page input), `submitOtp` (type the code, click "כניסה", success = URL on `my.fnx.co.il` within 45 s, timeout with the code input still visible = `OtpRejectedError`), and `downloadDocuments` (goto `/mails/reports`, wait for rows, walk pages with the next arrow until the current page equals the highest number, download selected rows per page via the `download` event, `NoDocumentsOnSiteError` when the walk completes with no match, generic error when no rows ever rendered). Verify with `npm run typecheck`.
- [x] 2.2 Put the row selection in a pure exported function `selectPhoenixRows(rows, taxYear, keys)` (sector → kind, year string in the name, no "רבעון", kind in agreed keys) and cover it in a new `tests/phoenixSelect.test.ts` with the four spec scenarios (study fund 2024, quarterly skipped, year from name not date, both types with partial consent); add the test to the `npm test` list and verify it passes.
- [x] 2.3 Register `phoenix: phoenixProvider` in `src/browserRunner/server.ts` and verify the runner starts locally (`npm run typecheck`, then the runner process logs the provider list or accepts a `phoenix` start-login call in mock-free dry run).

## 3. Worker-side spec, mock, catalog

- [x] 3.1 Add `phoenixSpec` to `src/agents/declarationOfCapital/taxFetch/providers.ts` (id `phoenix`, siteNameHe "הפניקס", otpChannel sms, two document types with the name regexes from design decision 8, `buildCredentials` via `clientIdNumber(client, 'phoenix')` + `wa_phone`, canned messages, delivery wording with per-file titles and `fileLabel` "<title> — הפניקס <year>") and register it in `SPECS`; add `'phoenix'` to `PortalProvider` in `src/db/queries/clientPortalCredentials.ts`. Verify `npm run typecheck`.
- [x] 3.2 Update `tests/accessCatalog.test.ts` so the built list includes `phoenix/pension_annual` and `phoenix/study_fund_annual` (six entries) and verify `npm test` passes, including `tests/siteAccessReport.test.ts`.
- [ ] 3.3 Add a `phoenix` branch to `MockTaxFetchClient.downloadDocuments` in `taxFetch/fetchClient.ts` returning two titled files per agreed key, and verify with `TAX_FETCH_MOCK=true` on a local test client that has a pending "… — הפניקס" study-fund row: the agent offers the fetch, a 6-digit code completes it, two labelled files land on the Documents tab and the WhatsApp/email wording names the study fund.

## 4. Live check (owner drives the code)

- [ ] 4.1 Point the local worker at the local runner (`TAX_FETCH_MOCK=false`, static runner mode) and run a real session for the owner's own Phoenix account with tax year 2024 and the study fund agreed; verify the SMS code is relayed, both גמל והשתלמות 2024 reports arrive as real PDFs with their on-site names as labels.
- [ ] 4.2 Repeat with the pension type agreed for a year that has annual pension rows (2023): verify the annual rows arrive and the quarterly rows do not.
- [ ] 4.3 Send a wrong code once and confirm the session reports a rejected code and accepts the right code afterwards; if the site shows a distinct error element, tighten the detection in `submitOtp` and note the markup in the file header comment.
- [ ] 4.4 Open the admin site-access screen and verify both הפניקס cards show the built badge and the sessions above count as accesses.

## 5. Docs and wrap-up

- [x] 5.1 Update `docs/agents.md` (providers + credentials paragraphs) to list `phoenix` with its two products and the owner's selection rule, and verify the text reads correctly.
- [x] 5.2 Run `npm test` and `npm run typecheck`, then commit and push per the repo Git workflow.
