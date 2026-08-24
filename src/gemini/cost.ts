/** Per-token USD rates (see pricing.ts for where they come from). Pure module so tests cover the arithmetic. */
export interface CostRates {
  inputCostPerToken: number;
  outputCostPerToken: number;
  thinkingCostPerToken: number;
  /** Rate for prompt-cache READ tokens (a subset of input tokens, discounted). */
  cachedCostPerToken: number;
}

/**
 * Cached tokens are a subset of inputTokens billed at the cache-read rate; the
 * non-cached remainder bills at the full input rate. The single arithmetic
 * path for admin spend and the per-call log.
 */
export function computeCost(
  pricing: CostRates,
  usage: { inputTokens: number; outputTokens: number; thinkingTokens: number; cachedTokens: number },
): number {
  return (
    Math.max(0, usage.inputTokens - usage.cachedTokens) * pricing.inputCostPerToken +
    usage.cachedTokens * pricing.cachedCostPerToken +
    usage.outputTokens * pricing.outputCostPerToken +
    usage.thinkingTokens * pricing.thinkingCostPerToken
  );
}
