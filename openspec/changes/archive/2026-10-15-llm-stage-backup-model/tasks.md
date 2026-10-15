## 1. Backup setting (server)

- [x] 1.1 In `src/gemini/modelSettings.ts` add `purposeBackupSettingKey`, `getPurposeBackupModel(purpose)` (null when unset or unavailable), `getPurposeBackupModels()`, `savePurposeBackupModel(purpose, model | null)` and `resolveBackupModel(purpose, primaryModel)` (null also when the backup shares the primary's provider), plus a pure `backupConflict(primary, backup)` helper; verify with a unit test (`tests/modelSettings.test.ts`, pure parts only) that same-provider pairs conflict and cross-provider pairs do not.
- [ ] 1.2 In `src/api/admin.ts` add `adminSetPurposeBackupModel` (`PUT /api/admin/model/purpose/backup`, body `{purpose, model | null}`; 400 "Unknown model or call type." for unknown/unavailable; 400 "The backup of <stage> must be from a different provider than its model." on conflict) and extend `modelStateResponse()` with `backups`; mount the route in `src/api/router.ts`; verify with curl under an admin session that a Gemini backup on a Gemini stage is refused and a Claude one is saved and returned.
- [ ] 1.3 Make `adminSetPurposeModel` and `adminSetModel` refuse a primary that would share a provider with a stored backup of an affected stage (per-stage: that stage; global: every stage without an override), error naming the stage; verify with curl that changing a stage with a Claude backup to a Claude primary is refused and that clearing the backup first makes it pass.

## 2. Fallback in the call path

- [x] 2.1 In `src/gemini/generate.ts` export `isProviderFailure(err)`: true for `ApiError`, `OpenAiApiError`, `Anthropic.APIError`, `Anthropic.APIConnectionError`, network and timeout errors; false for `LlmBudgetExceededError` and anything else; and give `generateWithRetryDetailed` an optional `maxAttempts` argument (default `MAX_ATTEMPTS`) that caps the loop; verify with a unit test for the predicate and `npm run typecheck`.
- [x] 2.2 In `src/gemini/wireRequest.ts` add `fallbackStepOf(purpose, from, err, to)` building the `fallback_model` step (severity warn, detail as design.md decision 4, message capped at 500 chars); verify with a unit test that the detail names both models and providers and the reason for a timeout, a 503 and a 401.
- [x] 2.3 In `src/gemini/llmCall.ts` add `runWithBackup` and use it from `runLlmCall`: resolve the backup first; run the primary with `maxAttempts: 2` when a backup resolves (one attempt + one retry) and with the default otherwise; no fallback when `opts.model` is set, when no backup resolves, or when the error is not a provider failure; otherwise record the step (only when `traceStepsEnabled(log)`), `logger.warn('LLM call fell back to backup model', …)`, and re-run the same request with the backup model and the default attempt count; the returned `model`/`provider`/`attempts` describe the call that answered; verify `npm run typecheck` and `npm test` pass, and that a primary error row after a fallback shows `attempts: 2`.
- [x] 2.4 Add rows to `docs/pipeline.md` section G for `fallback_model` (`llmCall.ts · runWithBackup`, `wireRequest.ts · fallbackStepOf`, `generate.ts · isProviderFailure`, `modelSettings.ts · resolveBackupModel`); verify the table lists every new named function.

## 3. Stages page and API types

- [x] 3.1 In `src/gemini/llmStages.ts` add `backupModel` / `backupProvider` to `LlmStageDescription` and fill them in `describeLlmStages`; mirror the type in `web/src/api.ts`; verify `tests/llmStages.test.ts` still passes and `GET /api/admin/llm-stages` shows the fields.
- [x] 3.2 In `web/src/api.ts` add `backups` to `GeminiModelState` and `adminSetPurposeBackupModel`; verify `npm run typecheck`.

## 4. Admin UI

- [x] 4.1 Add `providerOfModel(id)` to `web/src/components/admin/shared.ts` (same prefix rule as the server) and the i18n strings (`llmBackupLabel` "מודל גיבוי", `llmBackupNone` "ללא", `llmModelDesc` updated to mention the backup and the other-provider rule); verify the strings render in the section.
- [ ] 4.2 In `AdminSettings.tsx` add the backup picker under each stage's primary picker, options = "none" + available models whose provider differs from the effective primary's; save through the new endpoint; show the server's error text on a refused save and keep the pickers on the saved state; verify in the browser: options change when the primary changes, a saved backup survives a reload, a refused save shows the message.
- [ ] 4.3 In `AdminLlmStages.tsx` show the backup model and provider (or "none") after the model line; verify in the browser on `#/llm-stages`.

## 5. End-to-end check and wrap-up

- [ ] 5.1 Local check: set a Gemini primary and a Claude (or OpenAI) backup on `file_classification`, make the primary fail (temporarily break the Gemini key in `.env`, restart the user's dev stack), send a test file through the local stack per the `verify` skill; verify the trace shows the failed Gemini call row, the `fallback_model` step with both models and the reason, and the backup call row; restore `.env`.
- [ ] 5.2 Run the evals harness on one small case with `--models <model>` and verify it still runs the pinned model only and records no fallback step.
- [ ] 5.3 `npm run typecheck`, `npm test`, commit per the git workflow, then `/opsx:archive llm-stage-backup-model` (accept "Sync now").
