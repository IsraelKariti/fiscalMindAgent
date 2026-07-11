import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { getGeminiModel } from '../../gemini/modelSettings.js';
import { generateWithRetry, usageFromResponse, type GeminiUsage } from '../../gemini/generate.js';
import { logger } from '../../util/logger.js';

const AnswerResponseSchema = z
  .object({
    /** Internal, never shown to the client. */
    reasoning: z.string(),
    /** The WhatsApp reply text. */
    answer: z.string().min(1),
  })
  .strict();

const answerJsonSchema = zodToJsonSchema(AnswerResponseSchema) as Record<string, unknown>;
delete answerJsonSchema.$schema;

export interface AnswerResult {
  answer: string;
  reasoning: string;
  usage: GeminiUsage;
  /** The model that actually served this call, for per-model usage accounting. */
  model: string;
}

export async function generateAnswer(systemInstruction: string, contents: string): Promise<AnswerResult> {
  const model = await getGeminiModel();
  const response = await generateWithRetry({
    model,
    contents,
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
      responseJsonSchema: answerJsonSchema,
      temperature: 0.3,
    },
  });

  const usage = usageFromResponse(response);
  logger.info('gemini tokens used', { model, ...usage });

  const text = response.text;
  if (!text) {
    throw new Error(`Gemini returned no text output (refusal or empty response): ${JSON.stringify(response)}`);
  }
  const parsed = AnswerResponseSchema.parse(JSON.parse(text));
  return { answer: parsed.answer, reasoning: parsed.reasoning, usage, model };
}
