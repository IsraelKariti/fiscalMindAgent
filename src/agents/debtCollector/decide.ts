import { zodToJsonSchema } from 'zod-to-json-schema';
import { logger } from '../../util/logger.js';
import { getGeminiModel } from '../../gemini/modelSettings.js';
import { generateWithRetry, usageFromResponse, type GeminiUsage } from '../../gemini/generate.js';
import { DebtDecisionResponseSchema, normalizeDebtDecision, type NormalizedDebtDecision } from './decisionSchema.js';

const decisionJsonSchema = zodToJsonSchema(DebtDecisionResponseSchema) as Record<string, unknown>;
delete decisionJsonSchema.$schema;

export interface DebtDecideResult {
  decision: NormalizedDebtDecision;
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
}

export async function decide(systemInstruction: string, contents: string): Promise<DebtDecideResult> {
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
  logger.info('gemini tokens used (debt decision)', { model, ...usage });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output (refusal or empty response): ${JSON.stringify(response)}`);
  }
  const raw = DebtDecisionResponseSchema.parse(JSON.parse(text));
  return { decision: normalizeDebtDecision(raw), usage, model };
}
