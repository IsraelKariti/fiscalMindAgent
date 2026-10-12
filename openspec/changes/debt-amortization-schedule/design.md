## Context

See proposal.md — Why. Today each document type owns its prompt, fields and checks in `src/agents/declarationOfCapital/documentTypes/<type>.ts`, and the catalog entry (`catalog.ts`) owns the description and the analysis hint that the file classifier (`analyzeFile.ts`), the questionnaire mapping, the planner's item list and the client-facing wording all read. The mortgage hint says a schedule is "אינו קביל"; the loan prompt names only a balance certificate. The `as_of_date` check (`verifyChecks.ts`) passes only when the answer's as-of date equals 31.12 of the tax year; `type_fields` fails when the required balance is null. The registry test (`tests/documentTypes.test.ts`) compares each type's built request with a captured fixture under `tests/fixtures/extractionCalls/`, so any prompt change must refresh the fixture.

## Goals / Non-Goals

**Goals:**
- Accept a schedule for `mortgage_balance` and `loan_taken` through text only: catalog wording + extraction prompt.
- Keep every existing check, field and stored shape unchanged, so old records, the trace modal and the Notion gate pages stay valid.
- Guard the new behaviour with eval cases (synthetic schedules) and the fixture test.

**Non-Goals:**
- No new extraction field (such as "balance source") and no new check.
- No change to `loan_given`, to the institutions table, to the verification reply wording, or to the UI.
- No handling of a schedule that needs arithmetic beyond picking a row (for example, a schedule that prints only payment amounts and a starting balance).

## Decisions

1. **Prompt-only change, no schema change.** The model is told how to read a schedule and writes the result into the existing balance field. Alternative considered: a `balance_source` field or a "deduced" flag so the trace shows that the value was read from a schedule. Rejected: `actual_kind` already says what the document is (the prompt asks the model to name it a schedule), which is enough for the admin, and a new field would need a schema, a fixture, a check and a Notion page for no code-level gain.

2. **The model reports 31.12 as the as-of date when the schedule covers it.** The schedule's row is dated by the payment (for example 10.12), but the balance after that row holds until the next payment, so it is the balance at 31.12. Putting 31.12 in `as_of_date` keeps the `as_of_date` check as it is. Alternative considered: relax the check to accept a row date inside the last payment interval. Rejected: more code, and a looser rule for every other date-bound type.

3. **A schedule that does not cover 31.12 yields nulls.** The prompt tells the model to leave the balance and the as-of date null in that case; the existing `as_of_date` ("לא מצוין") and `type_fields` ("לא נמצא") notes then reject the document, and the verification reply already explains those notes to the client. No new note is needed.

4. **The pick rule is stated once, for both printed forms.** Schedules print either the balance after each payment or the balance before it. The prompt states: balance at 31.12 = the balance remaining after the last payment dated on or before 31.12.{{tax_year}}, which is the same as the balance before the first payment dated after it. A projected schedule printed at the loan's start counts the same way (accountant's rule). A last payment on or before 31.12 that reaches zero yields a balance of 0 (the field's lower bound is already 0).

5. **The classifier tells a mortgage schedule from a loan schedule by the document's own wording.** Both catalog hints name the schedule form; the mortgage hint says a schedule of a mortgage (משכנתא wording, a bank's mortgage department, a property-backed loan) is `mortgage_balance`, any other loan schedule is `loan_taken`. The institution check for `mortgage_balance` (institution-bound) is unchanged and still compares the bank on the file with the item's bank.

6. **Catalog `descriptionHe` stays short; the detail goes to `analysisHintHe`.** `descriptionHe` reaches the questionnaire mapping and the client-facing wording, so it only adds "או לוח סילוקין שממנו ניתן לגזור את היתרה ליום 31.12"; the row-picking rule lives in the hint and in the type prompt. The `questionnaire_schema_mapping` evals are re-run to confirm the longer description changes no mapping.

7. **Fixtures are rewritten from the new builders.** The registry test has no refresh flag; the two fixture JSONs (`mortgage_balance.json`, `loan_taken.json`) get their `systemInstruction` replaced by the output of `buildExtractionCall` for the same `doc` and `taxYear` (a one-off `npx tsx` script in the scratchpad, not committed), then the diff is reviewed by eye so only the intended lines changed.

8. **Evals.** Three synthetic PDFs built by `evals/make-files.ts`: a Mizrahi-Tefahot mortgage schedule for 2025 (balance after each payment, the 10.12.2025 row), an Altshuler Shaham loan schedule for the study-fund loan (so it matches the existing `loan_taken` row `doc_9` of the classification checklist), and a truncated schedule that ends in June 2025 with a balance still owed. A mortgage row for Mizrahi-Tefahot is added to the classification checklist for the mortgage schedule case; the existing cases are re-judged to confirm the extra row changes none of them. Each PDF gets an `injection_detection_llm` case (clean file), a `file_classification` case and an `extract_document` case, per the `add-eval-case` skill.

## Risks / Trade-offs

- [The model picks the row after 31.12, or a "before payment" column] → the prompt names both forms and the pick rule once; the mortgage and loan eval cases pin the expected balance to the 10.12 row.
- [The model treats a monthly payment report as a schedule] → the prompt and the hint exclude a report that shows payments without the remaining balance; the spec scenario covers it, and an eval case may be added later if a real file shows the problem.
- [A projected schedule differs from the real balance after prepayments] → accepted by the accountant's rule as given; the accountant can still reject the file in the admin review.
- [Longer catalog description shifts the questionnaire mapping or the planner wording] → `questionnaire_schema_mapping` and `generate_message` evals are re-run and compared with the last run.
- [The client-facing text now offers a schedule, and clients send one for `loan_given`] → `loan_given` keeps its own wording (agreement or judgment); the classifier is unaffected because its hint does not mention a schedule.

## Migration Plan

Deploy as a normal push (prompt and catalog text only). No migration, no backfill. Documents verified before the change keep their stored checks. Rollback = revert the commit.
