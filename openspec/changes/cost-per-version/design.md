## Context

- `llm_calls` (migration 049, plus `document_file_id` 059 and `plan_run_id` 076) already holds, per call: purpose, provider, model, status, tokens (input / output / thinking / cached), per-token prices and `cost` as priced at call time. Rows are written fire-and-forget by `recordCall` in `src/gemini/generate.ts` through `llmCalls.insert` (`src/db/queries/llmCalls.ts`). The evals harness uses the `{ file }` sink and never touches the table.
- The deploy workflows build the image with `--build-arg GIT_SHA=<full sha>`; the Dockerfile exports it as `ENV GIT_SHA` and `/healthz` of web and worker report it. Locally `GIT_SHA` is unset and the process runs from the git working tree (`npm run dev` → tsx).
- Units of work already have ids: a planning cycle is `plan_run_id` (every planner-purpose call of one cycle carries it); a document extraction reads one file, `document_file_id`. Test clients are `clients.is_test` (migration 067).
- Admin dashboard pages live in `web/src/components/admin/*.tsx`, routed by `admin/route.ts` (`AdminRoute` union + `routeHash` + `parseHash`) and rendered by `AdminDashboard.tsx`; `AdminUsage.tsx` is the pattern for a figures page with filters. Admin routes are registered in `src/api/router.ts` with `wrap(requireAdmin)`; `src/api/messageAnalyticsAdmin.ts` → `db/queries/draftOutcomes.ts` → pure `src/analytics/discardedMessages.ts` is the pattern for "one SQL load, one pure tested module, one JSON reply". Stage labels come from `t.llmPurposeLabels[purpose] ?? humanizePurpose(purpose)` (`CostCard.tsx`); costs from `formatUsd`.

## Goals / Non-Goals

**Goals:**
- Stamp the version at the source (every call row), so any later analysis can split by version without guessing from deploy times.
- Keep the comparison honest: per-unit figures, "few calls" warning, old calls isolated.
- One pure, tested module computes every figure; the page only renders.

**Non-Goals:**
- Recording the version on anything but LLM calls (audit events, drafts).
- Statistical significance, confidence intervals, or A/B arms (the experiment framework was removed in 052).
- Any figure for the accountant.
- A commit message or deploy time per version: the admin matches the short sha to `git log` by hand. (A later change may add an `app_versions` table fed by the deploy workflow.)

## Decisions

### 1. One column, `llm_calls.app_version text` (migration 078)
Nullable; index `llm_calls (app_version, created_at DESC)`. No backfill: a pre-change row stays NULL and the page shows it under "before versions". Alternative rejected: deriving the version from deploy timestamps in the workflow logs — brittle, and useless for local runs, which is where most optimisation work is first measured.

### 2. `appVersion()` in `src/config/appVersion.ts`
Resolved once at module load: `process.env.GIT_SHA` (first 7 chars) when set; else `execFileSync('git', ['rev-parse', '--short', 'HEAD'])` in a try/catch (cwd = process cwd, 2 s timeout); else `'dev'`. Exported as a constant string `APP_VERSION` plus the function for tests. `/healthz` of web and worker switch to the same constant (same value as today in the containers, a real sha locally instead of `dev`). Alternative rejected: reading `.git/HEAD` by hand — the ref indirection and packed refs make it longer than the one git call.

### 3. `recordCall` writes it
`InsertLlmCall` gains `appVersion: string | null`; `recordCall` sets `APP_VERSION`; `llmCalls.insert` adds the column. `LlmCallRow` / `LlmCallListRow` gain `app_version`, and the admin call endpoints (`llmAdmin.ts`: list, by id, conversation) pass it through as `appVersion`; the call modal shows it as one more line under the model (small, no new strings beyond a label). Nothing changes in `LlmCallLogContext` — the version is process-wide, not per call site.

### 4. One SQL load, grouped in SQL, finished in a pure module
`src/db/queries/versionCost.ts` → `listByVersion(filters: { agentInstanceId?: string; clientKind: 'all' | 'live' | 'test' })` runs one query that groups `llm_calls` (left join `clients` for `is_test`; `clientKind = 'live'` → `c.is_test = false`, `'test'` → `c.is_test = true`, `'all'` → no client condition) by `(app_version, purpose)` and returns per group: calls, failed, cost sum, unpriced count, input / output / thinking / cached token sums, distinct `plan_run_id` count, distinct `document_file_id` count, first and last `created_at`. Rows are small (versions × purposes), so the page never loads call rows.
`src/analytics/versionCost.ts` exports `summarizeVersions(groups)`: folds the groups into versions (NULL version → the `before` entry, last), computes per-version totals, `costPerCycle` (sum of cost over groups with purpose `planner` ÷ distinct cycles; `null` when 0 cycles), `costPerDocument` (purpose `extract_document` cost ÷ distinct files; `null` when 0), `plannerInputTokensAvg`, per-stage rows (calls, failed, avgCost, avgInputTokens, avgOutputTokens = (output+thinking)/calls, cacheShare = cached/input or null), `unpriced` flag, `fewCalls` (< 10), and `delta` against the next older version for each compared figure (`(cur − prev) / prev`, null when either is null or prev is 0). Ordered by first call desc. Tested in `tests/versionCost.test.ts` with hand-built groups for every spec scenario.
Note on distinct cycles per purpose: the SQL counts distinct `plan_run_id` per `(version, purpose)` group; the pure module takes the planner group's count as the version's cycle count (only planner-purpose calls carry a run id today, so no double counting; if a second purpose ever carries it, the SQL moves the distinct count to the version level).

### 5. Route and page
- `GET /api/admin/version-cost?agentInstanceId=&clients=all|live|test` (`requireAdmin`, `src/api/versionCostAdmin.ts`) returns `{ versions: VersionSummary[], instances: { id, name, accountantEmail }[] }`; the instance list comes from the same query's distinct instances so the filter only offers instances with calls.
- `admin/route.ts`: `{ screen: 'versions' }` ↔ `#/versions`; `AdminDashboard.tsx` adds the tab after usage and renders `AdminVersions`.
- `web/src/components/admin/AdminVersions.tsx`: filters (two `<select>`s, stored in `localStorage` under `fm.versions.filters`, try/catch), list of cards (`.card` grid as the dashboard uses), paging of 30 with "show more", one expanded card at a time, delta pill component. Pure helpers in `web/src/components/admin/versionCost.ts` (`formatDelta`, `deltaTone`, `formatTokens`, paging) tested in `tests/versionCostFormat.test.ts`.
- Strings: `adminVersionsTab: 'גרסאות'` and one key per label in `i18n.tsx`.

### 6. Docs
`docs/agents.md` gets a "Cost per version" entry beside the analytics entries; `.env.example` is unchanged (`GIT_SHA` is a build arg, not a setting).

## Risks / Trade-offs

- [A cycle that spans a deploy counts in both versions] → each side counts only its own calls; the "few calls" note and the days-active figure make a one-cycle version easy to spot.
- [Different clients and different document mixes between versions] → the per-unit figures reduce but do not remove this; the clients filter (test clients only) lets the admin compare runs of the same test scenario across versions, which is the intended use after an update.
- [`git rev-parse` at startup fails or is slow] → try/catch with a 2 s timeout, fallback `dev`; one call per process, never per request.
- [Index on a new column over a large table] → `llm_calls` holds tens of thousands of rows; the index builds in seconds inside the migration.
- [Short sha collisions] → 7 hex chars over a few hundred commits; acceptable, same as `git log --oneline`.

## Migration Plan

1. Merge; sandbox deploys on push and runs 078 itself.
2. Production: `deploy.yml` runs migrations during its flow; after the first deploy every new call carries the version. Rollback = revert the commit; the column stays and is ignored.
3. Local: `npm run db:migrate` (or the next `npm run dev`).
