import { zodToJsonSchema } from 'zod-to-json-schema';
import { ApiError, type GenerateContentResponse } from '@google/genai';
import { genaiClient } from './client.js';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { DecisionResponseSchema, normalizeDecision, type NormalizedDecision } from './decisionSchema.js';

const decisionJsonSchema = zodToJsonSchema(DecisionResponseSchema) as Record<string, unknown>;
delete decisionJsonSchema.$schema;

// Transient Gemini failures: rate limit, server error, overloaded ("high demand"), timeout.
const RETRYABLE_STATUSES = new Set([429, 500, 503, 504]);
const MAX_ATTEMPTS = 5;
const BASE_DELAY_MS = 2_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Exponential backoff with jitter: ~2s, 4s, 8s, 16s between the 5 attempts. */
async function generateWithRetry(request: Parameters<typeof genaiClient.models.generateContent>[0]): Promise<GenerateContentResponse> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await genaiClient.models.generateContent(request);
    } catch (err) {
      const retryable = err instanceof ApiError && RETRYABLE_STATUSES.has(err.status);
      if (!retryable || attempt >= MAX_ATTEMPTS - 1) throw err;
      const delayMs = Math.round(BASE_DELAY_MS * 2 ** attempt * (0.5 + Math.random() * 0.5));
      logger.warn('Gemini call failed, retrying', { status: (err as ApiError).status, attempt, delayMs });
      await sleep(delayMs);
    }
  }
}

export async function decide(systemInstruction: string, contents: string): Promise<NormalizedDecision> {
  const response = await generateWithRetry({
    model: env.GEMINI_MODEL,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema: decisionJsonSchema,
      temperature: 0.3,
    },
  });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output (refusal or empty response): ${JSON.stringify(response)}`);
  }
  const raw = DecisionResponseSchema.parse(JSON.parse(text));
  return normalizeDecision(raw);
}
