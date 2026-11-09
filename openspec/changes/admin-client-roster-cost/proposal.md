## Why

An admin viewing an accountant's workspace cannot tell which clients are expensive without leaving the workspace for the admin agents table, which lists costs per client but far from the conversation. Putting each client's total LLM spend beside the name in the sidebar roster shows, at a glance and while reading conversations, where the money goes.

## What Changes

- In the sidebar client list, while an admin views the workspace as the accountant (view-as), every client row shows a small pill beside the client's name with the client's accumulated LLM cost in USD: the sum of the recorded cost of every LLM call made for that client, over its whole life. The deleted-clients list shows the same pill.
- The cost is formatted as the rest of the admin UI formats a cost (`$0.0042`, `<$0.0001`, `$1.25`); a client with no spend reads `$0`. Hover text names the pill as the total LLM cost, admin-only.
- The workspace client-list reply carries the cost only for an admin's view-as session. An accountant's session, a staff member's session and the monday embed never receive the field and never show the pill.
- The pill is a label only: it is not clickable and does not change the row's click.

## Capabilities

### New Capabilities

- `admin-roster-cost`: the per-client accumulated LLM cost shown in the sidebar roster for an admin viewing as the accountant, and its absence for every other viewer.

### Modified Capabilities

(none — `client-search` keeps its row layout requirements; this adds a new admin-only element without changing them.)

## Impact

- `src/api/workspace.ts`: the `GET /clients` handler (live and `?deleted=1`) adds a per-client `cost` to each row when `isViewingAs(req)`, using the existing per-client spend query (`llmCalls.costByClient`).
- `web/src/api.ts`: `Client` gains an optional `cost` field.
- `web/src/components/Sidebar.tsx`: renders the pill beside the name when the field is present.
- `web/src/styles.css`, `web/src/i18n.tsx`: pill style (reuse the trace cost-pill look) and hover text.
- No database, migration or agent changes. The admin agents table and the trace cost pills are unchanged.
