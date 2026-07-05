import { logger } from '../util/logger.js';

// Google publishes Gemini prices only as an HTML docs page, so we read them from
// LiteLLM's community-maintained registry instead — the de-facto standard pricing
// JSON that mirrors the official per-model rates.
const LITELLM_PRICES_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json';
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;
const FAILURE_RETRY_MS = 5 * 60 * 1000;

/** USD per single token (LiteLLM's unit — multiply by 1e6 for the per-1M rate). */
export interface LlmPricing {
  model: string;
  inputCostPerToken: number;
  outputCostPerToken: number;
  thinkingCostPerToken: number;
}

// The whole registry is cached (not one model's entry) because the admin can
// switch the active model at runtime; the lookup happens per call.
let table: Record<string, Record<string, unknown> | undefined> | null = null;
let nextFetchAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  try {
    const res = await fetch(LITELLM_PRICES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    table = (await res.json()) as Record<string, Record<string, unknown> | undefined>;
    nextFetchAt = Date.now() + REFRESH_INTERVAL_MS;
    logger.info('LLM pricing table refreshed', { models: Object.keys(table).length });
  } catch (err) {
    nextFetchAt = Date.now() + FAILURE_RETRY_MS;
    logger.error('LLM pricing refresh failed', err, { stale: table !== null });
  }
}

/**
 * Current prices for the given Gemini model, from a registry table cached in
 * memory for a day. On fetch failure the previous table keeps being served
 * (null only before the first successful fetch) and the fetch is retried after
 * a few minutes. An unknown model also yields null so callers show token
 * counts without prices.
 */
export async function getPricingForModel(model: string): Promise<LlmPricing | null> {
  if (Date.now() >= nextFetchAt) {
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    await inflight;
  }
  if (!table) return null;

  const entry = table[`gemini/${model}`];
  const input = entry?.input_cost_per_token;
  const output = entry?.output_cost_per_token;
  if (typeof input !== 'number' || typeof output !== 'number') {
    logger.error('no pricing entry for model', { model: `gemini/${model}` });
    return null;
  }
  const reasoning = entry?.output_cost_per_reasoning_token;
  return {
    model,
    inputCostPerToken: input,
    outputCostPerToken: output,
    // Gemini bills thinking tokens at the output rate unless listed separately.
    thinkingCostPerToken: typeof reasoning === 'number' ? reasoning : output,
  };
}
