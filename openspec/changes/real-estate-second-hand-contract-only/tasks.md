## 1. Catalog text

- [x] 1.1 `catalog.ts`, `real_estate`: rewrite `descriptionHe` to the new branches (second hand → contract only; from a builder → contract + appendix; not delivered on 31.12 → + builder report; inherited; gift; prior declaration by our office; contract lost → assessment + tabu as the second option; assessment without cost → signed cost declaration + tabu). Rewrite `discoveryQuestionHe` per design D5. Relax `cost_declaration.analysisHintHe` per design D4. Verify `npm run typecheck` passes and `tests/capitalCatalog.test.ts` still passes (keys unchanged).

## 2. Questionnaire mapping

- [x] 2.1 `formIntakeCall.ts`, the `real_estate` special-key paragraph: second hand → one `purchase_contract` instance; from a builder → `purchase_contract` + `payments_appendix`; not delivered → also `builder_payments_report`; inherited and gift unchanged; "bought" with no source → `purchase_contract` only (explicit sentence, design D2). Verify by reading the rendered prompt in `#/llm-stages` for `questionnaire_schema_mapping`.
- [x] 2.2 `evals/cases/questionnaire_schema_mapping.json`: change `map_11` to the "bought, source unknown" case expecting the contract instance only; add a second-hand case (contract only) and a from-a-builder case (contract + appendix). Verify `npm run evals -- --stage questionnaire_schema_mapping --models <model>` passes the three cases.

## 3. Planner prompt

- [x] 3.1 `prompt.md`, the real-estate special case: replace the "נכס שנרכש" branch with "יד שנייה" (contract only), "מקבלן" (contract + appendix; ask whether delivered and fully paid by 31.12, else add the builder report), the question to ask when the client said only "bought", the rule to add the appendix on "מקבלן" and to retire it on "יד שנייה", the second option on a missing purchase item (design D3, keep the two site links), and the simplified cost-declaration branch (design D4). Verify by reading the rendered planner prompt in `#/llm-stages` and that `npm run evals -- --stage generate_message --models <model>` still passes the existing cases.
- [x] 3.2 `evals/cases/generate_message.json`: add a case where a second-hand buyer writes that the contract is lost; expect the contract item retired, `purchase_tax_assessment` and `tabu_extract` added with the client's quote, and the reply naming the Tax Authority personal area. Verify the case passes with `npm run evals -- --stage generate_message --models <model>`.

## 4. Docs and checks

- [x] 4.1 `docs/agents.md`, the document-papers paragraph: one sentence on the per-branch papers and a link to the Notion page Accounting → Real estate. Verify by reading the rendered file.
- [x] 4.2 Run `npm test`, `npm run typecheck` and the two eval stages above; restore unchanged synthetic PDFs and the untouched `evals/results/latest.json` before committing (memory: evals files regen churn). Verify a clean `git status` apart from the intended files.
- [ ] 4.3 (left to the owner — needs a real WhatsApp inbound) Live check on the local dev stack with the test client: send "קניתי את הדירה יד שנייה" and confirm the appendix item is retired and the reply asks for the contract only; then send "אין לי את החוזה" and confirm the second option is offered with the two items added. Verify in the trace (`validate_message` passed, `apply_collections` shows the retire + add).
