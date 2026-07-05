import { zodToJsonSchema } from 'zod-to-json-schema';
import { env } from '../config/env.js';
import { logger } from '../util/logger.js';
import { generateWithRetry, usageFromResponse, type GeminiUsage } from './generate.js';
import { DecisionResponseSchema, normalizeDecision, type NormalizedDecision } from './decisionSchema.js';

const decisionJsonSchema = zodToJsonSchema(DecisionResponseSchema) as Record<string, unknown>;
delete decisionJsonSchema.$schema;

export type { GeminiUsage };

export interface DecideResult {
  decision: NormalizedDecision;
  usage: GeminiUsage;
}

export async function decide(systemInstruction: string, contents: string): Promise<DecideResult> {
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

  const usage = usageFromResponse(response);
  logger.info('gemini tokens used', { model: env.GEMINI_MODEL, ...usage });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output (refusal or empty response): ${JSON.stringify(response)}`);
  }
  const raw = DecisionResponseSchema.parse(JSON.parse(text));
  return { decision: normalizeDecision(raw), usage };
}
