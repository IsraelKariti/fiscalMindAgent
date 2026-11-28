## Context

See proposal.md for motivation. Current state, as read in the code:

- `src/gemini/anthropic.ts` translates a Gemini-shaped request to the Messages API. An uncommitted edit already sends `system` as one text block with `cache_control: { type: 'ephemeral' }`. It returns usage in Gemini shape (`usageMetadata`), folding `cache_creation_input_tokens` into `promptTokenCount`.
- `usageFromResponse` (`generate.ts`) reads four numbers; `computeCost` (`cost.ts`) prices them; `recordLlmCall` writes one `llm_calls` row. The planner's tool loop (`toolLoop.ts`, `addUsage`) sums usage over turns into one row.
- Prices come from the LiteLLM table (`pricing.ts`), which also carries `cache_creation_input_token_cost` and `cache_creation_input_token_cost_above_1hr`.
- Settings live in `app_settings` keys read through `modelSettings.ts`; the "language model" section of `AdminSettings.tsx` edits them.
- The call page tiles are a four-entry array in `AdminLlmCalls.tsx` (line ~296). Latest migration is 084.
- On production the planner's system instructions (56K characters) and tools were byte-identical across the three calls checked; only the contents differ. So one cache mark on the system block covers about 85% of the prompt.

## Goals / Non-Goals

**Goals:**
- Exact per-call cost and visibility for Anthropic cache writes.
- One arithmetic path (`computeCost`) for the new category.
- Raw usage stored verbatim, per turn.

**Non-Goals:**
- No change to the OpenAI or Gemini request (their caching is automatic).
- No second cache mark on the message history (the per-call input changes every call).
- No per-stage lifetime and no "off" switch.

## Decisions

1. **Cache-write tokens are a subset of input tokens.** Same convention as cached tokens today (`cached ⊂ input`). Every existing sum of `input_tokens` stays correct with no change, and old rows (cache-write = 0) price exactly as before. Alternative — a disjoint count — would change the meaning of `input_tokens` for one provider only.

2. **New `llm_calls` columns (migration 085):** `cache_write_tokens BIGINT NOT NULL DEFAULT 0`, `cache_write_price_per_token DOUBLE PRECISION NULL`, `cache_ttl TEXT NULL` (`'5m'` | `'1h'`), `raw_usage JSONB NULL` (an array, one provider usage object per turn). No backfill: old rows keep the defaults.

3. **Usage travels as a fifth number plus a raw block.** `usageMetadata` gains `cacheWriteTokenCount` (our own field on the Gemini-shaped response, like `restoredFields`), and the response object carries `rawUsage` (the provider's `usage` object untouched). `GeminiUsage` / `TurnUsage` gain `cacheWriteTokens`; `addUsage` sums it. The tool loop collects each turn's `rawUsage` into an array that reaches `recordLlmCall`. OpenAI passes `data.usage`, Gemini passes `usageMetadata` as received.

4. **Price lookup.** `LlmPricing` gains `cacheWriteCostPerToken(ttl)`: LiteLLM `cache_creation_input_token_cost` for 5 minutes, `cache_creation_input_token_cost_above_1hr` for 1 hour; when the field is missing, input price × 1.25 or × 2. The row stores the one rate that applied. One row has one lifetime, so one price is enough.

5. **The lifetime is passed into the adapter, and recorded from what was sent.** `generate.ts` resolves the setting once per call (`getAnthropicCacheTtl()` in `modelSettings.ts`, key `anthropic_cache_ttl`, default `'5m'`) and hands it to `generateContentAnthropic`, which sends `cache_control: { type: 'ephemeral', ttl }`. The same resolved value is written to `cache_ttl` — only when a cache mark was actually sent (Anthropic + system instructions). The adapter stays free of DB access, as today. The sent mark also appears in `request.sent` through `wireRequest.ts`, so the log matches the wire.

6. **Setting route.** Reuse the admin route that saves the stage models (same section, same refusal-message handling in `AdminSettings.tsx`); validate with a two-value enum.

7. **UI.** The tiles array gets a fifth entry; the lifetime is the tile's second line. The raw usage section reuses the existing copyable JSON block component of the call page. Hebrew strings in `i18n.tsx`.

8. **Usage totals keep one count per lifetime.** `llm_usage_daily` and `llm_model_usage` get `cache_write_5m_tokens` and `cache_write_1h_tokens` (`BIGINT NOT NULL DEFAULT 0`, same migration). A total can mix both lifetimes (the admin can change the setting mid-day), and the two have different prices, so one column would not price exactly. `computeCost` therefore takes `cacheWrite5mTokens` and `cacheWrite1hTokens` with a rate for each; the per-call path fills the one that matches the call's lifetime, so calls and totals share the same arithmetic. `llmUsage.add` takes the two counts (optional, default 0); the usage object handed to its seven call sites already carries them once decision 3 is in, so the call sites change only where they rebuild the object by hand. `src/api/admin.ts` passes them to `computeCost` in both places (accountants list, daily rows) and returns `cacheWriteTokens` (the sum). `AdminUsage.tsx` adds the column. The usage page prices at today's prices, as it already does for every other category.

## Risks / Trade-offs

- [A call site of `llmUsage.add` that rebuilds the usage object by hand would silently drop the new counts] → The task checks all seven call sites, and a test compares a day's total cost with the sum of its calls' costs.
- [A call after a pause longer than the lifetime costs more than before caching] → The lifetime setting exists for this; the trade-off line under the picker states the numbers.
- [The cache needs a byte-identical start] → The planner already guarantees it (`planner-prompt-caching` spec). For other stages a varying system prompt only means no cache hit, plus the write surcharge; the call page now shows cache-write tokens with 0 cached, which makes such a stage easy to spot.
- [Cannot be verified locally: only a Gemini key exists on the dev machine] → Unit tests cover translation, summing and cost; the live check is done on the sandbox after deploy.
- [The 1-hour lifetime needs SDK/API support for `ttl: '1h'`] → Confirm against the installed `@anthropic-ai/sdk` types in the first server task; if the type rejects it, bump the SDK.

## Migration Plan

Migration 085 is additive (new columns with defaults, on `llm_calls` and the two usage-total tables). Deploy as usual; production runs it in the deploy flow. Rollback: the old code ignores the new columns.
