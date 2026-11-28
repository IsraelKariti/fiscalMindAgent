## Context

See proposal.md for the motivation.

`llm_calls.input_tokens` and `llm_usage_daily.input_tokens` hold the whole prompt: full-price input + cache-read + cache-write. The cost code (`src/gemini/cost.ts`) already subtracts the two cache parts before it applies the input price, so every dollar figure is right. The admin API passes the stored total through as `inputTokens`, with `cachedTokens` and `cacheWriteTokens` beside it, and each screen prints `inputTokens` as is. The versions page is the one place where the figures are computed on the server (`src/analytics/versionCost.ts`); its query does not select cache-write tokens yet.

The input tokens tile of the call window was already edited in the working tree (inline subtraction, uncommitted). This change keeps that behavior and moves it to the shared helper.

## Goals / Non-Goals

**Goals:**
- One definition of "input tokens" on every screen: tokens billed at the input price.
- On every screen that shows input tokens with a cost, the token parts shown explain the cost.
- One place holds the subtraction, so a new screen cannot get it wrong.

**Non-Goals:**
- No change to stored data, migrations, the cost calculation, or the anomaly scan.
- No change to any dollar amount.
- No new cost breakdown on screens that show only a token total.

## Decisions

**1. Subtract at display time; stored and API totals stay.**
The stored total is what the provider-side cost rule and the spec `llm-call-cache-usage` are written against, and older "copy details" pastes carry it. Changing the meaning of the stored column or of the API field `inputTokens` would need a migration of every row and of `llm_usage_daily`, and would break the cost code's inputs. Alternative considered: return an extra API field per row. Rejected: three API shapes carry tokens (call, daily usage, lifetime usage) and all already carry the two cache counts, so the web can derive the figure with no API change.

**2. One shared web helper.**
A pure function `fullPriceInputTokens({ inputTokens, cachedTokens, cacheWriteTokens })` returning `max(0, input − cached − cacheWrite)`, in a small module under `web/src/components/` next to `costSummary.ts`. Every screen calls it; no screen subtracts inline. `cacheWriteTokens` may be missing on old payloads, so the helper treats a missing value as 0. The clamp at 0 guards rows where a provider reports cached tokens above the input total.

**3. Sums subtract after summing.**
For totals (cost tab, usage page groups, accountant table) the screen sums input, cached and cache-write as today, then applies the helper to the sums. The result equals the sum of per-row values except where a row would clamp at 0, which does not happen on real rows.

**4. Total-token figures keep the stored total.**
"Total tokens" = stored input + output + thinking. The stored input already holds the cache tokens, so these figures do not change. Their code stays; only comments say why.

**5. Versions page: computed on the server.**
`src/db/queries/versionCost.ts` adds `SUM(cache_write_tokens)` to the group query. `versionCost.ts` computes the two averages from `input − cached − cacheWrite`, and keeps cache share as `cached / input` (stored input). Alternative considered: relabel the figures "prompt tokens" and keep their values, to keep a prompt-size trend. Rejected: the page compares cost between versions, and the full-price part is the part that tracks cost; the cached part's effect shows in cost per cycle and in cache share.

**6. Screens that show input tokens with a cost also show both cache counts.**
The call list column gains cache-write as a fifth part. The cost tab context line gains cache-write. The accountant per-model table gains cached and cache-write columns (its API payload already carries both). The trace call line stays "in/out tok" with the full-price input, because it is a compact hint and the call window one click away has every part.

**7. Copy details and `npm run call`.**
Both add `fullPriceInputTokens` beside `inputTokens`. `inputTokens` stays the stored total so the pasted JSON still matches the database row.

## Risks / Trade-offs

- [The same call shows a smaller input number than before] → The change is the point; the cached and cache-write figures sit beside it on every costed screen.
- [Versions page averages drop sharply for versions after prompt caching began, so the delta against the previous version shows a large fall] → Expected one-time effect; the figure is now the cost-relevant one. Cost per cycle is not affected.
- [A future screen prints `inputTokens` raw again] → The API type comment on `inputTokens` says it is the stored total and names the helper.
- [Old usage totals counted before cache-write was recorded] → They carry 0 cache-write, so their input figure only loses the cached part, which is correct for them.
