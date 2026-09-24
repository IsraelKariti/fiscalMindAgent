## Why

A real Menora Mivtachim pension annual report (with its capital-declaration certificate on the last page) failed verification on 2026-09-23 with the note "the field 'מספר חשבון' was not found in the document". The model was right: that report prints the member's name, id, employer, fund name and the employer's withholding-file number, but no member or account number at all. Because the savings family declares `account_number` as **required**, every such report fails even though every value the declaration needs (year-end balance, cumulative deposits, as-of date, holder identity) was read correctly. Three extraction runs returned the same null, so this is not a one-off model miss.

## What Changes

- `account_number` becomes **optional** for the three savings types (`pension_provident`, `study_fund`, `life_insurance_savings`). A null account number no longer fails the `type_fields` check for these types; the observed value still lists it as "לא נמצא".
- The savings prompt line for the field tells the model the number may be absent, and that the employer's withholding-file number ("מספר תיק ניכויים") is not an account number.
- Bank balance and securities portfolio keep `account_number` required (those documents always print it).
- An eval case on the real report shape (no member number) proves the document now passes.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `document-extraction`: the "First set of typed fields" requirement changes the savings family's `account_number` from required to optional, and gains a scenario for a pension report with no member number.

## Impact

- `src/agents/declarationOfCapital/catalog.ts`: `SAVINGS_FIELDS.account_number.required` and its `promptHe`.
- `tests/capitalCatalog.test.ts` / `tests/verifyChecks.test.ts`: a test that a savings answer with `account_number: null` passes `type_fields`.
- `evals/cases/extract_document.json` and a synthetic PDF in `evals/files/`: a pension-report case without a member number.
- `docs/agents.md` and the Notion "Type fields" child pages for the three savings types: the field is now optional.
- No migration, no API change, no UI change. Verification records already stored are not rewritten; the failed document on the test client re-verifies on its next attempt.
