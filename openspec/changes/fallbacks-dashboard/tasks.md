## 1. Record the fallback mark

- [x] 1.1 Add migration `migrations/081_llm_calls_fallback.sql`: three nullable columns `fallback_from_model`, `fallback_from_provider`, `fallback_reason` on `llm_calls`, the partial index, and the backfill from `audit_events` rows of action `fallback_model` (design decision 4). Verify with `npm run db:migrate` locally and a `SELECT COUNT(*) FROM llm_calls WHERE fallback_from_model IS NOT NULL` that matches the local trace steps.
- [x] 1.2 Extend `LlmCallLogContext` in `src/gemini/generate.ts` with `fallbackFrom` and write it in `recordCall`; extend `InsertLlmCall` and `insert` in `src/db/queries/llmCalls.ts` with the three columns. Verify with `npm run typecheck`.
- [x] 1.3 In `src/gemini/llmCall.ts` pass `{ ...log, fallbackFrom }` on the backup call of `runWithBackup` (reason from `failureReasonOf`, "status N" / timeout / network) and on the held route (reason `provider held`). Verify with a unit test in `tests/llmFallback.test.ts` that the backup log context carries the mark for both paths and the primary's does not (stub `generateWithRetryDetailed`).
- [x] 1.4 Select the three columns in `listCalls` / `getCall` of `src/db/queries/llmCalls.ts` and map them camelCase in the admin call routes; show "fallback for <model> (<reason>)" in the call modal of `web/src/components/admin/AdminLlmCalls.tsx` with a Hebrew string in `i18n.tsx`. Verify by opening a backfilled backup call in `#/llm-calls` locally.

## 2. Figures

- [x] 2.1 Add `src/db/queries/llmFallbacks.ts`: one grouped query over `llm_calls` since a date (or all) returning `(model, provider, purpose, fallback_from_model, fallback_from_provider, fallback_reason, status, count)`, plus `MIN(created_at)` of marked rows. Verify with `npm run typecheck` and a manual run against the local DB.
- [x] 2.2 Add the pure summariser `src/analytics/llmFallbacks.ts` implementing the counting rules of design decision 2 (cards per model, reasons, stages, as-backup block, totals, ordering). Verify with `tests/llmFallbacks.test.ts` covering failure fallback, held fallback, failure without backup, backup that failed too, backup-only model, pre-mark rows and the ordering.
- [x] 2.3 Add `src/api/llmFallbacksAdmin.ts` with `GET /api/admin/llm-fallbacks?days=` (zod: 7 | 30 | 90 | absent), register it in `src/api/router.ts` with `requireAdmin`. Verify with `curl` as admin (200 with `models`) and as a non-admin session (403).

## 3. Page

- [x] 3.1 Add the `fallbacks` screen to `web/src/components/admin/route.ts` (`#/fallbacks`), the tab after "versions" in `AdminDashboard.tsx`, the `api.adminGetLlmFallbacks(days)` client function and types in `web/src/api.ts`, and the Hebrew strings in `web/src/i18n.tsx` (tab "נפילות לגיבוי", period labels, figure labels, note, empty state, load error). Verify with `npm run typecheck` and the tab appearing in the admin dashboard.
- [x] 3.2 Build `web/src/components/admin/AdminFallbacks.tsx`: period buttons remembered in localStorage, totals line, "recorded since" note, cards per model (big share, figures row, by-reason list, by-stage list, as-backup block), loading / error / empty states; styles in `web/src/styles.css` reusing the versions-card look. Verify in the browser on the local DB: the backfilled rows produce a card for the model that fell back, switching the period reloads, "all" shows the note when older rows exist.
- [x] 3.3 Confirm access rules: as an accountant (impersonation off) the tab does not exist and `/api/admin/llm-fallbacks` answers 403. Verify in the browser and with `curl`.

## 4. Docs and finish

- [x] 4.1 Document the page and the mark in `docs/agents.md` (admin observability list, the `llm_calls` columns paragraph next to `app_version`) and note that production needs migration 081. Verify by reading the two sections.
- [ ] 4.2 Run `npm test` and `npm run typecheck`, commit per the Git workflow, and leave the change for `/opsx:archive fallbacks-dashboard`.
