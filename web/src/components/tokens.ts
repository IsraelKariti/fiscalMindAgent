/**
 * The input tokens a reader is shown (openspec `llm-call-cache-usage`): only
 * the tokens billed at the input price. The stored `inputTokens` is the whole
 * prompt — it also holds the cache-read and cache-write tokens, which are
 * billed at their own rates and shown as their own figures. Works on one call
 * and on sums alike. Pure, so it is unit-tested from the root test suite.
 */
export function fullPriceInputTokens(u: { inputTokens: number; cachedTokens: number; cacheWriteTokens?: number | null }): number {
  return Math.max(0, u.inputTokens - u.cachedTokens - (u.cacheWriteTokens ?? 0));
}
