## Context

- The cost tab (openspec `admin-cost-tab`, `web/src/components/CostCard.tsx`) already loads every call of the client through `api.adminGetClientLlmCalls(clientId)` → `GET /api/admin/clients/:clientId/llm-calls` (admin only, deleted and test clients included) and aggregates in the browser with the pure `summarizeCost()`. Its "cost over time" is one `LineChart` with one series, day buckets, whole life, no controls.
- `LineChart` (`web/src/components/charts/LineChart.tsx`) takes many series, a `format` function, `extraTip` rows, draws a legend when ≥2 series, and handles hover/keyboard — but has no click/select callback.
- The usage page (`AdminUsage.tsx`) has the toolbar pattern to copy: `Seg` segmented controls for range and grouping, `<select>` filters, `.usage-toolbar` / `.admin-toolbar` styles; its day axis is built in the browser from a `since`+`days` pair.
- `charts/weeks.ts` has `startOfWeek` (Monday-based); `format.ts` has `formatUsd`, `formatCompact`, `LOCALE`; purpose labels via `t.llmPurposeLabels[purpose] ?? humanizePurpose(purpose)`, model labels via `MODEL_LABELS`.
- Admin-only tabs: `ClientTab.adminOnly` filtered in `ClientView.tsx`; fallback for a remembered admin-only tab exists.
- `CallDetailModal` (from `admin/AdminLlmCalls`) opens a call by id and is already used by `CostCard`.

## Goals / Non-Goals

**Goals:**
- Everything in the browser: no new route, no migration, no stored aggregate. One pure, unit-tested module does filtering and bucketing.
- Reuse the existing chart, toolbar controls and call modal; the only chart change is a select callback.

**Non-Goals:**
- Changing the cost tab's widgets or the usage page.
- Platform-wide or per-accountant graphs (the `#/usage` page covers those).
- Server-side aggregation or pagination (a client's trail is at most a few hundred rows).
- Exporting the data.

## Decisions

1. **Separate tab and component, not more controls on the cost tab.** The cost tab is a fixed overview; the graph tab is an exploration tool with its own state. A new `web/src/components/CostGraphCard.tsx` registered as `{ id: 'cost-graph', labelKey: 'tabCostGraph', adminOnly: true }` after the cost entry in `declarationOfCapital.tsx`. *Alternative rejected:* add the toolbar to the cost tab's chart — it would crowd the overview and tie the remembered state to that tab.

2. **Pure module `web/src/components/costGraph.ts`.** Exports:
   - `costGraphOptions(calls)` → `{ purposes: string[], models: string[] }` sorted by total cost desc (for the selects) and the life range `{ first: 'YYYY-MM-DD', last: 'YYYY-MM-DD' }`.
   - `presetRange(preset, today, life)` → `{ from, to }` as local `YYYY-MM-DD` strings.
   - `bucketCalls(calls, { purpose, model, from, to, groupBy, measure })` → `{ labels: string[], keys: string[], series: { key, name?, values }[], buckets: LlmCallSummary[][], summary: { calls, cost, unpriced } }`, where `keys` are the bucket start days and `buckets[i]` holds the included calls of bucket i (newest first) for the click list. Series: one per type (top 6 by measure total + `other`) when `purpose` is null, else one series keyed by that purpose.
   - Local-day helpers shared with `costSummary.ts` (`localDay`); week start via `startOfWeek`; month start = first of the month. Bucket range = bucket(from) … bucket(to), zero-filled.
   Tested with `node --test` in `tests/costGraph.test.ts` using fixed dates (no `new Date()` inside the pure functions; `today` is a parameter).
   *Alternative rejected:* extend `summarizeCost` — it has fixed semantics and tests; a separate module keeps both simple.

3. **`LineChart` gains `onSelect?: (index: number) => void` and `selectedIdx?: number | null`.** Pointer click (`onClick` on the svg, using the same nearest-index math as hover) and Enter on the focused svg call `onSelect(hoverIdx)`. A selected bucket is drawn as a faint vertical band behind the lines (new `.chart-selected` style). No other chart behaviour changes, so the cost tab and dashboard are untouched. *Alternative rejected:* a new chart component — duplicates ~200 lines for one callback.

4. **Toolbar state in `CostGraphCard`.** State: `purpose | null`, `model | null`, `preset: 7 | 30 | 90 | 'all' | 'custom'`, `from`, `to`, `groupBy: 'day' | 'week' | 'month'`, `measure: 'cost' | 'calls' | 'tokens'`, `selected: number | null`. Preset change recomputes `from`/`to` via `presetRange`; editing a date input sets `preset = 'custom'`. Any state change except `selected` resets `selected` to null. Controls: two `<select>`s, a `Seg` for presets, two `<input type="date">`, a `Seg` for grouping, a `Seg` for measure — reusing `.admin-toolbar` and the `Seg` component (moved from `AdminUsage.tsx` to `charts/common.tsx` or `admin/shared.tsx` if it is not already exported).

5. **Remembered controls in `localStorage` key `fm.costGraph`** as JSON `{ purpose, model, preset, groupBy, measure }`, written on every change, read once on mount; `custom` is stored as `all`; a stored purpose/model the client lacks falls back to null after `costGraphOptions` is known. Reads and writes wrapped in try/catch (private mode). *Alternative rejected:* URL hash parameters — the client route hash is owned by the workspace router and the cost tab has no per-tab hash state to match.

6. **Formatting by measure.** `format` passed to `LineChart`: `formatUsd` for cost (`$0` for zero via a wrapper), `toLocaleString(LOCALE)` for calls, `formatCompact` for tokens. `extraTip` adds the bucket's call count. Labels: day/week `toLocaleDateString(LOCALE, { month: 'short', day: 'numeric' })`, month `{ month: 'short', year: 'numeric' }`.

7. **Bucket list card** reuses the cost tab's top-calls table markup (`.admin-table`, failed badge, "open call" ghost button → `CallDetailModal`) with two extra columns (tokens, and `—` for unpriced cost). Placed in a `ChartCard` under the chart with a close button in its header.

8. **Strings** in `web/src/i18n.tsx` next to the cost block: `tabCostGraph` ("גרף עלות"), control labels, preset labels, grouping and measure labels, "all types" / "all models" / "other", summary text, empty states, bucket card title/close. `t.llmPurposeLabels` and `MODEL_LABELS` are reused for entries.

## Risks / Trade-offs

- [Local-day buckets while logs are UTC] → same convention as the cost tab; documented in the spec; the chart is for shape, not accounting.
- [Many types make a hairball] → cap at six lines + "other"; the legend carries identity, end labels already drop at ≥3 converging series.
- [A 90-day daily axis has 90 labels] → `LineChart` already thins labels by width (`labelEvery`).
- [Custom date inputs with from > to] → treat as an empty range (empty-state text), never swap silently.
- [`localStorage` blocked] → defaults; wrapped reads/writes.

## Migration Plan

No migration, web only. Deploy with the next push; rollback = revert the commit; nothing is stored server-side.
