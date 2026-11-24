## Why

Migdal (מגדל) is one of the pension and study-fund managers on the owner's target list, and today the agent can only ask a Migdal client to upload the annual reports by hand. The personal area (my.migdal.co.il) was mapped live on 2026-11-24 in the owner's own account (login, SMS code, reports page, download), so a fetch provider can be built the same way as the Harel and Phoenix ones.

## What Changes

- New document-fetch provider `migdal` that logs in to "מגדל שלי" with the client's national id only (the site sends its SMS code to the mobile number Migdal has on file for that id), waits for the code the client forwards on WhatsApp, and downloads the client's annual documents for the tax year.
- The provider offers two document types in one login: `pension_annual` (the site's product "פנסיה") and `study_fund_annual` (product "השתלמות"). Health-insurance reports (product "בריאות") are never taken.
- **Two report types per product (owner's decision 2026-11-24):** each product round is run for both "דוח שנתי" (the full annual report) and "דוח שנתי מקוצר" (the short annual report). Both files attach to the same checklist row of that product; the short report is not a separate list item.
- Selection uses the site's own filters (report type, product, year dropdowns and the "הצג אישור" button), and every row the filtered list shows for the tax year is downloaded. A round whose list answers "לא מצאנו נתונים לתצוגה" is a report type / product the client does not hold.
- Brings everything it finds, like Harel and Phoenix: the client agrees once to the fetch, both products are always searched, and a product with no Migdal row on the checklist gets its row created at delivery by the existing `takesAllDocuments` machinery (name = catalog name for the year + " — מגדל").
- The admin site-access screen shows Migdal as built for both products (the catalog already lists `migdal`; the built badge reads the provider registry).
- Canned Hebrew progress messages and delivery wording (WhatsApp confirmation, email subject/body, file labels) for Migdal; the "code sent" message tells the client the SMS went to the mobile number registered at Migdal.
- The in-worker mock (`TAX_FETCH_MOCK=true`) returns Migdal-shaped documents (full + short per product) so the delivery path can be exercised without the site.
- A one-off smoke script for the owner's live check of the browser port, like `scripts/phoenixFetchSmoke.ts`.

## Capabilities

### New Capabilities

- `migdal-fetch`: what the Migdal provider logs in with, which documents it selects from the personal area for a tax year (two report types × two products), and what the client and accountant receive.

### Modified Capabilities

- `document-fetch`: the national-id fallback rule (provider credentials row → tax-authority row → id stored on the client) now also covers Migdal, whose login sends no phone number to the site; the client's WhatsApp number is still required because the code is relayed over WhatsApp.

## Impact

- `src/browserRunner/migdal.ts` (new) + registration in `src/browserRunner/server.ts`; the runner HTTP contract is unchanged (no protocol version bump).
- `src/agents/declarationOfCapital/taxFetch/providers.ts` (new `migdalSpec`), `src/db/queries/clientPortalCredentials.ts` (`PortalProvider` union gains `'migdal'`), `taxFetch/fetchClient.ts` (mock branch).
- `tests/accessCatalog.test.ts` (built list gains `migdal/pension_annual` and `migdal/study_fund_annual`), a new unit test for the pure row-selection helper, `docs/agents.md` providers paragraph, `scripts/migdalFetchSmoke.ts` (new).
- No change to `flow.ts`, `deliver.ts`, `fetchedRows.ts`, `prompt.ts` or the web app: the bring-everything consent, the row creation at delivery and the prompt block are already generic over `takesAllDocuments` providers.
- No migration: `client_portal_credentials.provider` and `tax_fetch_sessions.provider` are free text validated in code.
- Production needs the browser-runner image rebuilt (deploy.yml already builds it per commit).
