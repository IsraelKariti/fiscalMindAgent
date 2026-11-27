## Context

- Admin-only client tabs already exist: `ClientTab.adminOnly` in `web/src/agents/types.ts`, filtered in `ClientView.tsx` by `ctx.admin` (openspec `admin-questionnaire-tab`). The questionnaire tab is the model to copy.
- Every LLM call is a row of `llm_calls` with `purpose`, `model`, `status`, `duration_ms`, token counts and `cost` (NULL when unpriced; see migration 049). `llmCalls.list({ clientId })` with no limit returns the whole trail, newest first, without payloads; `toAdminCall` in `src/api/llmAdmin.ts` turns a row into the web's `LlmCallSummary`.
- The trace (`Timeline.tsx`) loads calls through `GET /admin/clients/:clientId/conversation`, which also loads every message and audit step of the client — far more than the tab needs.
- Reusable UI: tile markup from `StatTiles.tsx` (`.stat-row` / `.stat-tile`), `DonutChart`, `LineChart`, `ChartCard`, `formatUsd`, `formatCompact`, `t.llmPurposeLabels` + `humanizePurpose`, `MODEL_LABELS` (admin `shared.ts`), `.admin-table` styles, `usageUnpricedNote` wording.
- Call links `#/llm-calls/<id>` open the call modal while impersonating (openspec `conversation-trace`).

## Goals / Non-Goals

**Goals:**
- One light admin route; all aggregation in one pure, unit-tested web function.
- No new table, migration or stored aggregate: the numbers are derived at read time from the existing rows.

**Non-Goals:**
- Changing what the trace or the roster pill show.
- Platform- or instance-wide cost views (the `#/usage` page covers those).
- Recomputing costs with current prices, or pricing unpriced historic calls.

## Decisions

1. **New route `GET /api/admin/clients/:clientId/llm-calls` → `{ calls: LlmCallSummary[] }`.**
   Handler in `src/api/llmAdmin.ts`, registered in `src/api/router.ts` behind `requireAdmin`, like the conversation endpoint. It resolves the client with `clients.getAnyById` (deleted and test clients readable) and answers `llmCalls.list({ clientId })` mapped through `toAdminCall`.
   *Alternative rejected:* reuse the conversation endpoint — it loads messages and audit steps the tab never reads; on a long thread that is most of the payload. *Alternative rejected:* aggregate in SQL — the trail of one client is at most a few hundred rows, the browser sums them instantly, and a pure function is easier to test than a query.

2. **Aggregation in a pure function `summarizeCost(calls, sentMessages)` in `web/src/components/costSummary.ts`.**
   Input: `LlmCallSummary[]` and the number of delivered outbound messages. Output: totals (cost, calls, failed, unpriced, input/output/thinking/cached tokens, costPerMessage or null), `byPurpose[]` and `byModel[]` (sorted by cost desc, each with calls, failed, cost, share, avg), `byDay[]` (every local day from first to last call, cost + calls), `top[]` (5 costliest priced calls). Tested in `tests/costSummary.test.ts` with `node --test`, like `questionnairePairs.test.ts`.

3. **Tab wiring.** `declarationOfCapital.tsx` adds `{ id: 'cost', labelKey: 'tabCost', adminOnly: true, render: ctx => <CostCard clientId={ctx.client.id} emails={ctx.emails} /> }` after the questionnaire entry. The fallback for a remembered admin-only tab already exists in `ClientView.tsx` and needs no change.

4. **`CostCard.tsx` loads on mount** (`api.adminGetClientLlmCalls(clientId)`), shows a spinner then the widgets; sent messages = `emails.filter(e => e.direction === 'outbound' && e.status !== 'draft').length` from the context the view already holds. It does not subscribe to the client's event stream; reopening the tab reloads.

5. **Widgets map to existing pieces.** Tiles reuse the `.stat-row`/`.stat-tile` classes; by-type and by-model are `.admin-table` tables (by-type with a `DonutChart` beside it, donut colours from `SERIES`); cost over time is a `LineChart` with one series and `formatUsd`; top calls is a small list whose link is `#/llm-calls/<id>`. The unpriced note reuses the `+` suffix convention and wording of the usage page. All numbers render `dir="ltr"`.

6. **Labels.** Purpose labels: `t.llmPurposeLabels[purpose] ?? humanizePurpose(purpose)`; model labels: `MODEL_LABELS[model] ?? model`. New Hebrew strings go in `i18n.tsx` next to the questionnaire block.

## Risks / Trade-offs

- [A very long trail makes the route answer slowly] → the same list is already loaded by the conversation tab today; the new route is strictly lighter. No pagination needed at current volumes.
- [Day buckets use the browser's local day while logs are UTC] → documented in the spec; the chart is for shape, not accounting.
- [A client with calls but zero priced cost shows `$0+` and 0% shares everywhere] → the unpriced note explains it; shares divide by total only when total > 0.

## Migration Plan

No migration. Deploy web + server together (one commit). Rollback = revert the commit; nothing is stored.
