## Why

Every LLM call is recorded with its cost and tokens, but no record says which version of the app made it, so after a deploy there is no way to tell whether a prompt, schema or model change made the agent cheaper or more expensive. The admin needs to compare versions by cost per unit of work (a planning cycle, a document, a call of each stage), not by total spend, because total spend also moves with how many clients were active.

## What Changes

- Every LLM call record carries the app version that made it: the deployed git commit in production and sandbox, the working-tree commit locally (`llm_calls.app_version`, migration 078). Calls recorded before the change carry no version.
- A new admin-only route serves, per version, the counts, tokens and costs of its calls, overall and broken down by stage (purpose), with the per-unit figures: cost per planning cycle, cost per document extracted, cost and input tokens per call of each stage, cache share, failed-call rate.
- The admin dashboard gets a new top-level page **versions** (`#/versions`, tab "גרסאות" after the usage tab) that lists versions newest first as cards: short commit, first and last call time, calls, total cost, cost per cycle, cost per document, with the change against the previous version shown beside each per-unit figure, a "few calls" note on weak versions, and calls recorded before this change grouped under one last "before versions" card. Opening a card shows the per-stage breakdown. Filters: agent instance (all / one) and client kind (all / live clients / test clients), remembered in the browser.
- The admin call modal shows the version of the call under its model.
- The accountant's own session, staff viewers and the monday embed see nothing new.

## Capabilities

### New Capabilities
- `cost-per-version`: how every LLM call records the app version that made it, and what the admin-only versions page shows so versions can be compared by cost per unit of work.

### Modified Capabilities
- (none — the existing cost tabs and usage page keep their requirements; the version is a new field on the call record, not a change to any figure they show)

## Impact

- Database: migration 078 adds `llm_calls.app_version text` with an index on `(app_version, created_at)`. Local DB and production need it.
- Backend: one `appVersion()` helper (reads `GIT_SHA`, falls back to `git rev-parse --short HEAD` once at startup, then `dev`); `recordCall` writes it on every row; new query module `src/db/queries/versionCost.ts`, pure `src/analytics/versionCost.ts`, admin route `GET /api/admin/version-cost` in a new `src/api/versionCostAdmin.ts`; `docs/agents.md` updated.
- Web: `admin/route.ts` gains the `versions` screen, `AdminDashboard.tsx` the tab, new `admin/AdminVersions.tsx` and pure `admin/versionCost.ts` (formatting + delta helpers, tested), new `api.ts` function, Hebrew strings in `i18n.tsx`.
- Deploy: the workflows already pass `GIT_SHA` at build time; nothing changes there. The evals harness writes calls to a file, never to the table, so it is unaffected.
