/** Per-token USD rates (see pricing.ts for where they come from). Pure module so tests cover the arithmetic. */
export interface CostRates {
  inputCostPerToken: number;
  outputCostPerToken: number;
  thinkingCostPerToken: number;
  /** Rate for prompt-cache READ tokens (a subset of input tokens, discounted). */
  cachedCostPerToken: number;
  /** Rate for prompt-cache WRITE tokens with a 5-minute lifetime (a subset of input tokens, surcharged). Absent = the input rate. */
  cacheWrite5mCostPerToken?: number;
  /** The same for a 1-hour lifetime. Absent = the input rate. */
  cacheWrite1hCostPerToken?: number;
}

/** The lifetime a request asks the provider's prompt cache for (openspec `llm-call-cache-usage`). */
export type CacheTtl = '5m' | '1h';
export const CACHE_TTL_OPTIONS = ['5m', '1h'] as const;
export const DEFAULT_CACHE_TTL: CacheTtl = '5m';

/** A stored setting value as a lifetime: anything but the two options is the default. */
export function cacheTtlOf(value: string | null | undefined): CacheTtl {
  return value === '1h' ? '1h' : DEFAULT_CACHE_TTL;
}

export interface CostUsage {
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  cachedTokens: number;
  /** Cache-write tokens per lifetime — subsets of inputTokens. Absent = 0. */
  cacheWrite5mTokens?: number;
  cacheWrite1hTokens?: number;
}

/** The cache-write rate of one lifetime (the input rate when the price list has none). */
export function cacheWriteRate(pricing: CostRates, ttl: CacheTtl): number {
  return (ttl === '1h' ? pricing.cacheWrite1hCostPerToken : pricing.cacheWrite5mCostPerToken) ?? pricing.inputCostPerToken;
}

/**
 * The cache-write rates of one price-list entry (openspec
 * `llm-call-cache-usage`). The list's own fields win; without them an
 * Anthropic model gets the provider's published multiples of the input price
 * (1.25x for 5 minutes, 2x for 1 hour) and any other provider the input price
 * (they do not charge for writing the cache).
 */
export function cacheWriteRatesOf(
  entry: Record<string, unknown> | undefined,
  input: number,
  provider: string,
): { cacheWrite5mCostPerToken: number; cacheWrite1hCostPerToken: number } {
  const write5m = entry?.cache_creation_input_token_cost;
  const write1h = entry?.cache_creation_input_token_cost_above_1hr;
  const anthropic = provider === 'anthropic';
  return {
    cacheWrite5mCostPerToken: typeof write5m === 'number' ? write5m : anthropic ? input * 1.25 : input,
    cacheWrite1hCostPerToken: typeof write1h === 'number' ? write1h : anthropic ? input * 2 : input,
  };
}

/**
 * Cached tokens and cache-write tokens are subsets of inputTokens: cached
 * ones bill at the cache-read rate, cache-write ones at the cache-write rate
 * of their lifetime, and the remainder at the full input rate. The single
 * arithmetic path for admin spend and the per-call log.
 */
export function computeCost(pricing: CostRates, usage: CostUsage): number {
  const write5m = usage.cacheWrite5mTokens ?? 0;
  const write1h = usage.cacheWrite1hTokens ?? 0;
  return (
    Math.max(0, usage.inputTokens - usage.cachedTokens - write5m - write1h) * pricing.inputCostPerToken +
    usage.cachedTokens * pricing.cachedCostPerToken +
    write5m * cacheWriteRate(pricing, '5m') +
    write1h * cacheWriteRate(pricing, '1h') +
    usage.outputTokens * pricing.outputCostPerToken +
    usage.thinkingTokens * pricing.thinkingCostPerToken
  );
}
