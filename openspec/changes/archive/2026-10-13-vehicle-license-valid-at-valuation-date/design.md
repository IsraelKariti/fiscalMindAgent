## Context

See proposal.md — Why. Today `notExpiredCheck` (`verifyChecks.ts`) compares `valid_until` with `localDateString(ctx.now)`; `ctx.now` exists in `CheckContext` only for this check. The vehicle rule is also written in prose in four places: the catalog `vehicle` description and `analysisHintHe`, the vehicle type's prompt (accepted-forms line + anatomy line), and the planner's vehicle special case in `prompt.md`. The captured prompt fixture `tests/fixtures/extractionCalls/vehicle.json` locks the prompt text.

## Goals / Non-Goals

**Goals:**
- One date rule for the licence: valid on 31.12 of the tax year, in code and in every prose place.
- Keep the trace shape: same check key, observed = date read, expected = a date.

**Non-Goals:**
- Reading the licence's issue date or deciding anything about licences issued after the valuation date.
- Changing other types or adding a validity check to any of them.
- Removing `now` from `CheckContext` (it stays; the field becomes unused by this check but it is plumbed from `verifyDocument.ts` and `evals/stages.ts`, and removing it is churn with no behaviour).

## Decisions

- **Expected value = `${taxYear}-12-31`**, the same string `asOfDateCheck` and `periodCoversValuationDateCheck` use, so the modal shows the valuation date beside the licence date. Alternative: keep expected = verification date and only relax the comparison — rejected, the expected column would then explain nothing about why the row passed.
- **Comparison is string `>=` on YYYY-MM-DD**, like today; a licence valid until exactly 31.12 passes (it was valid on the valuation date).
- **Note text** names the valuation date: `המסמך בתוקף עד {valid_until} — תוקפו פג לפני יום 31.12.{taxYear} (המועד הקובע); יש לשלוח את הרישיון שהיה בתוקף בתאריך זה`. The planner sees this note in the VERIFICATION RESULTS block and writes the client reply from it, so it must say what to send.
- **Prose rule in one sentence**, reused in the catalog description, the hint, the type prompt and `prompt.md`: the licence must have been valid on 31.12.{{tax_year}}; a licence that expired after that date is acceptable; a licence that expired before it is not, and then the client sends the licence that was valid on that date (or the renewed one when its validity started before 31.12). The classifier/analysis hint keeps "not the renewal slip" unchanged.
- **Evals**: the `extract_document` cases share one verification date (`now` = 2026-02-01 in the file header; there is no per-case override), so the "expired after 31.12 but before the verification" licence is valid until 2026-01-15 (passes), and a second licence valid until 2025-07-20 fails on `not_expired`. Two new synthetic PDFs. `evals/make-files.ts` is regenerated only for the new file (see memory on regen churn: restore unchanged PDFs before committing).

## Risks / Trade-offs

- [A licence issued after 31.12 with a "valid until" in the next year proves nothing about ownership on 31.12] → unchanged from today (such a licence passes today too); ownership on the valuation date is the accountant's judgment, not this check's.
- [The planner keeps old habits from the previous wording and still asks for a "renewed licence"] → the special-case bullet in `prompt.md` is rewritten, and the failure note states the exact ask; the `generate_message` evals are re-judged.
- [Fixture mismatch] → the registry test fails until `vehicle.json` is refreshed; refresh it as part of the prompt task.
