## 1. Server

- [x] 1.1 In `src/api/workspace.ts`, in the `GET /clients` handler (both the `?deleted=1` branch and the live branch), when `isViewingAs(req)` is true, call `llmCalls.costByClient` with the listed ids and add `cost` (the sum, 0 when the client has no rows) to each serialized client; leave the rows unchanged otherwise. Verify with `npm run typecheck`.
- [x] 1.2 Add `tests/rosterCost.test.ts` covering the row-shaping helper: with view-as the rows carry `cost` (sum, or 0 for a client absent from the map); without view-as no row has a `cost` key. Run it with `node --import tsx --test tests/rosterCost.test.ts` and add it to the `test` script in `package.json`.

## 2. Web

- [x] 2.1 In `web/src/api.ts`, add `cost?: number` to `Client` with a comment that it is present only under an admin's view-as. Verify with `npm run typecheck`.
- [x] 2.2 In `web/src/components/Sidebar.tsx`, render `span.client-item-cost` (dir="ltr", title from a new `rosterCostTitle` key in `web/src/i18n.tsx`) inside the name line after the name and test badge when `client.cost !== undefined`, using `formatUsd` for a positive value and `$0` for zero. Verify in the browser under view-as that a client with calls shows its amount, a client with no calls shows `$0`, and the deleted list shows pills too.
- [x] 2.3 In `web/src/styles.css`, add `.client-item-cost` (muted mono, 999px radius, thin border, nowrap, no shrink) and give `.client-item-name` `display: flex; align-items: center; gap; min-width: 0` so a long name truncates before the pill. Verify a long client name keeps the pill whole and the hover slide of the contact line is unaffected.

## 3. Verification

- [x] 3.1 Run `npm run typecheck` and `npm test`; both pass.
- [ ] 3.2 Browser check: as the accountant (own session) no row shows a pill and the `GET /clients` reply has no `cost` key; as an admin viewing as, every row shows the pill and clicking the pill opens the client like clicking the name.
