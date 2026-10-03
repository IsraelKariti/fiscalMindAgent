## 1. Catalog and storage

- [x] 1.1 Add `CatalogPaper` and `papers?` to `CapitalDocumentType` in `catalog.ts`; declare the seven `real_estate` papers with `shortNameHe` and per-paper `analysisHintHe`; add `getCatalogPaper`, `papersOf`, `paperBelongsToType`, `CAPITAL_DOCUMENT_PAPER_VALUES`. Verify with a new test in `tests/capitalCatalog.test.ts` that paper keys are unique across the catalog and that every paper belongs to exactly one type.
- [x] 1.2 Migration `migrations/060_client_documents_paper.sql`: nullable `paper_key`, plus the backfill of `real_estate` rows by name prefix; add `paper_key` to `ClientDocumentRow` in `src/db/types.ts`. Verify `npm run db:migrate` applies and the local test client's "חוזה רכישה — …" / "נספח תשלומים — …" rows get their papers.
- [x] 1.3 `src/db/queries/clientDocuments.ts`: `insert`, `resolveRequired`, `addInstances` take and write `paper_key`; `splitByCompany` copies the head's. Verify `npm run typecheck` and the existing repository tests pass.

## 2. Item creation carries the paper

- [x] 2.1 `formIntakeRules.ts` / `formIntakeCall.ts`: instance schema gains `paper_key` (shared enum, nullable); the prompt lists each type's papers and tells the model to set the paper per instance; the gate drops a resolution whose instance has no paper on a type with papers, a paper of another type, or a paper on a type without papers, with the reason in the type's check note. Verify with new cases in `tests/formIntake.test.ts` (accepted, missing, wrong type) and `tests/gateChecks.test.ts` for the check note.
- [x] 2.2 `decisionSchema.ts` / `plan.ts`: `resolved_documents[].instances[]` and `added_instances[].instances[]` gain `paper_key`; `normalizeInstances` validates it against the row's / anchor's type; the planner prompt's document list shows the item's paper. Verify with new cases in `tests/intakeDecision.test.ts` (rejection surfaces through `business_rules`) and that `npm run evals -- --stage generate_message` still passes the existing cases.

## 3. Classification names and checks the paper

- [x] 3.1 `analyzeFileRules.ts` / `analyzeFile.ts`: schema field `document_paper` (nullable enum), prompt block listing papers under their types, gate normalisation (paper not of the type → null) and the check `matched_paper_agrees` in the order of design D4. Verify with new cases in `tests/analyzeFileRules.test.ts`: kept match, dropped on differing paper, dropped on no paper, absent for a row without paper, paper of the wrong type nulled.
- [x] 3.2 `prompt.ts`: the planner's file line shows `document paper`. Verify in `tests/fileEvidence.test.ts` (or the file-line test that exists) that the line carries the key.
- [x] 3.3 Evals: add `file_classification` cases for a purchase contract, a payments appendix and a registry extract (synthetic PDFs via `npm run evals:files`), each expecting `document_paper` and the match outcome; extend the case judge to read `document_paper`. Verify `npm run evals -- --stage file_classification` passes and restore unchanged PDFs before committing (see memory `evals files regen churn`).

## 4. Ties, extraction and names

- [x] 4.1 `fileTies.ts`: `paper_differs` refusal after `type_differs`; `plan.ts` and the trace detail renderer show it like the other refusals. Verify with a new case in `tests/fileTies.test.ts` and the i18n label in `web/src/i18n.tsx`.
- [x] 4.2 `extractionCall.ts`: `ExtractableDocument.paper_key`; prompt names the expected paper and carries its anatomy hint; `verifyDocument.ts` passes the row's paper. Verify with a new case in `tests/verifyChecks.test.ts` that the built prompt contains the paper name for a `real_estate` row and is unchanged for a bank row.
- [x] 4.3 `splitChildNames.ts`: unmatched child of a type with papers is named after the paper's short name. Verify with new cases in `tests/splitChildNames.test.ts` (paper named, paper absent).

## 5. Surfaces and documentation

- [x] 5.1 `web/src/i18n.tsx`: labels for `matched_paper_agrees` and `paper_differs`; `src/gemini/llmStages.ts` stage descriptions of `file_classification`, `questionnaire_schema_mapping` and `extract_document` mention the paper. Verify `npm run typecheck` and that `#/llm-stages` renders the updated text.
- [x] 5.2 `docs/agents.md` and `openspec`-independent docs: one paragraph on papers under the catalog section. Verify by reading the rendered file.
- [ ] 5.3 Live check: re-send the Dinovitz 47 PDF to the local test client ניב; verify in the trace that page 5's `validate_classification` fails `matched_paper_agrees`, pages 1-4 are tied and approved, page 5 is shown as "נסח טאבו" under unmatched files, and no spouse is adopted from it.
- [x] 5.4 Update the Notion page "How classification works" (the closed-list and gate sections) to describe papers. Verify the page shows the new check and the `real_estate` paper list.
