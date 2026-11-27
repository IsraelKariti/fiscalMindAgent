## 1. Server route

- [x] 1.1 Add `adminGetClientLlmCalls` to `src/api/llmAdmin.ts`: validate the uuid, load the client with `clients.getAnyById` (404 when missing), answer `{ calls }` from `llmCalls.list({ clientId })` mapped through `toAdminCall`; register `GET /admin/clients/:clientId/llm-calls` in `src/api/router.ts` behind `requireAdmin`. Verify: `npm run typecheck` passes and, while impersonating, a new tab on `/api/admin/clients/<id>/llm-calls` returns every call of the client; the accountant's own session gets a refusal.

## 2. Aggregator

- [x] 2.1 Create `web/src/components/costSummary.ts` exporting `summarizeCost(calls, sentMessages)` with totals (cost, calls, failed, unpriced, input/output/thinking/cached tokens, costPerMessage or null), `byPurpose` and `byModel` (cost desc, with calls, failed, cost, share, avg), `byDay` (every local day from first to last call, zero-filled, cost + calls) and `top` (5 costliest priced calls, cost desc). Verify: `npm run typecheck` passes.
- [x] 2.2 Add `tests/costSummary.test.ts` (node --test, imports from `../web/src/components/costSummary.js`) covering: unpriced counts as zero and is counted; failed call keeps its cost; discarded flag ignored; shares and averages per type; zero-filled day gap; top list capped at 5 and sorted; empty input gives zero totals and null cost per message. Add it to the `test` script in `package.json`. Verify: `npm test` passes.

## 3. Web API and strings

- [x] 3.1 Add `adminGetClientLlmCalls(clientId)` to `web/src/api.ts` returning `{ calls: LlmCallSummary[] }`. Verify: `npm run typecheck` passes.
- [x] 3.2 Add Hebrew strings to `web/src/i18n.tsx` next to the questionnaire block: `tabCost` ("עלות"), tile labels and contexts (total cost, LLM calls, n failed / all succeeded, tokens, input/output/cached context, cost per sent message, no messages sent yet), card titles (cost by call type, cost by model, cost over time, most expensive calls), table columns (type, model, calls, failed, cost, share, per call, date), empty state (no LLM calls yet), unpriced note with count, failed marker, "open call" link text. Verify: `npm run typecheck` passes (every key used by the card exists).

## 4. Cost tab

- [x] 4.1 Create `web/src/components/CostCard.tsx`: loads the calls on mount (spinner, error banner on failure), computes `summarizeCost` with sent messages from `emails` (outbound, not draft), and renders the four tiles (`.stat-row`/`.stat-tile`, `formatUsd`, `formatCompact`, `+` suffix and unpriced context when unpriced > 0, `—` cost per message when none sent), then the empty state when there are no calls. Verify: open the tab under view-as for a client with calls and for a fresh client; tiles match the spec scenarios.
- [x] 4.2 Add the breakdown cards to `CostCard.tsx`: "cost by call type" table (purpose label via `t.llmPurposeLabels`/`humanizePurpose`, calls, failed, cost, share %, per call) with a `DonutChart` of cost share and the total in its centre; "cost by model" table (`MODEL_LABELS`, calls, cost, share); "cost over time" `LineChart` with `formatUsd`; "most expensive calls" list with type, model, date/time, cost, failed marker and an `#/llm-calls/<id>` link. Numbers `dir="ltr"`. Add the little CSS needed (two-column card for table + donut) to `web/src/styles.css`. Verify: cards render for a client with mixed types and models; clicking a top-call link opens the call modal.
- [x] 4.3 Register the tab in `web/src/agents/declarationOfCapital.tsx` after the questionnaire entry: `{ id: 'cost', labelKey: 'tabCost', adminOnly: true, render: (ctx) => <CostCard clientId={ctx.client.id} emails={ctx.emails} /> }`. Verify: under view-as the tab list ends with questionnaire, cost (admin marker on both); in the accountant's session no cost tab appears and a remembered "cost" tab falls back to Conversation.

## 5. Verification and docs

- [ ] 5.1 Run `npm run typecheck` and `npm test`; browser check under view-as on a live client, a deleted client and the admin test client (tab present, figures load, no errors in the console). Verify: all three pass and the figures agree with the roster pill total.
- [x] 5.2 Mention the cost tab in `docs/agents.md` where the admin-only tabs (questionnaire) are described. Verify: the doc names the tab and the route.
