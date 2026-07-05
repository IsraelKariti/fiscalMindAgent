import { env } from '../config/env.js';
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

let cached: LlmPricing | null = null;
let nextFetchAt = 0;
let inflight: Promise<void> | null = null;

async function refresh(): Promise<void> {
  try {
    const res = await fetch(LITELLM_PRICES_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const table = (await res.json()) as Record<string, Record<string, unknown> | undefined>;
    const entry = table[`gemini/${env.GEMINI_MODEL}`];
    const input = entry?.input_cost_per_token;
    const output = entry?.output_cost_per_token;
    if (typeof input !== 'number' || typeof output !== 'number') {
      throw new Error(`no pricing entry for gemini/${env.GEMINI_MODEL}`);
    }
    const reasoning = entry?.output_cost_per_reasoning_token;
    cached = {
      model: env.GEMINI_MODEL,
      inputCostPerToken: input,
      outputCostPerToken: output,
      // Gemini bills thinking tokens at the output rate unless listed separately.
      thinkingCostPerToken: typeof reasoning === 'number' ? reasoning : output,
    };
    nextFetchAt = Date.now() + REFRESH_INTERVAL_MS;
    logger.info('LLM pricing refreshed', { ...cached });
  } catch (err) {
    nextFetchAt = Date.now() + FAILURE_RETRY_MS;
    logger.error('LLM pricing refresh failed', err, { model: env.GEMINI_MODEL, stale: cached !== null });
  }
}

/**
 * Current prices for the configured Gemini model, cached in memory for a day.
 * On fetch failure the previous prices keep being served (null only before the
 * first successful fetch) and the fetch is retried after a few minutes.
 */
export async function getLlmPricing(): Promise<LlmPricing | null> {
  if (Date.now() >= nextFetchAt) {
    inflight ??= refresh().finally(() => {
      inflight = null;
    });
    await inflight;
  }
  return cached;
}
