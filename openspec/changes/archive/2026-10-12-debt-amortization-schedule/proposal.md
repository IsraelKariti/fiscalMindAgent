## Why

Clients often hold no year-end balance letter for a mortgage or a loan, but they do hold the lender's amortization schedule (לוח סילוקין), which lists every payment with the balance that remains after it. The accountant accepts such a schedule when the debt at 31.12 of the tax year can be read from it, yet today the mortgage type explicitly rejects a schedule ("אינו קביל: לוח סילוקין") and the loan type only asks for a balance certificate, so the agent refuses a document the office would take.

## What Changes

- For the client's two debt types, `mortgage_balance` and `loan_taken`, an amortization schedule becomes an accepted document when the balance owed at 31.12 of the tax year can be deduced from it: the balance remaining after the last payment dated on or before 31.12 of the tax year.
- The catalog description and the analysis hint of both types name the schedule as an accepted form (so the file classifier recognises it and the agent can offer it to the client), and drop the "not acceptable" wording for the mortgage type.
- The extraction prompt of both types tells the model how to deduce the balance from a schedule, to report 31.12 of the tax year as the as-of date when the schedule covers that date, and to report no balance and no as-of date when it does not (the existing checks then reject it with the existing notes).
- A schedule that does not cover 31.12 of the tax year (starts after it, or is cut off before it with a balance still owed) is not accepted; a schedule whose last payment before 31.12 brings the balance to zero proves a zero debt.
- `loan_given` (money others owe the client) is not a debt of the client and is unchanged. Vehicle, real estate and the other types are unchanged.
- No new field, check or database change.

## Capabilities

### New Capabilities

(none)

### Modified Capabilities

- `document-extraction`: a new requirement that the two debt types accept an amortization schedule and how the 31.12 balance and the as-of date are read from it (it extends the `principal_balance` and `outstanding_balance` meanings of "First set of typed fields" to the schedule case; that requirement's text is not changed).

## Impact

- `src/agents/declarationOfCapital/catalog.ts`: `mortgage_balance` and `loan_taken` description + analysis hint (feeds the file classifier, the questionnaire mapping, the planner's item list and the agent's wording to the client).
- `src/agents/declarationOfCapital/documentTypes/mortgageBalance.ts`, `loanTaken.ts`: accepted-forms line and the field instructions of the prompt.
- `tests/fixtures/extractionCalls/mortgage_balance.json`, `loan_taken.json`: the captured prompt text must be refreshed (the registry test compares the built request to the fixture).
- `evals/`: new synthetic schedule PDFs (`make-files.ts`) and cases for `injection_detection_llm`, `file_classification` and `extract_document`.
- `docs/agents.md` field-set paragraph; Notion pages Accounting → Debts and LLM calls → Document extraction → Mortgage balance / Loan taken (per `STYLE.md`).
- No migration, no API change, no UI change.
