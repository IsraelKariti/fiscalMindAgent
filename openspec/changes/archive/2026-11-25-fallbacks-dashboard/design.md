## Context

See proposal.md — Why. Today a fallback leaves three traces: the primary's error row and the backup's row in `llm_calls` (written by `recordCall` in `src/gemini/generate.ts`, one row per `generateWithRetryDetailed` invocation, retries folded into `attempts`), a `fallback_model` audit step (client calls only, `fallbackStepOf` in `wireRequest.ts`), and a warning log line. Nothing links the backup row to the primary it replaced, so "share of calls of model X that fell back" cannot be computed from the log alone. The two fallback paths both live in `runLlmCall` / `runWithBackup` (`src/gemini/llmCall.ts`): the provider-failure path and the held-provider path (`routeUnderHold` → backup straight away).

Admin analytics pages follow one pattern: a grouped SQL query in `src/db/queries/*.ts` returning few rows, a pure summariser in `src/analytics/*.ts` with a unit test, a thin admin handler with a zod query schema, an `api.ts` function, a React page under `web/src/components/admin/` wired through `route.ts` and `AdminDashboard.tsx`, Hebrew strings in `i18n.tsx`.

## Goals / Non-Goals

**Goals:**
- The backup row knows which primary it replaced and why, from the moment the call is recorded.
- The page needs one query per load, grouped, never call rows.
- Past fallbacks of client calls become visible once (backfill), without a second source of truth at read time.

**Non-Goals:**
- No alerting or thresholds (the outage hold already alerts on provider failures).
- No per-client or per-instance filter on this page; the call browser has those.
- No daily time series; the period totals and per-model cards answer the question asked.

## Decisions

**1. Mark the backup row, not the primary row.**
`LlmCallLogContext` gains `fallbackFrom?: { model: string; provider: string; reason: string }`; `runWithBackup` passes `{ ...log, fallbackFrom }` on the backup call, and the held route passes it with reason `provider held`. `recordCall` writes it into three new nullable columns `fallback_from_model`, `fallback_from_provider`, `fallback_reason` (migration 081, index on `(fallback_from_model, created_at DESC) WHERE fallback_from_model IS NOT NULL`). The file sink (evals) carries the same fields, harmless.
*Why not mark the primary row?* The primary row is inserted inside `generateWithRetryDetailed`, before `runWithBackup` decides whether the error is a provider failure, and the held route has no primary row at all. Marking the backup row covers both paths with one write.
*Why a column and not the `request` JSONB?* The dashboard groups and counts on it; a typed, indexed column keeps the query plain SQL.

**2. Counting rules (the pure summariser, `src/analytics/llmFallbacks.ts`).**
Per model X over the period:
- `aimed` = rows with `model = X AND fallback_from_model IS NULL` + rows with `fallback_from_model = X AND fallback_reason = 'provider held'` (those have no primary row).
- `fellBack` = rows with `fallback_from_model = X`.
- `failedNoBackup` = rows with `model = X AND fallback_from_model IS NULL AND status = 'error'` − (`fellBack` − held ones).
- `backupAnswered` / `backupFailed` = status of the `fallback_from_model = X` rows.
- Share = `fellBack / aimed`, 0 when `aimed` is 0.
The query returns one group per `(model, provider, purpose, fallback_from_model, fallback_from_provider, fallback_reason, status)` with a count; the summariser folds the groups into cards. The summariser is pure and unit-tested with hand-built groups covering: failure fallback, held fallback, failure with no backup, backup that failed too, backup-only model, pre-mark rows.

**3. One route, period in days.**
`GET /api/admin/llm-fallbacks?days=7|30|90` (absent = all) → `{ since, firstMarkedAt, totals, models }`. `firstMarkedAt` is `MIN(created_at)` of marked rows, for the "recorded since" note (shown when `since` is null or earlier than `firstMarkedAt`). The handler lives in a new `src/api/llmFallbacksAdmin.ts`, registered in `router.ts` next to `version-cost` with `requireAdmin`.

**4. Backfill from the trace steps, once, in the migration.**
For every `audit_events` row with `action = 'fallback_model'`, mark the first `llm_calls` row with the same `client_id`, `purpose = detail->>'purpose'`, `model = detail->>'to_model'`, `created_at` within 15 minutes after `occurred_at`, and no mark yet: `fallback_from_model = detail->>'from_model'`, `fallback_from_provider = detail->>'from_provider'`, `fallback_reason = detail->>'failure_reason'`. Done with one `UPDATE ... FROM (SELECT DISTINCT ON ...)` so each step marks one row. Client-less fallbacks before 081 stay unmarked (they wrote no step); the page's note covers that honestly.
*Why not compute from steps at read time?* Two sources, a join across tables on time windows per load, and the held path for client-less calls would still be missing.

**5. Page layout.**
`AdminFallbacks.tsx`: period buttons (localStorage key `admin.fallbacks.days`), a totals line, the "recorded since" note, then cards in a responsive grid reusing the `versions-card` look: header = model name + provider badge; big percentage; a small figures row (aimed / fell back / failed without backup / backup answered / backup failed); two short lists (by reason, by stage, stage labels via `humanizePurpose`); an "as backup" block when the model took fallback calls. Hebrew strings in `i18n.tsx` (tab: "נפילות לגיבוי"). Call modal in `AdminLlmCalls.tsx`: one more line next to the model when `fallbackFromModel` is set; `listCalls`/`getCall` select the three columns and the API maps them camelCase.

## Risks / Trade-offs

- [Backfill matches the wrong backup row when two fallbacks of the same client, purpose and model happen within 15 minutes] → `DISTINCT ON (audit id)` ordered by `created_at` and the "no mark yet" guard make each step claim the earliest unmarked row; a miss only shifts one row between two steps of the same model, the per-model totals stay right.
- [Pre-081 failures of stages without a client look like "failed without backup"] → the note under the totals names the first marked date; the user knows the figures are exact from that date.
- [Evals file sink rows gain three fields] → `evals/` readers ignore unknown fields; verified by running `npm test`.
- [`llm_calls` grows an index] → partial index, marked rows are a small fraction.

## Migration Plan

1. Deploy 081 with the code (production runs migrations in its deploy flow; locally `npm run db:migrate`). The backfill runs inside the migration; it is idempotent (guarded by `fallback_from_model IS NULL`).
2. No rollback needed for data: the columns are nullable and unused by older code. Rolling back the code leaves the columns in place.
