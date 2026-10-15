## Why

Every LLM stage of the pipeline runs on one admin-chosen model. When that model's provider is down, overloaded, or times out, the retry loop gives up after five tries and the whole step fails: the planner cycle, the file check, or the injection screen stops, and the client waits. A backup model on a different provider lets the stage finish anyway, because two providers are rarely down at the same time.

## What Changes

- Each LLM stage (the six call types shown in the admin "מודל השפה" section) gets an optional **backup model**. The backup MUST be served by a different provider (Gemini / OpenAI / Anthropic) than the stage's primary model.
- When the primary model does not answer, the stage switches early: a stage with a backup gives the primary one attempt and one retry (not the usual five attempts) on rate limits, server errors, timeouts, or network failures, and switches at once when the provider rejects the call outright. The same request then runs on the backup model, with the normal retry loop, and its answer is used. A stage without a backup keeps the five attempts as today. A call the evals harness pins to a specific model never falls back.
- The admin settings section grows a second picker per stage, "backup model", listing only models of the other providers plus "none". The server refuses a backup from the primary's provider and refuses a primary change that would put both on the same provider; a backup whose provider becomes unavailable (its API key removed) is ignored.
- The admin `#/llm-stages` page shows the backup model next to the resolved model.
- The client's trace records a code step when a fallback happens (which model failed, why, which backup took over); the failed primary call and the backup call both stay visible as separate LLM call rows.

## Capabilities

### New Capabilities
- `llm-model-settings`: which model each LLM stage runs on (primary and backup), how an admin sets them, and when the pipeline falls back to the backup.

### Modified Capabilities
- (none — the trace step follows the existing `conversation-trace` rules for code steps; no requirement there changes)

## Impact

- `src/gemini/modelSettings.ts` (backup setting per purpose, provider validation), `src/gemini/llmCall.ts` (fallback around the retry loop), `src/gemini/generate.ts` (classify the failure so the caller knows the primary "did not answer" vs. a budget stop), `src/gemini/llmStages.ts` (backup in the stage description).
- `src/api/admin.ts` + `src/api/router.ts`: `GET /api/admin/model` returns backups; new `PUT /api/admin/model/purpose/backup`; primary saves validate against the backup.
- `web/src/components/admin/AdminSettings.tsx`, `web/src/components/admin/AdminLlmStages.tsx`, `web/src/api.ts`, `web/src/i18n.tsx`.
- `docs/pipeline.md` section G (new step + function), `openspec/specs/llm-model-settings/spec.md` on archive. New `app_settings` keys only; no migration.
