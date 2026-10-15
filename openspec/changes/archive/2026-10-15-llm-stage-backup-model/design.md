## Context

Every stage calls `runLlmCall(spec)` (`src/gemini/llmCall.ts`), which resolves the model from the admin setting (`getGeminiModel(purpose)`: `app_settings` key `llm_model:<purpose>`, else the global `gemini_model`, else `env.GEMINI_MODEL`) and sends it through `generateWithRetryDetailed` (`src/gemini/generate.ts`): five attempts with backoff on 429/499/5xx/timeout/network, one `llm_calls` row per call (ok or error), the provider picked by the model id prefix. The admin section "מודל השפה" (`AdminSettings.tsx`) has one picker per purpose over `GET/PUT /api/admin/model(/purpose)`; `#/llm-stages` shows the resolved model (`describeLlmStages`). Provider adapters keep the request Gemini-shaped, so one `LlmRequest` can be re-sent to any provider by changing `model`. The evals harness calls `runLlmCall` with `opts.model` set. See proposal.md for the motivation.

## Goals / Non-Goals

**Goals:**
- One backup model per purpose, stored and validated server-side, provider-distinct from the effective primary.
- Fallback happens in one place, around the existing retry loop, with no change to the stage builders, gates, or adapters.
- Both calls and the switch are visible in the trace and the call browser.

**Non-Goals:**
- No per-accountant or per-client backups; no backup of the platform-wide model as such (backups are per stage; a stage that follows the global model still has its own backup).
- No "return to primary" logic: every call starts on the primary again.
- No second backup (a chain).

## Decisions

1. **Setting shape**: `app_settings` key `llm_backup_model:<purpose>` holding a model id; absent = none. Same storage and availability filter as the primary (`availableModelOptions()`), so an OpenAI backup disappears when `OPENAI_API_KEY` is removed. Alternative (one JSON value with primary+backup under one key) rejected: the primary key already exists and is read on every call.

2. **Validation at save time, defensive re-check at call time**. `PUT /api/admin/model/purpose/backup {purpose, model|null}` refuses a model whose provider equals the provider of the stage's *effective* primary (`purposes[purpose] ?? global`). `PUT /api/admin/model/purpose` and `PUT /api/admin/model` refuse a primary that would share a provider with a stored backup of any affected stage (for the global model: every stage without an override), with an error naming the first offending stage. At call time `resolveBackupModel(purpose, primary)` returns null when the stored backup is missing, unavailable, or shares the primary's provider (covers an env-default change or a row edited by hand). Alternative (silently clearing the backup on a colliding primary save) rejected: a setting that vanishes without a message is a surprise.

3. **Where the fallback lives**: `runLlmCall` calls a new named function `runWithBackup(spec, request, opts)` in `llmCall.ts`. It resolves the backup first; `generateWithRetryDetailed` gets a new optional `maxAttempts` argument (default `MAX_ATTEMPTS` = 5), and the primary runs with `maxAttempts: 2` when a backup resolves (one attempt, one retry) and with the default otherwise. On an error that `isProviderFailure(err)` accepts (new exported predicate in `generate.ts`: `ApiError` / `OpenAiApiError` / `Anthropic.APIError` / `Anthropic.APIConnectionError` / network / timeout, so the retry loop's own error classes plus non-retryable API statuses, but never `LlmBudgetExceededError`), and only when `opts.model` is unset and a backup resolves, record the fallback step, then run the same request again with `model: backup`. The second run goes through `generateWithRetryDetailed` with the default attempt count, so it gets the full five retries, its own call row, its own translate/restore steps, and the budget check (a failed primary call spent nothing, so the cap state is unchanged). The result's `model`/`provider`/`attempts` describe the backup call. The "model returned no text" check stays after the fallback: an empty answer is an answer. Alternative (switch model inside the retry loop on the last attempt) rejected: it would mix two models into one call row and one `attempts` count, and the adapter translation step is computed once per request.

4. **Trace step**: action `fallback_model`, actor `system`, severity `warn`, built by `fallbackStepOf(purpose, from, err, to)` (in `wireRequest.ts` next to the other per-call steps, guarded by `traceStepsEnabled(log)` so the harness never records it). Detail, flat so the step modal renders it as labelled rows (`reason` and `error` are taken by other steps, hence the prefixed names): `{ purpose, from_model, from_provider, to_model, to_provider, failure_reason: 'status <n>' | 'timeout' | 'network' | 'error', failure_error: message capped at 500 }`. The step renders through the generic step detail like `translate_request`; `docs/pipeline.md` section G lists it.

5. **API response**: `GET /api/admin/model` adds `backups: Record<LlmCallPurpose, string | null>` (as the admin sees it: unavailable or conflicting = null). `describeLlmStages` adds `backupModel: string | null` and `backupProvider: string | null`. Web: `GeminiModelState.backups`, `api.adminSetPurposeBackupModel(purpose, model | null)`.

6. **UI**: in the existing grid, each stage cell becomes primary picker + a smaller backup picker (label `מודל גיבוי`, first option `ללא`). Options are filtered in the browser with a small `providerOfModel(id)` helper in `admin/shared.ts` (same prefix rule as the server; the server stays the authority). The error banner shows the server's `error` text, not a generic message, so the "same provider" refusal is readable. The `web/src/api.ts` `request` helper already throws an error carrying the server message; reuse it.

## Risks / Trade-offs

- [Latency before the fallback: two primary attempts with 60 s timeouts and a ~2 s backoff can still take about two minutes before the backup is tried] → Accepted; this is far below today's five-attempt worst case, and the planner keepalive and the queue job timeout tolerate it.
- [A short blip on the primary (one failed retry) now moves the call to the other provider, so cost and answer style can differ for that one call] → Intended by the owner: speed of recovery matters more than staying on the primary; the call row names the model that answered.
- [A 400 from the primary caused by our own request (a schema the provider dislikes) now costs a second call on the backup that may also fail] → The backup is a different adapter, so it often succeeds; both rows stay in the log, so the root cause remains visible.
- [The planner on OpenAI fails mid-continuation after some tool calls were "recorded"] → Continuation state lives only inside the OpenAI adapter call; the backup run starts from the original request, so nothing leaks (spec scenario).
- [Admin sets a backup whose provider key exists locally but not in production] → Same as the primary today: `availableModelOptions()` filters per deployment and the call-time check ignores an unavailable backup.
- [Step ordering: the failed primary's error row is inserted fire-and-forget] → The step is recorded after `generateWithRetryDetailed` threw, so after the error row's insert was issued; same guarantee as `restore_answer` today.

## Migration Plan

No schema change (new `app_settings` keys only). Deploy as usual; backups default to none, so behavior is unchanged until an admin sets one. Rollback: deploy the previous image; the unknown keys are ignored.
