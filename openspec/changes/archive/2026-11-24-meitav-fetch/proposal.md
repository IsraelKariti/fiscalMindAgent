## Why

Meitav (מיטב) is on the owner's target list of pension and study-fund managers (it is already a card on the admin site-access screen, under both products, with no provider behind it), so today a Meitav client can only be asked to upload the annual reports by hand. The login to Meitav's customer portal (customers.meitav.co.il) was already ported and verified in the owner's reference project `meitav-vm-browser-login` (id + phone, SMS code, wrong-code message, resend link), and the periodic-reports page was crawled live on 2026-11-24 in the owner's own account (year picker, product cards, both annual reports, popup download), so the provider can be built in the same shape as the Altshuler / Harel / Phoenix / Migdal ones.

## What Changes

- New document-fetch provider `meitav` that logs in to the Meitav customer portal with the client's national id and WhatsApp number (the site asks for the phone as a prefix dropdown plus seven digits), waits for the SMS code the client forwards on WhatsApp, and downloads the client's annual documents for the tax year.
- The provider offers two document types in one login: `pension_annual` and `study_fund_annual` (owner's decision 2026-11-24: pension + study fund, not the Meitav Trade securities report). The Meitav Trade (securities) area that the owner's own account lands in is out of scope.
- Brings everything it finds, like Harel / Phoenix / Migdal: the client agrees once to the fetch, both products are always searched, and a product with no Meitav row on the checklist gets its row created at delivery by the existing `takesAllDocuments` machinery (name = catalog name for the year + " — מיטב").
- Wrong-code handling uses the site's own error text ("הקוד שהזנת שגוי, יש להזין את הקוד בשנית"), which the reference project captured; the same SMS code screen stays up for a retry.
- The admin site-access screen shows Meitav as built for both products (the catalog already lists `meitav`; the built badge reads the provider registry).
- Canned Hebrew progress messages and delivery wording (WhatsApp confirmation, email subject/body, file labels) for Meitav.
- The in-worker mock (`TAX_FETCH_MOCK=true`) returns Meitav-shaped documents so the delivery path can be exercised without the site.
- A one-off smoke script for the live check, like `scripts/migdalFetchSmoke.ts`.
- **Two annual reports per product (owner's decision 2026-11-24):** the periodic-reports page ("דוחות תקופתיים", crawled live the same day in the owner's own account) lists per product and year a detailed annual report ("דוח שנתי מפורט דצמבר <year>") and a short one ("דוח שנתי מקוצר דצמבר <year>"); both are fetched and attach to the same checklist row of that product. Quarterly reports are never taken.

## Capabilities

### New Capabilities

- `meitav-fetch`: what the Meitav provider logs in with, which documents it selects from the personal area for a tax year (pension and study-fund annual documents), what the client and accountant receive, and how a wrong code is handled.

### Modified Capabilities

- `document-fetch`: the national-id fallback rule (provider credentials row → tax-authority row → id stored on the client) now also covers Meitav, whose login sends the national id and the client's WhatsApp number (prefix + seven digits) to the site.

## Impact

- `src/browserRunner/meitav.ts` (new) + registration in `src/browserRunner/server.ts`; the runner HTTP contract is unchanged (no protocol version bump).
- `src/agents/declarationOfCapital/taxFetch/providers.ts` (new `meitavSpec`), `src/db/queries/clientPortalCredentials.ts` (`PortalProvider` union gains `'meitav'`), `taxFetch/fetchClient.ts` (mock branch).
- `tests/accessCatalog.test.ts` (built list gains `meitav/pension_annual` and `meitav/study_fund_annual`), a new unit test for the pure phone-split and row-selection helpers, `docs/agents.md` providers paragraph, `scripts/meitavFetchSmoke.ts` (new).
- No change to `flow.ts`, `deliver.ts`, `fetchedRows.ts`, `prompt.ts` or the web app: the bring-everything consent, the row creation at delivery and the prompt block are already generic over `takesAllDocuments` providers.
- No migration: `client_portal_credentials.provider` and `tax_fetch_sessions.provider` are free text validated in code.
- Production needs the browser-runner image rebuilt (deploy.yml already builds it per commit).
