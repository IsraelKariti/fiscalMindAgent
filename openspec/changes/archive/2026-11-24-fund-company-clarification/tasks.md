## 1. Prompt: company-unknown note and site list

- [x] 1.1 Add `sitesForUnnamedRow` to `src/agents/declarationOfCapital/taxFetch/flow.ts` (providers whose credentials resolve for the client, WhatsApp allowed, and whose matcher accepts `"<row name> — <siteNameHe>"`; credentials memoised per run) and verify with a unit test in `tests/companyClarification.test.ts` (pension row → the six fund sites; client without id → empty; study-fund row → sites with a study-fund type only).
- [x] 1.2 In `prompt.ts` add the row line extra `חברה: לא ידועה — ...` with the site names for pending institution-bound rows whose name identifies no table company; none for rows that name a company, are not pending, or are not institution-bound. Verify with a prompt unit test (the four spec scenarios of "The prompt marks an item whose company is unknown").
- [x] 1.3 Add the asking rule to `prompt.md` (same-message single question, prose offer when the answer names a listed site, `set_company` with quote, several companies → first on the row + `add_instance`, "don't know" → upload and never ask again). Verify by reading the rendered prompt in a test fixture (`tests/` prompt fixture guard) and `npm run typecheck`.

## 2. Tool, gate and execution

- [x] 2.1 Add the `set_company` tool to `decisionTools.ts` (`document_id`, `company`, evidence pair) in the intake/checklist group and verify `tests/decisionTools.test.ts` lists it in the offered tools and parses a call.
- [x] 2.2 Add `validateSetCompany` to `decisionSchema.ts` with the checks `set_company_row_allows`, `business_rules`, `set_company_in_quote`, `set_company_recognised` and the normalized `setCompanies` entries (new name built with the split separator, table label or capped client text); verify with gate unit tests for the six gate scenarios (recognised, not in table, already names a company, quote without the company, row not pending, two companies with a sibling `add_instance`).
- [x] 2.3 Execute `set_company` in `plan.ts` first in the checklist-changes group: write through `clientDocuments.setCompanyName` (pending rows only; the split write also renames claimed/collected heads), record the `set_company` step (`toolStepDetails.ts`: old name, new name, company key or "not in table", quote, outcome) and the `document.company_set` audit event, reload `run.documents`, publish the client update; verify with a unit test of the step detail (renamed, and a raced head records "no change"); the DB write itself is covered by the live check 3.4.
- [x] 2.4 Verify end to end in a unit test that the renamed row now matches the provider (the Migdal `pension_annual` matcher accepts the renamed row and no other provider does — `loadTaxFetchContexts` needs a DB, so its matcher is tested directly) and that a file of another company is refused for it (`compareCompanies` on the new name).

## 3. Docs, evals and checks

- [x] 3.1 Add the `set_company` rows to `docs/pipeline.md` (gate check and execution step) and verify the table lists the function names used.
- [x] 3.2 Add two planner eval cases to `evals/cases/planner.json` with `/add-eval-case` (client names Migdal → `set_company` + message mentions the Migdal site and asks no upload; client does not know → no `set_company`, message asks for the document) and verify `npm run evals -- --stage planner` judges both as passing.
- [x] 3.3 Run `npm test` and `npm run typecheck`; verify green.
- [ ] 3.4 Live check on the local dev stack with the test client: a no-company pension row shows the note in the planner prompt (LLM call modal), the client's "הפנסיה שלי במגדל" renames the row in the Documents tab, and the next planner call shows the Migdal fetch block.
