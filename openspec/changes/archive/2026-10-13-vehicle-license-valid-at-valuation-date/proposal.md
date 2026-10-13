## Why

A capital declaration describes the client's assets on the valuation date (31.12 of the tax year), so the office accepts a vehicle licence that was valid on that date even if it has since expired. Today the `not_expired` check judges the licence's "valid until" date against the day of verification, and the catalog and planner wording tell the client that an expired licence is never acceptable, so the agent rejects a document the office would take and asks the client for a renewed licence that proves nothing about the valuation date.

## What Changes

- The `not_expired` check of a vehicle document passes when the licence's "valid until" date is on or after 31.12 of the tax year, and fails only when the licence expired before that date. The verification date no longer plays a part. The failure note tells the client the licence expired before 31.12 of the tax year.
- The catalog description, the analysis hint and the extraction prompt of the `vehicle` type, and the planner's vehicle special case, say that the licence must have been valid on 31.12 of the tax year, and that a licence that expired after that date is acceptable. The "an expired licence is not acceptable" wording is replaced; the agent asks for a renewed licence only when the one sent expired before 31.12 of the tax year.
- A licence that was issued after 31.12 of the tax year is still accepted when it reads "valid until" on or after that date (it does today as well); a licence with no readable "valid until" date still skips the check (unchanged).
- No new field, no database change, no UI change. Other document types do not run `not_expired` and are unchanged.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `code-gates`: the `not_expired` entry of "Checks reported by each existing gate" changes its expected value from the verification date to 31.12 of the declaration year, and gains a scenario for a licence that expired between the valuation date and the verification.
- `document-extraction`: a new requirement that the vehicle licence's validity is judged at the valuation date, and that the type's wording to the model and to the client says so.

## Impact

- `src/agents/declarationOfCapital/verifyChecks.ts`: `notExpiredCheck` compares against `${taxYear}-12-31` instead of `localDateString(ctx.now)`; its note changes.
- `src/agents/declarationOfCapital/documentTypes/vehicle.ts`: accepted-forms line and anatomy hint of the prompt (wording about expired licences).
- `src/agents/declarationOfCapital/catalog.ts`: `vehicle` description and `analysisHintHe` (feeds the file classifier, the questionnaire mapping, the planner's item list and the agent's wording to the client).
- `src/agents/declarationOfCapital/prompt.md`: the vehicle special-case bullet (line "חובה לכל רכב").
- `tests/verifyChecks.test.ts` (the `not_expired` case) and `tests/fixtures/extractionCalls/vehicle.json` (captured prompt text must be refreshed).
- `evals/cases/extract_document.json`: a new case with a licence that expired after 31.12 of the tax year but before the verification date (new synthetic PDF in `evals/make-files.ts`), and one that expired before 31.12.
- `docs/agents.md` (vehicle spec paragraph and the `notExpiredCheck` line); Notion pages Accounting → Vehicles and LLM calls → Document extraction → Vehicle (per `STYLE.md`).
- No migration, no API change.
