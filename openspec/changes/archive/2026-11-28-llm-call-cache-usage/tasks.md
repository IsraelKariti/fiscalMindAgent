## 1. Database

- [x] 1.1 Add `migrations/085_llm_calls_cache_usage.sql` with `cache_write_tokens`, `cache_write_price_per_token`, `cache_ttl`, `raw_usage` on `llm_calls` (design decision 2); verify `npm run db:migrate` applies it and an old row reads 0 / NULL / NULL / NULL
- [x] 1.2 Extend `LlmCallRow`, `InsertLlmCall`, the insert statement and the read queries in `src/db/queries/llmCalls.ts`; verify `npm run typecheck` passes

## 2. Cost and prices

- [x] 2.1 Add the 5-minute and 1-hour cache-write rates to `CostRates` and the two cache-write terms (`cacheWrite5mTokens`, `cacheWrite1hTokens`) to `computeCost` in `src/gemini/cost.ts` (cache-write ⊂ input); verify with unit tests for the spec's $0.33125 example and for "0 cache-write tokens costs the same as before"
- [x] 2.2 Read the cache-write price per lifetime in `src/gemini/pricing.ts` (LiteLLM fields, fallback × 1.25 / × 2); verify with a unit test on a table entry with and without the fields

## 3. Setting

- [x] 3.1 Add `getAnthropicCacheTtl` / `saveAnthropicCacheTtl` in `src/gemini/modelSettings.ts` (key `anthropic_cache_ttl`, default `'5m'`); verify with a test in `tests/modelSettings.test.ts` for default, save and read
- [x] 3.2 Expose the value in the admin model-settings GET and accept it in the save route with a two-value check; verify a request with another value is refused and the saved value is unchanged

## 4. Adapters and call log

- [x] 4.1 Confirm the installed `@anthropic-ai/sdk` accepts `cache_control.ttl: '1h'` on a system text block (bump the SDK if not); verify `npm run typecheck` passes with the `ttl` field
- [x] 4.2 In `src/gemini/anthropic.ts` take the lifetime as a parameter, send it on the cache mark, return `cacheWriteTokenCount` and `rawUsage`; verify in `tests/adapterWire.test.ts` that the sent `system` block carries the mark and lifetime, and that a response with 45,000 cache-creation tokens yields 52,000 input / 45,000 cache-write
- [x] 4.3 Return `rawUsage` from the OpenAI and Gemini paths and 0 cache-write tokens; verify in `tests/adapterWire.test.ts`
- [x] 4.4 Carry `cacheWriteTokens` through `GeminiUsage`, `usageFromResponse`, `TurnUsage` and `addUsage`, and collect per-turn raw usage in `src/gemini/toolLoop.ts`; verify with a tool-loop test of two turns (summed counts, two raw blocks in order)
- [x] 4.5 In `src/gemini/generate.ts` resolve the lifetime per call, pass it to the Anthropic adapter, and write cache-write tokens, price, `cache_ttl` (only when a mark was sent) and `raw_usage` in `recordLlmCall`; verify with a test that a Gemini call records no lifetime and a failed call records no raw usage
- [x] 4.6 Show the sent cache mark in `request.sent` (`src/gemini/wireRequest.ts`); verify the existing wire-request test covers the new field

## 5. Admin API and web

- [x] 5.1 Return `cacheWriteTokens`, `cacheWritePricePerToken`, `cacheTtl`, `rawUsage` from `toAdminCall` / the single-call route in `src/api/llmAdmin.ts` and add them to the types in `web/src/api.ts`; verify with `npm run typecheck`
- [x] 5.2 Add the cache-write tile with the lifetime line and the raw usage JSON section to `web/src/components/admin/AdminLlmCalls.tsx`, the new values to "copy details" and to `npm run call`, and Hebrew strings in `web/src/i18n.tsx`; verify in the browser on an old row (0, dash, "none recorded")
- [ ] 5.3 Add the lifetime picker with the trade-off line to the "language model" section of `web/src/components/admin/AdminSettings.tsx`, hidden without an Anthropic key; verify in the browser that a save persists after reload

## 6. Usage totals

- [x] 6.1 Add `cache_write_5m_tokens` and `cache_write_1h_tokens` to `llm_usage_daily` and `llm_model_usage` in migration 085, and to the row types, `add`, `listAll` and `listDaily` in `src/db/queries/llmUsage.ts`; verify `npm run db:migrate` applies and old rows read 0
- [x] 6.2 Check the seven `llmUsage.add` call sites (`plan.ts`, `analyzeInboundFile.ts` ×2, `formIntake.ts`, `verifyDocument.ts`, `injectionScreen.ts` ×2) pass the cache-write counts with the call's lifetime; verify with a test that a recorded cache-write call lands in the right lifetime column
- [x] 6.3 Pass the two counts to `computeCost` and return `cacheWriteTokens` in both handlers of `src/api/admin.ts` (accountants list, `adminLlmUsageDaily`); verify with a test that a day's cost equals the sum of its calls' costs for the spec's $0.33125 example
- [ ] 6.4 Add the cache-write column to the table in `web/src/components/admin/AdminUsage.tsx` (type in `web/src/api.ts`, Hebrew header in `web/src/i18n.tsx`); verify in the browser that an old day shows 0

## 7. Checks and docs

- [x] 7.1 Run `npm run typecheck` and `npm test`; verify both pass
- [ ] 7.2 After deploy to the sandbox, run two Anthropic planner calls within five minutes and verify on the call page: first call cache-write > 0 and cached 0, second call cached > 0, lifetime "5 minutes", raw usage shown; then switch to 1 hour and verify the next call's lifetime and price
- [x] 7.3 Add a short caching note to the Notion "Anthropic constraints" page (read `STYLE.md` first); verify the page shows the note
