## 1. Catalog wording

- [x] 1.1 In `catalog.ts`, extend `mortgage_balance.descriptionHe` with the schedule form ("או לוח סילוקין שממנו ניתן לגזור את יתרת החוב ליום 31.12.{{tax_year}}") and rewrite its `analysisHintHe`: remove "אינו קביל: לוח סילוקין", add the row-picking rule (balance after the last payment dated on or before 31.12 of the tax year, projected schedule counts), keep the payment-report and current-account exclusions, and say that a schedule of a mortgage is this type while another loan's schedule is `loan_taken`. Verify with `npm run typecheck` and by reading the rendered hint once.
- [x] 1.2 In `catalog.ts`, extend `loan_taken.descriptionHe` with the same schedule form and add an `analysisHintHe` with the row-picking rule and the payment-report exclusion. Verify with `npm run typecheck`.

## 2. Extraction prompts

- [x] 2.1 In `documentTypes/mortgageBalance.ts`, update the accepted-forms line and the anatomy paragraph to match 1.1, and extend the `principal_balance` instruction: from a schedule, the balance after the last payment dated on or before 31.12.{{tax_year}} (same as before the first later payment), zero when that payment clears the loan, null when the schedule does not cover that date; add to the `as_of_date` guidance that a covering schedule reports 31.12.{{tax_year}} and a non-covering one reports null; ask the model to name a schedule in `actual_kind`. Keep the file CRLF. Verify `npm test -- tests/documentTypes.test.ts` fails only on the mortgage fixture.
- [x] 2.2 Same for `documentTypes/loanTaken.ts` (`outstanding_balance`). Keep CRLF. Verify the registry test fails only on the two fixtures.
- [x] 2.3 Refresh `tests/fixtures/extractionCalls/mortgage_balance.json` and `loan_taken.json`: rebuild `systemInstruction` with `buildExtractionCall` for the fixture's `doc` and `taxYear` via a one-off scratchpad script (not committed), review the diff so only the intended lines changed, and verify `npm test` passes.

## 3. Evals

- [x] 3.1 In `evals/make-files.ts`, add three synthetic PDFs: `mizrahi_mortgage_schedule_2025.pdf` (monthly rows on the 10th with the balance after each payment, 10.12.2025 row = 412,300, 10.01.2026 row = 410,900, client's name and id, loan number), `altshuler_loan_schedule_2025.pdf` (study-fund loan of Altshuler Shaham, last 2025 row = 18,640), and `loan_schedule_truncated_2025.pdf` (rows end 10.06.2025 with 50,000 owed). Run `npx tsx evals/make-files.ts`, restore every unchanged PDF (`git checkout -- evals/files/<unchanged>`), and verify only the three new files are added.
- [x] 3.2 Add the three files to `evals/cases/injection_detection_llm.json` (clean, `suspected_injection: false`), to `evals/cases/file_classification.json` (add a Mizrahi-Tefahot `mortgage_balance` row to the checklist; mortgage schedule → `mortgage_balance` matched to it, issuer `mizrahi_tefahot`; Altshuler schedule → `loan_taken` matched to `doc_9`; truncated → `loan_taken`), and to `evals/cases/extract_document.json` (mortgage: `principal_balance` 412300, `as_of_date` 2025-12-31, verdict passed; loan: `outstanding_balance` 18640, passed; truncated: both null, failed keys `as_of_date` + `type_fields`). Verify with `npx tsc -p evals/tsconfig.json`.
- [x] 3.3 Run the three stages plus `questionnaire_schema_mapping` and `generate_message` with `npx tsx evals/run.ts --stages ... --models <the available models>` (per the `run-evals` skill), confirm the new cases pass and no earlier case regressed against the last run; restore `evals/results/latest.json` if the run must not become "latest", and force-add the run file.

## 4. Docs and Notion

- [x] 4.1 Update the `mortgage_balance` and `loan_taken` lines of the field-set paragraph in `docs/agents.md` ("balance at 31.12, from a balance letter or deduced from an amortization schedule"). Verify by reading the paragraph.
- [x] 4.2 Per `STYLE.md`, update Notion pages Accounting → Debts (the decision chart: a schedule that covers 31.12 is accepted for a mortgage or a loan) and LLM calls → Document extraction → Mortgage balance and Loan taken (accepted forms, the row-picking rule; remove "Not accepted: a repayment schedule"). Verify by opening each page once.

## 5. Commit

- [ ] 5.1 `git pull --rebase origin master`, `npm run typecheck`, `npm test`, commit (message via file, `git commit -F`), push; verify the push lands on `origin/master`.
