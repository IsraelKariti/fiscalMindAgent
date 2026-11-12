## Why

The admin cost tab (openspec `admin-cost-tab`) shows one fixed "cost per day" line over the client's whole life, with no way to narrow it. An admin who wants to know "how much did the planner cost last month, week by week" or "which model drove the spike on the 3rd" has to read the raw call browser. A chart the admin can filter and regroup answers those questions in one place.

## What Changes

- A new admin-only client tab, **"גרף עלות"** (cost graph), right after the cost tab, shown only while an admin views the workspace as an accountant (same marker and colour as the questionnaire and cost tabs). The accountant, staff viewers and the monday embed never see it.
- The tab draws one chart from the client's recorded LLM calls, with a toolbar of controls:
  - **call type** filter (one of the client's call types, or all);
  - **model** filter (one of the models the client's calls used, or all);
  - **date range**: quick presets (7 / 30 / 90 days / all) and a custom from–to pair of dates;
  - **group by**: day, week (Monday-based) or month;
  - **measure**: cost (USD), number of calls, or tokens.
- With no call type chosen, the chart shows **one line per call type** (the costliest six, the rest merged into "other"), so types can be compared; with one type chosen it shows a single line.
- A one-line **range summary** under the toolbar: calls and cost in the chosen range (with the `+` floor marker when any call in range is unpriced).
- **Clicking a point** (a day, week or month) lists the calls of that bucket under the chart, filtered as the chart is; each row opens the call detail modal (`#/llm-calls/<id>`). Clicking the same point again, or a close button, hides the list.
- The chosen controls (type, model, preset, grouping, measure) are **remembered in the browser** and restored when the admin comes back to the tab, for any client. Custom from–to dates are not remembered (they belong to one client's life).
- No server change: the tab reuses the admin route that already serves one client's calls to the cost tab. Costs are the costs recorded at call time; nothing is repriced.

## Capabilities

### New Capabilities
- `admin-cost-graph-tab`: the admin-only cost graph tab of a client — who sees it, the filters and grouping it offers, how the chart, summary and clicked-bucket list read, and what is remembered.

### Modified Capabilities
- none: `admin-cost-tab` keeps its fixed per-day chart and all other widgets unchanged; `admin-questionnaire-tab` (the admin-only tab mechanism) and `conversation-trace` (call modal link) are reused as they are.

## Impact

- Web only: `web/src/agents/declarationOfCapital.tsx` (new `adminOnly` tab entry), a new `CostGraphCard` component plus a pure `costGraph.ts` bucketing/filter module, a small `onSelect` addition to `LineChart`, i18n strings, a little CSS. Reuses `api.adminGetClientLlmCalls`, `Seg`-style toolbar controls, `formatUsd`, `formatCompact`, `llmPurposeLabels`, `MODEL_LABELS`, `startOfWeek`, `CallDetailModal`.
- Server: none (existing `GET /api/admin/clients/:clientId/llm-calls`). No migration.
- Tests: a node test for the bucketing module (`tests/costGraph.test.ts`), added to `npm test`.
- Docs: `docs/agents.md` admin-only tabs paragraph.
