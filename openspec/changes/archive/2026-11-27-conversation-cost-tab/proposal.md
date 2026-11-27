## Why

An admin can see a client's lifetime LLM spend only as one number (the roster pill) or call by call (the trace cost pills). There is no place that answers "where did this client's money go": how much each stage (planner, extraction, classification, ...) cost, how many calls each stage made, which calls were the expensive ones, and how the spend grew over the conversation.

## What Changes

- A new admin-only client tab, **"עלות"** (cost), after the questionnaire tab, shown only while an admin views the workspace as an accountant (same marker and colour as the questionnaire tab). The accountant and staff viewers never see it.
- The tab shows, from every LLM call recorded for the client:
  - four tiles: total cost, number of calls (with how many failed), total tokens (input / output / cached context), cost per message the agent sent;
  - a **cost by call type** card: one row per `llm_calls.purpose` with calls, failed calls, cost, share of total and average cost per call, plus a donut of the cost share;
  - a **cost by model** card: one row per model with calls, cost and share;
  - a **cost over time** chart: spend per day across the client's life;
  - a **most expensive calls** list: the five costliest calls, each linking to its call modal (`#/llm-calls/<id>`);
  - a note when some calls carry no price (they count as zero) so the admin knows the total is a floor.
- A new admin-only server route that returns every LLM call of one client without payloads (the conversation endpoint already loads them, but together with messages and steps; the tab needs only the calls).
- Costs are the costs the calls recorded at call time; nothing is recomputed from today's prices.

## Capabilities

### New Capabilities
- `admin-cost-tab`: the admin-only cost tab of a client — who sees it, what it aggregates from the client's LLM calls, and how each widget reads.

### Modified Capabilities
- none: `conversation-trace` (per-call pills), `admin-roster-cost` (roster pill) and `admin-questionnaire-tab` (the admin-only tab mechanism) keep their requirements unchanged; this change reuses the tab mechanism and the recorded per-call cost.

## Impact

- Web: `web/src/agents/declarationOfCapital.tsx` (new `adminOnly` tab entry), a new `CostCard` component plus a pure `costSummary.ts` aggregator, `web/src/api.ts` (new admin call), i18n strings, a little CSS. Reuses `StatTiles`-style tiles, `DonutChart`, `LineChart`, `formatUsd`, `llmPurposeLabels`.
- Server: one route `GET /api/admin/clients/:clientId/llm-calls` behind `requireAdmin` in `src/api/llmAdmin.ts` + `src/api/router.ts`, reusing `llmCalls.list({ clientId })` and `toAdminCall`. No migration, no schema change.
- Tests: a node test for the aggregator (`tests/costSummary.test.ts`), added to `npm test`.
