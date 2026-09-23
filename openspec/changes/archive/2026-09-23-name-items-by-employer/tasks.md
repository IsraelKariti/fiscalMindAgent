## 1. Catalog and classifier field

- [x] 1.1 Add `employerBound: true` to `study_fund` and `pension_provident` in `catalog.ts` and an `isEmployerBound(typeKey)` helper; verify with a unit test in `tests/capitalCatalog.test.ts` that exactly these two keys are employer-bound.
- [x] 1.2 Add `employer_name: string | null` to `FileAnalysisSchema` / `FileAnalysis` (optional on stored rows) and the prompt line in `analyzeFile.ts` (printed "שם המעסיק" only, null when none or several employers); make `validateClassification` null the field for non-employer-bound types and leave the gate's checks list unchanged; verify with `tests/analyzeFileRules.test.ts` (kept for a study fund, nulled for a bank balance, no new check) and `npm run typecheck`.
- [x] 1.3 Show `employer: <cleaned>` on the planner's analysis line for employer-bound types (`prompt.ts`), absent for other types, older analyses and quarantined files; verify with `tests/fileHoldings.test.ts` cases for the line.

## 2. Names

- [x] 2.1 Add `cleanEmployer` and `employerSuffixedName` to `splitChildNames.ts` (unprintables stripped, whitespace collapsed, "—" replaced, ≤ 60 chars, at least one letter, no double suffix when the name already contains the employer); verify with new cases in `tests/splitChildNames.test.ts` including the 80-character and digits-only rejections.
- [x] 2.2 Extend `childLabel` to append the employer after the company for a matched child and to build `short type — company — employer` for an unmatched child, employer-bound types only; pass `employer_name` from `analyzeInboundFile.ts`; verify with the label scenarios of the `file-splitting` delta spec as unit tests (Meitav matched, Meitav unmatched, employer without company, Clal insurance without employer, item already naming the employer).

## 3. Split by employer

- [x] 3.1 Add the employer stage to `planCompanySplit` in `companySplit.ts` (`employer` on created entries, `employer` in the file evidence, items that already name a company included, stage-1 siblings extended, files without an employer stay); verify with `tests/companySplit.test.ts` cases for: three Meitav employers + one Mor file on "קרן השתלמות ניב"; the same on an item that already names Meitav; two Meitav files without employer; an item already naming an employer with one same and one new employer; Clal insurance files with employers (no employer split).
- [x] 3.2 Add `employer?: string` to the file evidence type in `src/db/types.ts` and `web/src/api.ts`; in `plan.ts` set the audit `reason` to `employer_split` for created rows with an employer and add `employer` to `CompanySplitDetail.created` and `collectionsStepDetail` (`applyStepDetails.ts`); verify with `tests/applyStepDetails.test.ts` and `npm run typecheck`.
- [x] 3.3 Render the employer on the `created_by_company` line in `web/src/components/stepSummary.ts` (`name ← file (employer)`), older rows unchanged; verify with `tests/stepSummary.test.ts` and `npm run build:gui`.

## 4. Planner prompt and docs

- [x] 4.1 Add one sentence to the company-check paragraph of `prompt.md`: reports of one company for one fund item are divided per employer by the platform — no question to the client, no instances for them; verify the generate_message evals still pass (`run-evals` skill, compare with the last run).
- [x] 4.2 Update `docs/agents.md` (file naming and split section) and the stage description of the classifier (`employer_name` field) so `#/llm-stages` shows it; verify by reading the rendered page once.

## 5. Evals

- [x] 5.1 Add an `employer` expectation to the `file_classification` judge (`evals/stages.ts`) and one synthetic Meitav-style case (page 1 with "שם המעסיק", page 2 certificate with three accounts) with the `add-eval-case` skill; verify the case passes on the current model and the report shows no regression elsewhere.

## 6. End to end

- [x] 6.1 Run `npm test` and `npm run typecheck`; commit per the Git workflow.
- [x] 6.2 On the local test client, mark the Meitav item pending, re-analyse the three children and let the planner cycle run; verify the documents card shows three items "… — מיטב — <employer>", each with one child of the same display name, each downloading under its own file name, and the `apply_collections` step lists the rename and two employer siblings.

Task 6.2 was skipped by owner decision on 2026-09-23 (no admin re-analysis action exists; the test client's Meitav item stays approved). Verify the employer names on the next real fund reports.
