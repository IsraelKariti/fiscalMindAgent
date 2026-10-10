## 1. Capture the baseline and build the helper library

- [x] 1.1 Capture fixtures: for every catalog type plus an untyped row, run today's `buildExtractionCall` (fixed row name/description, tax year 2025, no paper and, for `real_estate`, each paper) and write the system prompt and JSON schema to `tests/fixtures/extractionCalls/<key>[.<paper>].json`; verify the folder holds 18+ files and `git diff` shows only additions.
- [x] 1.2 Add `documentTypes/types.ts` with `DocumentTypeSpec`, `TypeField`, `FieldKind`; verify `npm run typecheck` passes.
- [x] 1.3 Split `runChecks` in `verifyChecks.ts` into the exported helpers of design D3 (`legibleCheck`, `expectedTypeCheck`, `identityChecks`, `asOfDateCheck`, `notExpiredCheck`, `amountsCheck`, `typeFieldsCheck`, `periodCoversValuationDateCheck`, `verdictOf`), keeping `runChecks` temporarily as a wrapper over them; verify `npm test` still passes unchanged.

## 2. Write the type modules

- [x] 2.1 `generic.ts`: common-only schema, the full prompt with no type lines, verify = legible + expected type + identity (subjectMatch false); verify its prompt/schema equal the untyped fixture.
- [x] 2.2 `bankBalance.ts` and `securitiesPortfolio.ts` (owner, as-of date, amounts, type fields); verify prompt/schema equal their fixtures.
- [x] 2.3 `pensionProvident.ts`, `studyFund.ts`, `lifeInsuranceSavings.ts` (savings fields written out in each, any-of closing balance / total deposits); verify prompt/schema equal their fixtures.
- [x] 2.4 `mortgageBalance.ts` (loan number, principal at 31.12) and `vehicle.ts` (five fields, any-of plate / purchase cost, not-expired line and check); verify prompt/schema equal their fixtures.
- [x] 2.5 `contentsInsurance.ts` (policy number, contents sum, period from/to, period covers 31.12 check); verify prompt/schema equal its fixture.
- [x] 2.6 `realEstate.ts` (no extra fields; paper placeholder); verify prompt/schema equal its fixtures for every paper.
- [x] 2.7 The remaining no-field types: `loanTaken.ts`, `loanGiven.ts`, `businessOwnership.ts`, `crypto.ts`, `privateInvestment.ts`, `poaAccount.ts`, `priorDeclaration.ts`, `otherAssets.ts`, each with exactly the checks its old catalog flags turned on; verify prompt/schema equal their fixtures.
- [x] 2.8 `documentTypes/index.ts`: `DOCUMENT_TYPES` and `documentTypeSpec(typeKey)` with the generic fallback; verify a unit test resolves every catalog key and falls back for `null` and an unknown key.
- [x] 2.9 `tests/documentTypes.test.ts`: the guard test of design D5 (key sets equal, common keys present, extra keys in prompt and in `fields`, no collisions, fixtures equal); verify it passes and that removing one prompt line makes it fail naming the type and the key.

## 3. Wire the pipeline to the registry

- [x] 3.1 `extractionCall.ts`: `buildExtractionCall` takes the spec, fills only `{{expected_name}}`, `{{expected_description}}`, `{{paper_context}}`, `{{tax_year}}`; delete `checksFor` / `fieldsFor`; verify the guard test's fixture comparison still passes through the real builder.
- [x] 3.2 `verifyDocument.ts`: `documentTypeRules` returns the spec; parse with `spec.schema`; `checkExtractedData` calls `spec.verify`; `recordVerifyExtractionStep` labels from `spec.fields`; verify `npm run typecheck` and `npm test` pass.
- [x] 3.3 Remove `checks`, `fields`, `fieldsAnyOf`, `SAVINGS_FIELDS`, `GENERIC_CHECKS`, `VerificationChecks`, `ExtractionField`, `FieldKind` from `catalog.ts`; delete the `runChecks` wrapper and the `checks`/`fields`/`fieldsAnyOf` members of `CheckContext`; verify `npm run typecheck` passes with no remaining importer.
- [x] 3.4 Move the per-type scenarios of `tests/verifyChecks.test.ts` (expiry, period, bank/study-fund fields, savings any-of, "type with no fields yields neither check") to `tests/documentTypes.test.ts` against `spec.verify`; rewrite the remaining helper tests; drop the field-uniqueness assertions from `tests/capitalCatalog.test.ts`; verify `npm test` passes.

## 4. Evals, sample script and the stages page

- [x] 4.1 `evals/stages.ts`: build with `documentTypeSpec(c.doc.type_key)`, judge typed fields from `spec.fields`, verdict from `spec.verify`; verify `npm run evals:rejudge -- --in evals/results/<last run>.json` reports the same pass/fail and failed keys for every `extract_document` case as the last run.
- [x] 4.2 `scripts/verifyExtractionSample.ts`: same substitution; verify `npx tsx scripts/verifyExtractionSample.ts --help` (or a dry run with a local sample) runs without a type error.
- [x] 4.3 `llmStages.ts`: optional `schema` on `LlmStagePrompt`; the extraction stage lists one variant per module with its schema, generic last; verify `tests/llmStages.test.ts` passes and `GET /api/admin/llm-stages` returns 18 variants for `extract_document`.
- [ ] 4.4 `AdminLlmStages.tsx`: show a variant's own schema table under that variant when present; verify `npm run build:gui` passes and the `#/llm-stages` page shows the `bank_balance` variant with the three bank fields and `prior_declaration` with common fields only.

## 5. Docs and wrap-up

- [x] 5.1 Update `docs/agents.md` (the type-specific extraction fields paragraph) and `docs/pipeline.md` section E rows 2, 4 and 7 to name the type modules, the registry and the helpers; verify every function named there exists (`grep`).
- [x] 5.2 Run `npm run typecheck`, `npm test`, the evals re-judge, and compare the `#/llm-stages` page; commit per the repo git workflow; verify the push lands on master.
