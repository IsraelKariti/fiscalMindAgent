import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../util/logger.js';
import { getGeminiModel } from './modelSettings.js';
import { generateWithRetry, usageFromResponse, type GeminiUsage } from './generate.js';
import {
  DecisionResponseSchema,
  EMAIL_ONLY_CONTEXT,
  normalizeDecision,
  type DecisionContext,
  type NormalizedDecision,
} from './decisionSchema.js';

const decisionJsonSchema = zodToJsonSchema(DecisionResponseSchema) as Record<string, unknown>;
delete decisionJsonSchema.$schema;

export type { GeminiUsage };

export interface DecideResult {
  decision: NormalizedDecision;
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
}

export async function decide(
  systemInstruction: string,
  contents: string,
  ctx: DecisionContext = EMAIL_ONLY_CONTEXT,
): Promise<DecideResult> {
  const model = await getGeminiModel();
  const response = await generateWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema: decisionJsonSchema,
      temperature: 0.3,
    },
  });

  const usage = usageFromResponse(response);
  logger.info('gemini tokens used', { model, ...usage });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output (refusal or empty response): ${JSON.stringify(response)}`);
  }
  const raw = DecisionResponseSchema.parse(JSON.parse(text));
  return { decision: normalizeDecision(raw, ctx), usage, model };
}
