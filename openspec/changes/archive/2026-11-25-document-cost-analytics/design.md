## Context

See proposal.md – Why. Everything the tab needs is already recorded:

- `llm_calls` rows carry `client_id`, `cost` (NULL = unpriced), `status`, and `document_file_id` (set on classification / extraction / verification / split calls, NULL on planner and conversation calls).
- `client_documents` rows carry the checklist status per item (`unresolved | not_required | pending | claimed | collected | approved | stated | retired`).
- `emails` rows carry the thread: `direction` + `status` (`sent` outbound, `received` inbound) and `created_at`.
- `clients` carry `goal_status`, `paused`, `deleted_at`, `is_test`, `created_at`, and `agent_fields.declined_at` for a declined client.

The Settings view already hosts two admin-only tabs (test, analytics) with the `client-tab-admin` marker, the `settings-page-dashboard` wide layout and the "fall back to general outside view-as" rule. The analytics tab (`MessageAnalyticsTab`) is the pattern to copy: one admin route per instance → pure summariser in `src/analytics/` (tested) → tiles in `stat-row` / `stat-tile`, tables in `admin-table`, `onOpenClient` to navigate.

## Goals / Non-Goals

**Goals:**
- One query per instance that returns one row per client with sums only; the browser never loads call, item or message rows.
- A pure summariser that owns every derived figure (quotients, medians, pooled averages, footer), so the tests pin the arithmetic and the `—` rule.
- Reuse the existing tab, tile, table, filter and cost-formatting pieces; no new chart.

**Non-Goals:**
- No date range: the figures are lifetime per client (a declaration spans weeks; cutting it by date would split cost from documents). A created-between filter can come later without changing the shape.
- No per-document-type breakdown (cost per pension report vs per bank statement). The data allows it (`type_key`), but it needs the file → item tie per call; out of scope here.
- No export (CSV). Easy to add later.
- No change to how costs or statuses are recorded.

## Decisions

1. **Settled-item groups come from the checklist status, not from files.** `approved` = document with a file; `not_required | stated | claimed` = resolved from the conversation; `unresolved | pending | collected` = still open; `retired` = excluded. Alternative: count approved `document_files` rows. Rejected: a split parent, a duplicate upload or a file tied to a retired item would inflate the count; the item is the unit the accountant gets value from. `claimed` is counted as resolved from the conversation because the agent settled the item with words and the accountant's follow-up is outside the agent; this is the one judgment call in the grouping and is stated in the spec.

2. **One SQL query, grouped per client, with three LEFT JOIN LATERAL sums** (`src/db/queries/documentCost.ts`, `listForInstance(agentInstanceId)`): calls (count, failed, `SUM(cost)`, `COUNT(*) FILTER (WHERE cost IS NULL)`, `SUM(cost) FILTER (WHERE document_file_id IS NOT NULL)`), items (`COUNT(*) FILTER (WHERE status = ...)` per group), messages (`COUNT(*) FILTER (WHERE direction='outbound' AND status='sent')`, `... inbound`, `MIN(created_at)`, `MAX(created_at)` over sent/received rows). Returns every client of the instance including soft-deleted and test ones; the client-kind filter is applied in SQL (`is_test`), the completed-only toggle in the summariser (cheap, and lets the tile show counts either way). Alternative: reuse `llmCalls.costByClient` + `clientDocuments.listForClient` per client. Rejected: N+1 and item rows in memory.

3. **Pure summariser `src/analytics/documentCost.ts`** takes the rows plus `{ completedOnly }` and returns `{ clients: ClientFigures[], tiles, footer }`. Quotients return `null` when the divisor is 0; the web prints `null` as `—`. Medians use the standard middle / mean-of-two-middles rule over defined values only. "Cost per completed declaration" = mean of `totalCost` over `goal_status === 'complete'` clients. Days active = calendar days between the client's first and last sent/received message (0 when one message, null when none), median over completed clients. File-reading share = `fileCost / totalCost` (null when total is 0). `unpriced` is carried as a count per client and summed, so the web adds the `+` when it is > 0. Tested in `tests/documentCost.test.ts` (grouping, both quotients, `—` on zero divisors, median, pooled footer, completed-only filter, `+` propagation).

4. **Route** `GET /api/admin/agents/:agentInstanceId/document-cost?clients=live|test|all&completed=1` in `src/api/documentCostAdmin.ts`, mounted behind `requireAdmin` next to the message-analytics route. 404 on an unknown instance, 400 on a bad filter. Returns the summariser's output plus the instance id. The state marker per client is derived server-side (`deleted` → `declined` → `completed` → `paused` → `running`, plus the `test` and `deleted` badges as separate booleans), so the web does not learn the agent_fields shape.

5. **Web**: `Settings.tsx` gains `Tab = ... | 'documents'`, an `adminDocumentsPanel` prop rendered under view-as only (same guard and fallback as `analytics`), the tab button after analytics with `client-tab-admin` + `admin-chip`, and the wide layout for `documents` as for `analytics`. `Workspace.tsx` passes `<DocumentCostTab agentInstanceId onOpenClient>` exactly as it passes `MessageAnalyticsTab`. `DocumentCostTab.tsx` holds the filters (`Seg` for client kind, a checkbox for completed-only, a `<select>` for sort), the tile row, the table with a `<tfoot>` footer, loading text, error banner and empty state. Filter and sort choices persist in `localStorage` under `fm.documentCost` through a tiny `documentCost.ts` helper (read with try/catch, defaults on failure), the same shape as `messageAnalytics.ts`. Sorting is done in the browser on the returned rows (undefined values last). Costs via `formatUsd`, `$0` for zero, `+` when `unpriced > 0`.

6. **Strings** live in `i18n.tsx` under `settingsTabDocuments: 'מסמכים'` and a `documentCost*` group (tile labels, column headers, state labels, filter labels, empty state, load error). Short Hebrew, no English in the tab.

## Risks / Trade-offs

- [Pooled average vs. median disagree on skewed data] → both are shown; the tile notes say "pooled" and "median per client".
- [A client that spent money and settled nothing drags the pooled average] → it is correct for pricing (that spend is real); the row shows `—` so the admin can see it, and the sort control puts such rows last.
- [`claimed` counted as resolved from the conversation may overstate value if the office never had the paper] → stated in the spec; the list shows the count separately from documents with a file, so the admin can read the two numbers apart.
- [Soft-deleted clients included by default] → marked with a badge; their spend is real spend.
- [Messages counted from `emails` rows regardless of channel] → the instance is WhatsApp-only today; email rows, if any, would still be agent/client messages.
- [Query cost on a large instance] → one grouped query with indexed `client_id` lookups; the same scale as the roster cost pill and the analytics tab.

## Migration Plan

No migration. Deploy the app; the tab appears for admins under view-as. Rollback = revert the commit.
