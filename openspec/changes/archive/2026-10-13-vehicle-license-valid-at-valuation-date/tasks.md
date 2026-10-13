## 1. The check

- [x] 1.1 In `src/agents/declarationOfCapital/verifyChecks.ts`, make `notExpiredCheck` compare `valid_until` with `${ctx.taxYear}-12-31`, set `expected` to that date and change the note to say the licence expired before 31.12 of the tax year and to ask for the licence that was valid on that date; verify with `npm run typecheck`.
- [x] 1.2 Update the `not_expired` case in `tests/verifyChecks.test.ts`: a licence valid until 2026-03-20 passes with `now` 2026-05-15 for tax year 2025, 2025-12-31 passes, 2025-07-20 fails with expected `2025-12-31` and a note naming 31.12.2025, null/malformed still skip; verify with `npm test`.

## 2. The wording

- [x] 2.1 In `src/agents/declarationOfCapital/catalog.ts`, rewrite the `vehicle` description and `analysisHintHe` so the licence must have been valid on 31.12.{{tax_year}}, a licence that expired after that date is acceptable, and only one that expired before it is not; keep the renewal-slip trap; verify by reading the rendered catalog text in the planner prompt (`npm run step` on a local planner step or the `#/llm-stages` page).
- [x] 2.2 In `src/agents/declarationOfCapital/documentTypes/vehicle.ts`, apply the same rule to the accepted-forms line and the anatomy line of the prompt, then refresh `tests/fixtures/extractionCalls/vehicle.json`; verify with `npm test` (the registry test compares prompt and fixture).
- [x] 2.3 In `src/agents/declarationOfCapital/prompt.md`, rewrite the vehicle special-case bullet "חובה לכל רכב": the licence must have been valid on 31.12.{{tax_year}}; ask for a renewed licence only when the one sent expired before that date; verify by reading the rendered planner prompt on `#/llm-stages`.

## 3. Evals and docs

- [x] 3.1 Add synthetic licence PDFs in `evals/make-files.ts` (valid until 2026-01-15 — expired after 31.12.2025 but before the harness verification date 2026-02-01 — and valid until 2025-07-20), and add `extract_document` cases ext_27 (passes) and ext_28 (fails on `not_expired`); verify with `/run-evals` on `extract_document` (both cases pass, no other case changes) and restore any regenerated unchanged PDFs before committing.
- [x] 3.2 Re-judge `generate_message` and `planner` evals and confirm no reply still says an expired licence is never acceptable; verify with `/run-evals` comparison against the last run. (Re-judge: 0 verdicts changed. No stored case covers an expired licence; the stored replies only ask for "רישיון הרכב בתוקף", which the new wording still allows.)
- [x] 3.3 Update `docs/agents.md` (vehicle spec paragraph and the `notExpiredCheck` line) and the Notion pages Accounting → Vehicles and LLM calls → Document extraction → Vehicle per `STYLE.md`; verify by reading the updated text.

## 4. Commit

- [x] 4.1 `git pull --rebase origin master`, `npm run typecheck`, commit, `git push origin master`; verify the push succeeds.
