## Context

See proposal.md — Why. The Harel provider has two halves: the runner-side `harelProvider` (`src/browserRunner/harel.ts`, Playwright: `startLogin` → `submitOtp` → `downloadDocuments`) and the worker-side `harelSpec` (`taxFetch/providers.ts`: document types, credentials, canned texts, delivery wording). Everything that `phoenix-fetch` added for "bring everything" is generic and keyed on `FetchProviderSpec.takesAllDocuments` + `FetchDocumentType.catalogTypeKey`:

- `effectiveFetchKeys` (`taxFetch/fetchedRows.ts`) returns every key the provider offers; the planner's `document_keys` is ignored.
- `prompt.ts` prints the "brings every annual document for the year" line for such a provider.
- `planFetchedRows` + `deliver.ts` create a missing row at delivery, named `<catalog nameHe for the year> — <institutionLabelHe(spec.id)>` (= "— הראל" for Harel), with `fetched_file` evidence; the documents tab note `fetchedFileNote` + issuer and the audit action already exist.
- `waConfirmation(docs, canEmail, createdKinds)` receives the created kinds.

What the runner knows about the site (verified live 2026-07-27 and 2026-08-03, encoded in `harel.ts`): the reports app is `iframe#quarter-reports` with native selects `#madorCurrentValue` (תחום), `#repType` (period), `#repYear`; the search runs server-side via the app's חפש button or the Enter handler; `#results` rows carry `תחום | שנה | סוג דוח | ת"ז | שם מבוטח | פוליסה/חשבון`; documents are pulled by same-origin XHR (`fetchDocumentPdf`); pagination via `#pagination_holder li.next`. The תחום options that matter: "גמל והשתלמות" (value 37, recorded 2026-07-27) for study funds and "פנסיה" for pension reports (owner confirmed 2026-11-24).

## Goals / Non-Goals

**Goals:**
- Pension annual reports arrive from the same Harel login, tagged `pension_annual`, with no change to the generic session, delivery or prompt code.
- The pension sector is selected by label, never by position, and a missing option fails loudly with the labels seen.

**Non-Goals:**
- Telling a provident fund (קופת גמל) report apart from a study-fund report inside the "גמל והשתלמות" sector — today every row of that sector is a study fund, and that stays (the verification step judges the file against its row's type).
- Changing the login (email code), the download method or the pagination logic.
- Altshuler Shaham stays per-document consent.

## Decisions

1. **One login, two filter rounds.** `downloadDocuments` loops over the kinds in `opts.documentKeys` (order: study fund first, as today, then pension). Per kind it sets תחום to that kind's option, period "שנתי", year by label, triggers the search, waits for the table to settle on that sector + year, walks every page and downloads every row. A shared `seenDocIds` set across both rounds dedups a document the site might list under both sectors. The reports app stays open between rounds (only the selects change and the search is re-triggered), so no re-navigation is needed. `documentKeys` is always both kinds for a `takesAllDocuments` provider, but the loop still honours whatever it is given (the mock and a future per-document provider keep working).
2. **Sector option per kind.** A `SECTORS: Record<kind, { match: RegExp; kind }>` table: `study_fund_annual` → `/גמל והשתלמות/`, `pension_annual` → `/פנסיה/`. Before the first round the runner reads `#madorCurrentValue option` labels once and resolves each kind to the first option whose label matches; the resolved label is what `selectOption({ label })` and the settle check use. No match → `throw new Error('harel: no תחום option for <kind>; options: <labels>')` (a download failure, not "no documents"), so the live check sees the real labels in the session error.
3. **Settle check and empty tables per round.** `waitForFilteredRows` takes the sector label as a parameter (today it reads the module constant). An answered filter with an empty table returns an "empty" result for that kind instead of throwing `NoDocumentsOnSiteError`; the loop records it and continues to the next kind. After both rounds, zero documents → `NoDocumentsOnSiteError` naming both sectors. A round whose filter never fired or never settled still throws (unchanged safety: never download a mixed table).
4. **Row kind.** Each downloaded doc gets `kind` from the round that produced it; the title stays `סוג דוח — חשבון <n>` from the row.
5. **Worker spec.** `harelSpec` gains `takesAllDocuments: true` and a second type first in the list order of Phoenix (`pension_annual` then `study_fund_annual`), each with `catalogTypeKey` (`pension_provident`, `study_fund`) and `ownsFetchedDocument` by `doc.kind === key` (the default — the current `() => true` is removed, otherwise both types would claim every file). Name matching: study fund = `/הראל/ ∧ /השתלמות/`; pension = `/הראל/ ∧ /פנסיה|גמל/ ∧ ¬/השתלמות/`.
6. **Wording.** A `harelProductNoun(kind)` (הפנסיה / קרן ההשתלמות) and the shared `joinHe` build "את הדוח השנתי של X שלך" / "N דוחות שנתיים של X ו-Y שלך"; `createdKinds` adds "מצאתי שם גם את X שלך — הוספתי אותה לרשימת המסמכים." per kind (same sentence as Phoenix). Email subject: "דוח(ות) שנתי(ים) <products> - הראל - <year>"; body lists titles when more than one. `harelDocName` fallback becomes product-aware ("דוח שנתי — הפנסיה" / "— קרן ההשתלמות"). `noDocumentsOnSite` names both products ("לא נמצאו שם דוחות פנסיה או קרן השתלמות לשנה המבוקשת").
7. **Mock.** The `harel` branch of `MockTaxFetchClient.downloadDocuments` returns per agreed key: two study-fund files (as today) and one pension file titled "דוח שנתי קרן פנסיה מקיפה — חשבון 12345", so the "pension not on the list" path runs offline.
8. **Tests.** `tests/accessCatalog.test.ts` built list gains `harel/pension_annual`; a new `tests/harelSectors.test.ts` covers the pure sector-resolution helper (exported from `harel.ts`: labels → per-kind option label, missing option → error listing labels) and the per-kind "empty vs no documents" decision; `tests/fetchedRows.test.ts` gets one Harel case (pension found, no pension row → resolve with the "— הראל" name) to prove the generic planner works with the Harel spec.
9. **No migration, no runner protocol bump.** `documentKeys` already reaches the runner; provider ids and keys are free text in the DB.

## Risks / Trade-offs

- [Pension option label changes later] → it is resolved by regex at run time and the error lists the labels, so one failed session is enough to fix the regex.
- [A client with pension at "הראל פנסיה וגמל" but the report filed under another sector label (e.g. "ביטוח")] → the fetch simply finds no pension rows; the study fund still arrives and the client is told nothing about pension (same as today). Noted for the live check.
- [Two rounds double the filter round-trips and the human-cadence pauses] → about one extra minute per session; within the session's existing budget (the OTP step is the slow part).
- [Removing `ownsFetchedDocument: () => true`] → files are attributed by `kind` only; the runner always sets it, the mock too.
- [A provident-fund report in "גמל והשתלמות" is tagged study fund and may create or feed a study-fund row] → unchanged from today; the verification step flags a type mismatch on the file.

## Migration Plan

No DB migration. Deploy = normal push (worker + browser-runner image are built per commit). Rollback = revert the commit; a `harel` session mid-flight on rollback fails through the existing failure path.
