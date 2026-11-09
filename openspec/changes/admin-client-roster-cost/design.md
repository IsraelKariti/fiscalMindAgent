## Context

See proposal.md - Why. The sidebar (`web/src/components/Sidebar.tsx`) renders `Client` rows from `wsApi.listClients` / `listDeletedClients`, both served by the `GET /clients` handler in `src/api/workspace.ts`, which maps rows through `toWorkspaceClient`. The handler already branches on `isViewingAs(req)` (the admin-only deleted list and the admin test clients), so the admin's view-as session is already distinguishable there. The per-client lifetime spend already exists as `llmCalls.costByClient(ids)` (SUM of `llm_calls.cost`, unpriced rows count as 0), used by the admin agents table. `formatUsd` in `web/src/format.ts` is the shared cost formatter, and `.timeline-trace-cost` in `web/src/styles.css` is the muted mono pill used for per-call costs in the trace. `Workspace.tsx` only ever replaces the whole client list (never patches one client), so an extra field on the list rows is never lost to a by-id refresh.

## Goals / Non-Goals

**Goals:**
- One server branch, one query already in use, one optional field; no new endpoint.
- The accountant-facing payload is byte-for-byte unchanged when not viewing as.
- The pill reuses the existing cost formatter and pill look so every cost in the admin UI reads the same.

**Non-Goals:**
- Live updates of the amount as calls happen (the list refreshes on roster ticks and loads; a per-call push is not worth a new SSE channel).
- A "+" marker for unpriced calls (the agents table shows it; here a pill must stay tiny). Unpriced calls count as zero, as `costByClient` already does.
- Sorting or filtering the roster by cost.
- Showing cost to accountants, staff or in the monday embed.

## Decisions

1. **Attach the cost in the `GET /clients` handler, gated on `isViewingAs(req)`.** After `toWorkspaceClient`, when viewing as, call `costByClient` with the listed ids and spread `cost` onto each row; otherwise leave the rows untouched. Alternative: a separate admin endpoint the sidebar calls in parallel — rejected; it doubles the loads and the sidebar would have to join two lists. Alternative: always include `cost` and hide it in the UI — rejected; the spec forbids the field reaching non-admin sessions, and the serializer pattern in this codebase strips admin-only data server-side.

2. **`cost?: number` on the web `Client` type; presence is the admin signal.** The sidebar renders the pill when `client.cost !== undefined`, so it needs no new prop or viewer check and cannot show a pill the server did not send. Alternative: gate on `impersonatingEmail` in the sidebar — rejected as redundant with the server gate and wrong for the monday embed.

3. **Pill sits inside the name line, after the name (and after the test badge when present).** The name line is the only part of the row that the hover slide does not move, so the amount stays readable while the contact line scrolls. `white-space: nowrap; flex-shrink: 0` keeps the amount whole; the name gets `min-width: 0` so a long name yields, not the pill. Alternative: a third line under the contact line — rejected, it makes every row taller for one admin-only datum.

4. **Formatting: `formatUsd(cost)` for a positive sum, the literal `$0` for zero.** `formatUsd(0)` yields `$0.0000`, which reads as noise in a roster; a small helper in the sidebar (`formatRosterCost`) handles the zero case rather than changing the shared formatter's behaviour for the call browser.

5. **Style: a new `.client-item-cost` rule copying the `.timeline-trace-cost` look** (muted mono, 999px radius, thin border, `dir="ltr"`). Alternative: reuse the `.timeline-trace-cost` class name directly — rejected; the trace class carries margins meant for a chip row.

6. **Hover text from a new i18n key** (`rosterCostTitle`), Hebrew, naming it as the client's total LLM cost, admin-only.

## Risks / Trade-offs

- [One extra aggregate query per list load under view-as] → a GROUP BY over `llm_calls.client_id` with `= ANY($1)`; already run by the agents table for the same ids. Not run for accountants.
- [Admin leak through a future refactor that drops the `isViewingAs` branch] → the server-side test asserts the accountant's rows carry no `cost` key.
- [Long Hebrew name plus pill overflows the row] → name `min-width: 0` with ellipsis; the pill never shrinks.
- [Amount stale after a burst of calls] → accepted; the roster refetches on every roster tick and on reload, and the trace shows per-call costs live.

## Migration Plan

No migration, no env change. Deploy with the usual push; the field is additive and optional, so an older browser bundle against the new server, or the reverse, shows the roster as today.
