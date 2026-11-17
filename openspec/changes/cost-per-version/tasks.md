## 1. Version stamp on every call

- [x] 1.1 Add migration `migrations/078_llm_calls_app_version.sql` (`ALTER TABLE llm_calls ADD COLUMN app_version TEXT`, index on `(app_version, created_at DESC)`, header comment naming this change); verify `npm run db:migrate` applies it and `\d llm_calls` shows the column
- [x] 1.2 Add `src/config/appVersion.ts` exporting `APP_VERSION` (first 7 chars of `GIT_SHA`, else `git rev-parse --short HEAD` in try/catch with a 2 s timeout, else `dev`) and `resolveAppVersion(env, exec)` for tests; verify `tests/appVersion.test.ts` covers the three branches
- [x] 1.3 Switch the `/healthz` handlers in `src/webhook/app.ts` and `src/worker.ts` to `APP_VERSION`; verify a local `curl localhost:$PORT/healthz` reports the working-tree short sha
- [x] 1.4 Add `appVersion` to `InsertLlmCall`, write it in `llmCalls.insert`, set it in `recordCall` (`src/gemini/generate.ts`), add `app_version` to `LlmCallRow` / `LlmCallListRow` and pass it as `appVersion` through the admin call endpoints in `src/api/llmAdmin.ts`; verify `npm run typecheck` passes and a new local call row shows the sha in `SELECT app_version FROM llm_calls ORDER BY created_at DESC LIMIT 1`
- [x] 1.5 Show the version in the call modal under the model line (web `api.ts` type + modal component, Hebrew label in `i18n.tsx`); verify the modal of a fresh call shows it and an old call shows nothing

## 2. Server figures

- [x] 2.1 Add `src/db/queries/versionCost.ts` with `listByVersion({ agentInstanceId?, clientKind })` grouping `llm_calls` by `(app_version, purpose)` with the clients join for `is_test`, returning calls, failed, cost sum, unpriced count, token sums, distinct cycles, distinct files, first/last call, plus `listInstancesWithCalls()`; verify the query runs against the local DB with each `clientKind`
- [x] 2.2 Add pure `src/analytics/versionCost.ts` (`summarizeVersions(groups)`: per-version totals, `costPerCycle`, `costPerDocument`, `plannerInputTokensAvg`, per-stage rows with cache share, `unpriced`, `fewCalls`, deltas against the next older version, `before` entry last) and `tests/versionCost.test.ts` covering every spec scenario (order, unpriced `+`, cost per cycle 0.15, cost per document 0.04, cache share 75%, ▼25% / ▲10% deltas, no delta on oldest / before / missing stage, few calls at 4); verify the test file is added to `package.json` `test` and `npm test` passes
- [x] 2.3 Add `src/api/versionCostAdmin.ts` (`GET /api/admin/version-cost?agentInstanceId=&clients=`, zod-validated, `requireAdmin`) and register it in `src/api/router.ts`; verify an admin `fetch('/api/admin/version-cost', {credentials:'include'})` returns `{ versions, instances }` and a non-admin session gets 403

## 3. Admin versions page

- [x] 3.1 Add `{ screen: 'versions' }` ↔ `#/versions` to `web/src/components/admin/route.ts` and the "גרסאות" tab after usage in `AdminDashboard.tsx` rendering `AdminVersions`; verify clicking the tab sets the hash and reloading `#/versions` opens the page
- [x] 3.2 Add `web/src/api.ts` `adminGetVersionCost(filters)` with the `VersionSummary` type and the Hebrew strings in `i18n.tsx`; verify `npm run typecheck` passes
- [x] 3.3 Add pure `web/src/components/admin/versionCost.ts` (`formatDelta`, `deltaTone`, `formatTokens`, `pageOf`) and `tests/versionCostFormat.test.ts`; verify the test is in `package.json` and passes
- [ ] 3.4 Build `web/src/components/admin/AdminVersions.tsx`: instance + clients filters remembered in `localStorage` (`fm.versions.filters`, try/catch), loading text, error banner, cards newest first with short sha, first/last call, days active, calls, failed, total cost with `+`, cost per cycle, cost per document, planner input tokens, delta pills, "few calls" note, "before versions" last card, paging of 30 with "show more"; verify in the browser with the local DB (at least two versions after a local commit) that the cards and deltas match a hand-computed SQL check
- [x] 3.5 Expand/collapse one card at a time (click or Enter) showing the stage rows with calls, failed, average cost, average input / output tokens, cache share and the stage deltas; verify a stage absent in the previous version shows no delta

## 4. Docs and wrap-up

- [x] 4.1 Add the "Cost per version" entry to `docs/agents.md` beside the analytics entries; verify it names migration 078, `APP_VERSION`, the route and the page
- [x] 4.2 Run `npm run typecheck` and `npm test`, commit per the git workflow, and note that production needs migration 078; verify the commit is pushed and sandbox `/healthz` reports the new sha after deploy
