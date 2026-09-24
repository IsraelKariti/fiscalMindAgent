## 1. Catalog

- [x] 1.1 In `src/agents/declarationOfCapital/catalog.ts`, set `SAVINGS_FIELDS.account_number.required` to `false` and rewrite its `promptHe`: the member / account / policy number as printed on the report header or the certificate; `null` when the document prints none; "מספר תיק ניכויים" is the employer's withholding file, not the account number (design decision 2). Also soften the `SAVINGS_CERTIFICATE_HINT_HE` phrase "מופיעים בו שם העמית, מספר חשבון, מספר תיק ניכויים" to say the account number appears in some funds' certificates and not in others. Verify: `npm run typecheck` passes; `npm test` still green.
- [x] 1.2 In `tests/capitalCatalog.test.ts`, assert the `required` flag of every field in the three savings types explicitly (`fund_name` true, `account_number` false, `closing_balance` false, `total_deposits` false) and that `bank_balance` / `securities_portfolio` keep `account_number` required. Verify: `npm test` passes and the test fails if the flag is flipped back.

## 2. Checks

- [x] 2.1 In `tests/verifyChecks.test.ts`, add a savings-context case: an answer with `fund_name` set, `account_number: null`, `closing_balance: 1134117`, `total_deposits: 358133` passes `type_fields` and the observed text contains "מספר חשבון: לא נמצא"; the same answer with `fund_name: null` still fails; a bank-context answer with `account_number: null` still fails with "מספר חשבון" in the note (spec scenarios "Pension report that prints no member number" and "Bank certificate without an account number still fails"). Verify: `npm test` passes.

## 3. Evals

- [x] 3.1 With the `add-eval-case` skill, add `menora_pension_no_member_number_2025.pdf` to `evals/make-files.ts` in the real report's shape (design decision 3): page 1 = annual report header with member name / id / employer and the funds-movement table ending in the year-end balance; page 2 = "אישור מס להצהרת הון" with name, id, fund name, "מספר תיק ניכויים: 936300342", member status and the deposits table — no member or account number anywhere. Regenerate with `npm run evals:files` and restore every unchanged PDF before committing (see memory `project_evals_files_regen_churn`). Verify: the new PDF opens and shows no account number.
- [x] 3.2 Add an `extract_document` case (`ext_18`) on that file for `pension_provident` with `expected.fields: { "account_number": null, "closing_balance": <balance>, "total_deposits": <deposits> }` and `verdict.passed: true`, plus a `file_classification` case (`document_type: pension_provident`, holdings with `account_number: null`) and an `injection_detection_llm` file case (benign). Update the "Cases" column in `evals/README.md`. Verify: `npm run evals -- --cases ext_18,<cls id>,<inj id> --models gemini-2.5-flash --out evals/results/smoke.json` passes the three; `/run-evals extract_document` compares clean against the last run and the result run is committed.

## 4. Docs

- [x] 4.1 Update `docs/agents.md` (the "Type-specific extraction fields" bullet and the savings-family paragraph): the savings account number is optional, and why (Menora's report prints none). Verify: the text agrees with the delta spec.
- [x] 4.2 Notion, per `STYLE.md`: on the three savings child pages under "4. Extraction for verification" ("Type fields" section), change the "מספר חשבון" field card from required to optional and add one sentence on the withholding-file number. Verify: the three cards read "optional" and match `catalog.ts`.

## 5. Live check

- [x] 5.1 With the local stack running (owner's terminal), re-run verification of the spouse's Menora report on test client "ניב" (document `3a11f2b1-3edc-4684-8fda-3cbf8fca4b8c`, file `b512ea1f-27d8-42fa-a012-2063d1b6520f`) and confirm in the step modal that `type_fields` passes with "מספר חשבון: לא נמצא" and the document is approved. Verify: the new `verify_extraction` step shows `result: true`. DONE 2026-09-24: step `fb2ef19c-ba09-4b57-9c99-8338a88d703e` (attempt 2) — `type_fields` passes with "מספר חשבון: לא נמצא", document approved.
