## 1. Status value and storage

- [x] 1.1 Add `not_needed` to `FileAnalysisStatus` in `src/db/types.ts` and `web/src/api.ts`; verify both typechecks (`npm run typecheck`, `npx tsc -p web/tsconfig.json --noEmit`) still pass.
- [x] 1.2 Extend `documentFiles.insertIfNew` with an optional `analysisStatus?: 'pending' | 'not_needed'` (default `pending`) written in the INSERT; verify by reading the query that the column is set in the same statement.
- [x] 1.3 Pass `analysisStatus: 'not_needed'` from `taxFetch/deliver.ts`; verify with the mock tax-fetch in the dev stack that a newly delivered file row has `analysis_status = 'not_needed'` and `analyzed_at IS NULL` (psql or the admin file browser).
- [x] 1.4 Add `migrations/057_fetched_files_analysis_not_needed.sql` with the backfill update and a comment explaining why; run `npm run db:migrate` locally and verify the existing Altshuler rows for client ישראל now read `not_needed` while WhatsApp rows are unchanged.

## 2. Agent prompt

- [x] 2.1 Add the `not_needed` branch to `formatFileAnalysis` in `src/agents/declarationOfCapital/prompt.ts` with the wording from design decision 4; verify `npm test` passes and, if a prompt snapshot or unit test covers `formatFileAnalysis`, extend it with a `not_needed` case.

## 3. Workspace UI

- [x] 3.1 Add i18n strings `analysisNotNeeded` ("הובא אוטומטית מהאתר") and `analysisNotNeededTitle` (tooltip) in `web/src/i18n.tsx`; verify web typecheck passes.
- [x] 3.2 Add the `not_needed` branch to `AnalysisLine` in `web/src/components/DocumentsCard.tsx` (neutral badge + tooltip, placed before the generic not-done fallback); verify in the dev stack that the two Altshuler files show the new badge and a WhatsApp file still shows its verdict line.

## 4. Wrap-up

- [x] 4.1 Confirm `fileEvidence.ts` needs no change: `not_needed` is not quarantined and is not evidence; add a one-line comment there naming the value so the intent is visible; verify `npm test` passes.
- [x] 4.2 Commit per the repo git workflow (pull --rebase, typecheck, commit, push) and note in the commit body that prod needs migration 057.
