## Why

Pricing the product needs one number nobody can read today: what it costs the agent to bring in one document. The admin can see a client's total LLM spend (roster pill, cost tab) and what drafts were wasted (analytics tab), but nowhere does the spend meet the documents it produced, across the accountant's clients, with an average to put a price next to.

## What Changes

- The workspace Settings view gets an admin-only tab labeled **"מסמכים"** (documents), after the analytics tab ("ניתוח טיוטות") and before the dashboard tab, visible only while an admin views the workspace as an accountant. It is the pricing view of the agent instance.
- For every client of the instance the tab counts the checklist items the agent settled, in two kinds:
  - **documents with a file**: items whose file the verification pipeline approved;
  - **items resolved from the conversation**: items the client settled by words alone (does not have the asset, stated a cost or a vehicle, or says the office already holds the paper).
- It divides each client's lifetime LLM cost (every call recorded for the client, as recorded at call time) by those counts, two ways: cost per document with a file, and cost per settled item (file plus conversation).
- Headline tiles for the instance: clients counted, total cost, documents with a file, items resolved from the conversation, cost per document with a file (pooled: total cost ÷ total documents), cost per settled item (pooled), the median of the per-client cost per document, cost per completed declaration (mean lifetime cost of clients whose goal is complete, with their count), the share of the cost spent on reading files (calls tied to a file) versus the conversation, agent messages per settled item, and median days from first to last message for completed clients.
- A client list: one row per client with its name (opens the client), state (completed / running / paused / declined / deleted / test), documents with a file, items resolved from the conversation, items still open, agent messages sent, client messages received, total cost, cost per document with a file, cost per settled item. A footer row holds the sums and the pooled averages. Default sort: total cost descending; a sort control offers the per-document columns and the document counts.
- A client-kind filter (live clients / test clients / all, default live) and a "completed declarations only" toggle, both remembered in the browser.
- A `+` marker on costs whenever an unpriced call was counted as zero, as the other cost surfaces do.
- A new admin-only route serves the figures for one agent instance.

## Capabilities

### New Capabilities
- `document-cost-analytics`: what counts as a settled item (with a file / from the conversation), how a client's document cost is computed, what the admin-only documents tab of the Settings view shows, and that no other viewer reaches the figures.

### Modified Capabilities
- `admin-test-client`: the Settings tab list gains the documents tab after the analytics tab (the "Admin sees the tab" scenario names the full tab order).

## Impact

- Backend: a new query module that aggregates, per client of the instance, the LLM call sums (cost, unpriced count, calls, cost of calls tied to a file), the checklist counts by status, and the message counts and first/last message times; a pure summariser (tested in `npm test`) that derives the per-client figures, the tiles and the footer; one admin route `GET /api/admin/agents/:agentInstanceId/document-cost` behind `requireAdmin` in `src/api/router.ts`. No migration, no schema change.
- Web: `Settings.tsx` tab list (new `documents` tab, wide width like the analytics tab), `Workspace.tsx` wiring, a new `DocumentCostTab` component, a new `api.ts` function and type, Hebrew strings in `i18n.tsx`, a little CSS.
- Docs: `docs/agents.md` admin surfaces list.
- The accountant's own session, staff viewers and the monday embed see nothing new.
