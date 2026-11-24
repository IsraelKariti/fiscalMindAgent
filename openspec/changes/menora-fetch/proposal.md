## Why

Menora Mivtachim (מנורה מבטחים) is on the owner's target list of pension and study-fund managers (a card on the admin site-access screen under both products, with no provider behind it), so today a Menora client can only be asked to upload the annual report by hand. The personal area (menoramivt.co.il) was crawled live on 2026-11-24 in the owner's own account (login, SMS code, reports page filters, result rows, PDF delivery), so a fetch provider can be built in the same shape as the Migdal and Meitav ones.

## What Changes

- New document-fetch provider `menora_mivtachim` that logs in to the Menora personal area with the client's national id and WhatsApp number (one phone/email field, the full number as stored), waits for the SMS code the client forwards on WhatsApp, and downloads the client's short annual report for the tax year.
- **Short annual report only (owner's decision 2026-11-24):** the report type "שנתי מקוצר / אישור מס והצהרת הון" — the one that carries the tax certificate and the capital-declaration figures (the page itself says "אישור מס והצהרת הון נמצאים בדוח השנתי"). The detailed annual report ("שנתי מפורט") is not fetched.
- The provider offers two document types in one login: `pension_annual` (the site's sector "פנסיה") and `study_fund_annual` (sector "גמל והשתלמות"). Life and health insurance sectors are never requested.
- Selection uses the reports page's own filters (report type, sectors, year) and its "בצע סינון" button; every row the filtered list shows for the tax year is downloaded, tagged by the row's sector. A filter answered with "לצערנו, לא נמצאו תוצאות" is a year the client has no report for.
- Brings everything it finds, like Harel / Phoenix / Migdal / Meitav: the client agrees once to the fetch, both sectors are always searched, and a product with no Menora row on the checklist gets its row created at delivery by the existing `takesAllDocuments` machinery (name = catalog name for the year + " — מנורה מבטחים").
- The admin site-access screen shows Menora as built for both products (the catalog already lists `menora_mivtachim`; the built badge reads the provider registry).
- Canned Hebrew progress messages and delivery wording (WhatsApp confirmation, email subject/body, file labels) for Menora.
- The in-worker mock (`TAX_FETCH_MOCK=true`) returns Menora-shaped documents so the delivery path can be exercised without the site.
- A one-off smoke script for the live check, like `scripts/meitavFetchSmoke.ts`.

## Capabilities

### New Capabilities

- `menora-fetch`: what the Menora provider logs in with, which documents it selects from the reports page for a tax year (short annual report per sector), and what the client and accountant receive.

### Modified Capabilities

- `document-fetch`: the national-id fallback rule (provider credentials row → tax-authority row → id stored on the client) now also covers Menora, whose login sends the national id and the client's WhatsApp number to the site.

## Impact

- `src/browserRunner/menora.ts` (new) + registration in `src/browserRunner/server.ts`; the runner HTTP contract is unchanged (no protocol version bump).
- `src/agents/declarationOfCapital/taxFetch/providers.ts` (new `menoraSpec`), `src/db/queries/clientPortalCredentials.ts` (`PortalProvider` union gains `'menora_mivtachim'`), `taxFetch/fetchClient.ts` (mock branch).
- `tests/accessCatalog.test.ts` and `tests/siteAccessReport.test.ts` (built list gains `menora_mivtachim/pension_annual` and `menora_mivtachim/study_fund_annual`), a new unit test for the pure row-selection helper and the spec's row matching, `docs/agents.md` providers paragraph, `scripts/menoraFetchSmoke.ts` (new).
- No change to `flow.ts`, `deliver.ts`, `fetchedRows.ts`, `prompt.ts` or the web app: the bring-everything consent, the row creation at delivery and the prompt block are already generic over `takesAllDocuments` providers.
- No migration: `client_portal_credentials.provider` and `tax_fetch_sessions.provider` are free text validated in code.
- Production needs the browser-runner image rebuilt (deploy.yml already builds it per commit).
