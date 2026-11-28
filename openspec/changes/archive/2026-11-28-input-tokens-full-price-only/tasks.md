## 1. Shared helper

- [x] 1.1 Add the pure function `fullPriceInputTokens({ inputTokens, cachedTokens, cacheWriteTokens })` (max 0, missing cache-write = 0) in a new module under `web/src/components/`; add a test under `tests/` for: cache read (54,193 / 42,768 / 0 → 11,425), cache write (52,000 / 0 / 45,000 → 7,000), no cache (9,000 → 9,000), missing cache-write, clamp at 0; verify the test passes and is listed in `npm test`
- [x] 1.2 Update the comment on `inputTokens` in the three token types of `web/src/api.ts` to say it is the stored total and that screens show it through the helper; verify `npx tsc -p web/tsconfig.json --noEmit` passes

## 2. Call screens

- [x] 2.1 `AdminLlmCalls.tsx`: replace the inline subtraction in the input tokens tile with the helper; verify the tile of a cached call shows input total minus cached minus cache-write
- [x] 2.2 `AdminLlmCalls.tsx` call list: `tokensCell` prints full-price input / output / thinking / cached / cache-write, and the header text `adminLlmCallsColTokens` in `i18n.tsx` names the five parts; verify a cached row reads like `11,425 / 727 / 0 / 42,768 / 0`
- [x] 2.3 `Timeline.tsx` and `AgentConversationsCard.tsx`: the call line prints the full-price input before the slash; verify by reading both lines against the same call's tile
- [x] 2.4 `callLink.ts` (`callDetailsText`) and `scripts/showCall.ts`: add `fullPriceInputTokens` next to `inputTokens`; verify with `npm run call` on a local call link and by pasting "copy details" of the same call

## 3. Cost tab, usage page, accountant page

- [x] 3.1 `costSummary.ts`: totals also sum cache-write tokens; `CostCard.tsx` and `costTokensContext` in `i18n.tsx`: the context line gives full-price input, output, cached and cache-write, the tile value stays the stored total; extend `tests/costSummary.test.ts` with a cached call and a cache-write call and verify it passes
- [x] 3.2 `AdminUsage.tsx`: the input column of the breakdown table shows the helper applied to the group sums; the "tokens" measure is unchanged; verify a group's input + cached + cache-write equals its old input figure
- [x] 3.3 `AccountantPage.tsx`: the input column shows full-price input, and the table gains cached and cache-write columns (labels `cachedTokens`, `cacheWriteTokens`); verify the footer `colSpan` still lines up and the three columns add up to the old input figure
- [x] 3.4 `costGraph.ts` and `CostGraphCard.tsx`: no value change; add a one-line comment that the total uses the stored input because it holds the cache tokens; verify `tests/costGraph.test.ts` still passes unchanged

## 4. Versions page

- [x] 4.1 `src/db/queries/versionCost.ts`: add `SUM(cache_write_tokens)` to the group query and its row type; verify `npm run typecheck` passes
- [x] 4.2 `src/analytics/versionCost.ts`: `avgInputTokens` and `plannerInputTokensAvg` use input − cached − cache-write (max 0); `cacheShare` stays cached / stored input; extend `tests/versionCost.test.ts` with the spec scenarios (2 planner calls, 107,138 input, 85,536 cached → 10,801; 10,000 input with 7,500 cached → 75%) and verify it passes

## 5. Checks

- [x] 5.1 Run `npm run typecheck`, `npx tsc -p web/tsconfig.json --noEmit` and `npm test`; verify all pass
- [x] 5.2 Grep `web/src` and `src/api` for `inputTokens` and confirm every place that shows it to a reader goes through the helper or is a documented total; list the result in the change notes
  - Result: the remaining raw uses of the stored total in `web/src` are the three total-token figures (`CostCard.tsx` tile value, `costGraph.ts`, `CostGraphCard.tsx` bucket list, `AdminUsage.tsx` `tokensOf`) and the sums that feed the helper (`costSummary.ts`, `AdminUsage.tsx` group sum). `src/api` passes the stored total through unchanged.
- [x] 5.3 Browser check on the local dev stack: open one cached planner call and compare the call window, the call list row, the trace call line, the client cost tab, `#/usage`, the accountant page and `#/versions`; verify each shows the same full-price input for that call and that no dollar amount changed
  - Result (local dev stack, one client with 25 calls): call window tiles and call list row show 14,604 input for a call with 46,523 stored input and 31,919 cached; the trace call line reads `14,604/442 tok`; the client cost tab reads 545.1K total with input 476.2K, output 5K, cached 58.2K, cache-write 0 (API sums: 534,408 stored input, 58,190 cached); the accountant page rows equal stored input minus cached per model; `#/usage` input 688,813 = 752,507 stored minus 63,694 cached; `#/versions` shows the new averages. No dollar amount changed.
