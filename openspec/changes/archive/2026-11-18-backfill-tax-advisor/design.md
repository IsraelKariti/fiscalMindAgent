## Context

See proposal.md — Why. Current state that shapes the approach:

- `resolveTaxAdvisor(instance, board, row, accessToken, log)` in `src/agents/declarationOfCapital/kickoff.ts` already does the whole per-row job: `undefined` when the board maps no column, `null` when the cell is empty, else the matched `StoredTaxAdvisor`. It never throws. The kickoff stores the result through `clients.setDeclarationEngagement(id, { taxAdvisor })`, where `null` deletes the key.
- A kicked-off client remembers its row in `agent_fields.monday_board_id` / `monday_item_id` (`clients.setMondayItem`, called by `rememberBoardRow` on every kickoff). Test clients never have these keys; deleted clients are not returned by `clients.listForInstance`.
- The board mapping lives in `parseSettings(instance.settings).boards` (`BoardSource`, with `taxAdvisorColumnId`); the accountant's monday token is `mondayOauthTokens.getByUserId(instance.user_id)`.
- Admin-only workspace actions already exist: `POST /clients/test` in `declarationOfCapital/router.ts` is gated by `isViewingAs(req)` and audits with `req.realUserId`; the web shows it on the Settings "בדיקה" tab, which `Settings.tsx` renders only when `impersonating` and the agent registry supplies `adminTestPanel`.
- `fetchUsers` (monday users lookup) is called once per `resolveTaxAdvisor`; many clients share one advisor.

## Goals / Non-Goals

**Goals:**
- One request, one press, whole agent; reuses the kickoff's resolution step so the stored shape cannot drift from what a kickoff would store.
- Invisible to the accountant: no new tab, no new route reachable from the accountant's session, nothing sent to the client or to monday.
- Honest result: per-client outcome counted and the changes audited.

**Non-Goals:**
- A scheduled or automatic re-sync (the daily import scan stays as it is).
- A per-client "re-read" button on the details tab.
- A production shell script (the button is the production route).
- Re-reading anything else from the row (year, file number, spouse, questionnaire).

## Decisions

1. **Where the button lives: the existing admin-only "בדיקה" tab.** The tab is already hidden from the accountant and from staff viewers, already marked admin-only, and already wired through `adminTestPanel` in `web/src/agents/declarationOfCapital.tsx`. A new group under the test-client form is the smallest change that satisfies "only I see it".
   - Alternative: the admin dashboard (`#/admin`) accountant page. Rejected: that page lists aggregates and the action is per agent instance; the workspace route already carries the instance and the view-as identity.
   - Alternative: a per-client control on the details tab. Rejected: the accountant sees that tab, and the point is one press for all clients.

2. **One route on the agent router: `POST /clients/tax-advisor-backfill`**, gated by `isViewingAs(req)` like `POST /clients/test` (403 for the accountant's own session, staff viewers never reach a mutating workspace route). The route runs the backfill to completion and answers with the counts; no job, no polling.
   - Alternative: a BullMQ job with progress. Rejected: rosters are tens of clients, one item fetch each; a synchronous request well under the web app's timeout is simpler and the admin sees the result in one place. If a roster ever grows past that, the route can later be moved behind a job without changing the spec.

3. **One named step per junction, in a new `src/agents/declarationOfCapital/taxAdvisorBackfill.ts`** (listed in `docs/pipeline.md` under section C). The pure steps (`rememberedRow`, `boardForRow`, `advisorChanged`, `memoisedUsersLookup`) live in a sibling `taxAdvisorBackfillRules.ts` with no database or Redis import, because `kickoff.ts` pulls in the Redis-backed event publisher and a unit test that loads it never exits:
   - `backfillTaxAdvisors(instance, adminUserId)`: refuses with no monday connection; lists live clients of the instance (`listForInstance`, test clients excluded); walks them sequentially.
   - `rememberedRow(client)`: the `monday_board_id` / `monday_item_id` pair or null (no row → skipped).
   - `boardForRow(instance, boardId)`: the configured `BoardSource` or null (not a source → skipped; no `taxAdvisorColumnId` → skipped).
   - `rereadAdvisor(instance, board, itemId, token)`: `fetchItemDetails` (null or throw → failed), then `resolveTaxAdvisor`.
   - `advisorChanged(previous, next)`: compares `monday_user_id` and `match` (name/email refresh alone does not count as a change, so unchanged clients are not re-audited).
   - `storeBackfilledAdvisor(client, previous, next, adminUserId)`: `setDeclarationEngagement({ taxAdvisor })` plus the audit event; counts updated vs cleared.
   - Result shape `{ updated, cleared, unchanged, skipped, failed }`.

4. **Users lookup cache per run.** `resolveTaxAdvisor` is reused unchanged, so each client costs one `fetchUsers` call. To avoid N identical monday calls for the same advisor, the backfill passes a run-scoped memo through a small optional `lookup` parameter added to `resolveTaxAdvisor` (default: the plain `fetchUsers`). The kickoff path keeps its behaviour.
   - Alternative: duplicate the resolution logic in the backfill with its own cache. Rejected: two copies of the matching rule would drift.

5. **Audit per changed client, actor = real admin, action `client.tax_advisor_backfilled`**, detail `{ previous: { name, match } | null, taxAdvisor: { name, match } | null }` using `taxAdvisorAuditDetail`. Unchanged and skipped clients write nothing. The run itself is not audited separately: the per-client events already say who did what and when.

6. **No per-client live update push.** The advisor chip on the details tab reads `agent_fields.tax_advisor` on load; the admin reopens the client to see it. `publishClientUpdated` is called per changed client only if it is already cheap to do so from the router; otherwise skipped (not in the spec).

## Risks / Trade-offs

- [monday rate limit on a large roster] → sequential fetches, one item per client, users lookup memoised per run; the run stops at the first auth error (token revoked) and reports what was done so far as failed counts plus a reason.
- [Token without `users:read`] → `resolveTaxAdvisor` already stores the display name as unmatched with a warning; the result counts such clients as updated. The admin should reconnect monday for the accountant first (noted in the panel's help text).
- [A client whose row moved to another board] → the remembered board id is stale, the row is fetched by item id anyway (monday item ids are global), but the mapping is taken from the remembered board; a board no longer configured counts as skipped. Acceptable: the next kickoff refreshes the remembered pair.
- [Long request on a very large roster] → see decision 2; the route logs progress every 25 clients so a timeout still leaves a trace.

## Migration Plan

No migration. Deploy, impersonate the accountant, open Settings → בדיקה, press the button once per agent. Rollback = remove the route and the panel group; stored advisors stay valid because the shape is the kickoff's.
