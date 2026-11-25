## 1. Query and summariser

- [x] 1.1 Add `src/db/queries/documentCost.ts` with `listForInstance(agentInstanceId, clientKind)`: one row per client (including soft-deleted and test ones, filtered by `is_test` for live/test) with call sums (calls, failed, cost, unpriced, file-tied cost), item counts by group (approved / not_required+stated+claimed / unresolved+pending+collected; retired excluded), message counts (sent outbound, received inbound) and first/last message time, plus `goal_status`, `paused`, `deleted_at`, `is_test`, `agent_fields->>'declined_at'`. Verify with `npm run typecheck` and a manual query against the local DB returning the expected counts for one known client.
- [x] 1.2 Add the pure `src/analytics/documentCost.ts` (`summarizeDocumentCost(rows, { completedOnly })` → per-client figures with both quotients and the state marker, tiles, footer) with `null` on zero divisors and medians over defined values only. Verify with `tests/documentCost.test.ts` added to the `npm test` list, covering the grouping, both quotients, `—` on zero divisors, the median, the pooled footer, the completed-only filter, cost per completed declaration, file-reading share, messages per settled item, median days active and the unpriced count propagation; `npm test` passes.

## 2. Admin route

- [x] 2.1 Add `src/api/documentCostAdmin.ts` (`adminGetDocumentCost`: 404 unknown instance, 400 bad `clients`/`completed`, returns the summariser output) and mount `GET /api/admin/agents/:agentInstanceId/document-cost` behind `requireAdmin` in `src/api/router.ts` next to the message-analytics route. Verify by calling the route from an admin session (`fetch` in the browser console while impersonating) and getting the JSON, and from the accountant's session getting a refusal.

## 3. Web

- [x] 3.1 Add the `DocumentCost` type and `api.adminGetDocumentCost(agentInstanceId, { clients, completed })` to `web/src/api.ts`; add Hebrew strings to `web/src/i18n.tsx` (`settingsTabDocuments: 'מסמכים'`, tile labels, column headers, state labels, filter and sort labels, empty state, load error). Verify with `npm run typecheck`.
- [x] 3.2 Add `web/src/components/documentCost.ts` (localStorage read/write of client kind, completed-only and sort under `fm.documentCost`, defaults on failure; the client-side sort with undefined values last) and `web/src/components/DocumentCostTab.tsx` (filters, tile row, client table with footer, loading / error / empty states, `+` on costs when unpriced > 0, name opens the client). Verify in the browser under view-as: tiles and table match the route's JSON for the local instance, the footer sums the columns, sorting and the filters behave as the spec's scenarios say and survive a reload.
- [x] 3.3 Wire the tab: `Settings.tsx` (`documents` tab after analytics, admin marker, wide layout, fallback to general outside view-as), `Workspace.tsx` (`adminDocumentsPanel` under view-as only), minimal CSS. Verify in the browser: the tab order is general, connections, staff, test, analytics, documents, dashboard under view-as; the accountant's own session shows no documents tab and a remembered `documents` choice opens general.

## 4. Docs and wrap-up

- [x] 4.1 Add the documents tab to the admin surfaces paragraph in `docs/agents.md` (route, query, summariser, test) and verify the paragraph names every new file.
- [ ] 4.2 Run `npm run typecheck` and `npm test`, then commit and push per the repo Git workflow; verify the push lands on `master`.
