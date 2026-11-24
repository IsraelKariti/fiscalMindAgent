## Why

The Harel fetch today only pulls the client's study-fund annual reports: the reports list is filtered to the תחום "גמל והשתלמות" and every row is tagged as a study fund. Harel is also one of the big pension managers (הראל פנסיה וגמל), so a client who has a Harel pension still has to upload its annual report by hand even though the same login already shows it. Phoenix got the "bring both kinds in one login" behaviour on 2026-11-24; Harel should match it.

## What Changes

- The `harel` fetch provider offers two document types instead of one: `pension_annual` (new) and `study_fund_annual` (existing). A required-document row counts as the Harel pension document when its name mentions Harel and a pension or provident fund and not a study fund.
- The runner-side Harel flow runs the reports filter twice in the same login: once for the תחום that holds study funds (גמל והשתלמות, as today) and once for the תחום that holds pension reports. Rows from the pension filter are tagged `pension_annual`; rows from the study-fund filter stay `study_fund_annual`. Both walks keep today's rules: annual period, the tax year picked by label, every row downloaded, all result pages walked, document id dedup.
- **Brings everything it finds**, like Phoenix: the Harel fetch always takes both kinds for the tax year, whatever the checklist holds. The client agrees once, to the fetch itself. A kind found on the site with no live Harel row on the list gets its own row created at delivery (catalog name for the year + " — הראל"), files attached, row marked received, client told after the fact, accountant sees the row came from a fetched document. The shared machinery from `phoenix-fetch` does this; Harel only sets the flag and the catalog type keys.
- The fetch is offerable when at least one of the two kinds has a pending Harel row.
- "No documents on the site" is reported only when both filters come back empty; one empty filter is normal (a client with only a study fund).
- Canned Hebrew texts and delivery wording (WhatsApp confirmation, email subject and body, file labels) name the product fetched (הפנסיה / קרן ההשתלמות) instead of always saying study fund.
- The admin site-access screen shows the הראל pension card as built (no catalog change; the badge reads the provider registry).
- The in-worker mock (`TAX_FETCH_MOCK=true`) returns Harel pension files as well as study-fund files.

## Capabilities

### New Capabilities

- `harel-fetch`: what the Harel provider fetches in one login (pension and study-fund annual reports), how the reports list is filtered per kind, the bring-everything rule and the row creation at delivery, and what the client and accountant receive.

### Modified Capabilities

- none. The `unlisted-files` exception for "a document the platform itself fetched from the client's own login" is already written for any such provider, and the `document-fetch` identity rule already lists Harel.

## Impact

- `src/browserRunner/harel.ts`: the download step runs per sector; the sector label, the "rows settled" check and the no-documents decision are parameterized; the pension תחום option is picked by its label.
- `src/agents/declarationOfCapital/taxFetch/providers.ts` (`harelSpec`: second document type, `takesAllDocuments`, `catalogTypeKey` on both types, product-aware wording), `taxFetch/fetchClient.ts` (mock), `tests/accessCatalog.test.ts` (built list gains `harel/pension_annual`), `docs/agents.md`.
- No migration, no runner protocol bump (the runner HTTP contract is unchanged; `documentKeys` already travels to the runner).
- Production needs the browser-runner image rebuilt (deploy.yml already builds it per commit).
- The pension option in Harel's תחום dropdown is labelled "פנסיה" (owner confirmed 2026-11-24); the runner still picks it by label and fails loudly, listing the options it saw, if the label ever changes.
