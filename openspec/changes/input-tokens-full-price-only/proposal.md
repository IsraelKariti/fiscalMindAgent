## Why

A call row stores one input total that also holds the cache-read and cache-write tokens. Most screens print that total under the label "input tokens", next to the input price. A reader then thinks 54,193 tokens cost $5 per million, when only 11,425 did and 42,768 cost $0.50 per million. The dollar cost is right everywhere; the token figure beside it is misleading, and cost figures must be exact across the app.

## What Changes

- Every figure the app labels or presents as "input tokens" shows only the tokens billed at the input price: the stored input total minus the cache-read tokens minus the cache-write tokens.
- Cache-read and cache-write tokens are shown as their own figures wherever input tokens are shown with a cost, so the parts always explain the cost.
- Screens that change:
  - LLM call window (`#/llm-calls/<id>`): the input tokens tile.
  - LLM calls list: the tokens column becomes "input / output / thinking / cached / cache-write".
  - The call line in the client conversation trace and in the admin conversations card ("in/out tok").
  - Client cost tab: the tokens tile's context line (input, output, cached, cache-write).
  - Usage page (`#/usage`): the input tokens column.
  - Accountant page: the per-model table's input column, plus new cached and cache-write columns.
  - Versions page (`#/versions`): average input tokens per stage and per planner call.
- Figures that show a total of all tokens (cost tab tokens tile, cost graph "tokens" measure and bucket list, usage page "tokens" measure) keep their value: they count every token, at any price.
- Cache share on the versions page keeps its value: cached tokens divided by all prompt tokens.
- The "copy details" text of a call and `npm run call` add the full-price input count next to the stored total.
- No dollar amount changes. No stored data changes. No migration.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `llm-call-cache-usage`: new requirement that defines what "input tokens" and "total tokens" mean on every screen, and names the screens.
- `admin-cost-tab`: the tokens tile's context line gives full-price input, output, cached and cache-write tokens.
- `cost-per-version`: average input tokens (per stage, per planner call) count full-price input tokens only; cache share is defined over all prompt tokens.

## Impact

- Web: `AdminLlmCalls.tsx` (tile already edited, list column), `Timeline.tsx`, `AgentConversationsCard.tsx`, `CostCard.tsx`, `costSummary.ts`, `AdminUsage.tsx`, `AccountantPage.tsx`, `callLink.ts`, `i18n.tsx` (column header, context line), one new shared helper.
- Server: `src/analytics/versionCost.ts` and `src/db/queries/versionCost.ts` (the versions figures are computed on the server), `scripts/showCall.ts`.
- Tests: `tests/costSummary.test.ts`, `tests/versionCost.test.ts`, one new test for the helper.
- Unchanged: `llm_calls.input_tokens`, `llm_usage_daily`, the cost calculation (`src/gemini/cost.ts`), the anomaly scan, the admin API field `inputTokens` (still the stored total).
