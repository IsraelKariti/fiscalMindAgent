## Why

Phoenix (הפניקס) is one of the largest pension and study-fund managers in the owner's target list, and today the agent can only ask the client to upload its reports by hand. The personal area was mapped live on 2026-11-24 (login, code step, reports list, paging, download), so a fetch provider can now be built the same way as the Altshuler Shaham and Harel ones.

## What Changes

- New document-fetch provider `phoenix` that logs in to the Phoenix personal area (my.fnx.co.il, Auth0 login at auth.fnx.co.il) with the client's national id and WhatsApp number, waits for the SMS one-time code the client forwards, and downloads the client's annual documents for the tax year.
- The provider offers two document types in one login, like Altshuler: `pension_annual` (rows whose תחום contains "פנסיה") and `study_fund_annual` (rows whose תחום contains "השתלמות").
- Document selection follows the owner's rule: walk every page of the reports list with the page-bar buttons only (no site filters), take rows whose report name contains the tax year, and skip rows whose name contains "רבעון" (quarterly reports). The date column is ignored because it is the publication date, not the report year.
- **Brings everything it finds (owner's decision 2026-11-24):** the Phoenix fetch always takes both kinds for the year, whatever the checklist expects. The client agrees once, to the fetch itself, not per document. A kind that has no Phoenix row on the checklist gets a new row created by code from the fetched file (named from the catalog, "— הפניקס" appended), with the files attached and the row marked received; the client is told after the fact in the confirmation message, and the accountant sees on the row that it came from a fetched file.
- The admin site-access screen shows Phoenix as built for both products (no change to the catalog; the `isBuilt` badge reads the provider registry).
- Canned Hebrew progress messages and delivery wording (WhatsApp confirmation, email subject/body, file labels) for Phoenix.
- The in-worker mock (`TAX_FETCH_MOCK=true`) returns Phoenix-shaped documents so the delivery path can be exercised without the site.

## Capabilities

### New Capabilities

- `phoenix-fetch`: what the Phoenix provider logs in with, which documents it selects from the personal area for a tax year, and what the client and accountant receive.

### Modified Capabilities

- `document-fetch`: the national-id fallback rule (provider credentials row → tax-authority row → id stored on the client) now also covers Phoenix.
- `unlisted-files`: the "created only on the client's quoted words" rule gains a third code-decided exception — a file the platform fetched itself from the client's own login creates the row of its kind.

## Impact

- `src/browserRunner/phoenix.ts` (new) + registration in `src/browserRunner/server.ts`; the runner HTTP contract is unchanged (no protocol version bump).
- `src/agents/declarationOfCapital/taxFetch/providers.ts` (new `phoenixSpec`), `src/db/queries/clientPortalCredentials.ts` (`PortalProvider` union), `taxFetch/fetchClient.ts` (mock shape).
- `taxFetch/flow.ts` (a provider that takes everything ignores per-document consent), `taxFetch/deliver.ts` (row creation for an unlisted kind), `src/db/types.ts` (`fetched_file` evidence), `prompt.ts` (Phoenix block wording), `web/src/components/DocumentsCard.tsx` + `toolStepDetails.ts` (evidence note).
- `tests/accessCatalog.test.ts` (built list gains `phoenix/pension_annual` and `phoenix/study_fund_annual`), `docs/agents.md` providers section.
- No migration: `client_portal_credentials.provider` and `tax_fetch_sessions.provider` are free text validated in code.
- Production needs the browser-runner image rebuilt (deploy.yml already builds it per commit).
