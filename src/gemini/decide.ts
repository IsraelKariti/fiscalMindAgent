import { zodToJsonSchema } from 'zod-to-json-schema';
import { genaiClient } from './client.js';
import { env } from '../config/env.js';
import { DecisionResponseSchema, normalizeDecision, type NormalizedDecision } from './decisionSchema.js';

const decisionJsonSchema = zodToJsonSchema(DecisionResponseSchema) as Record<string, unknown>;
delete decisionJsonSchema.$schema;

export async function decide(systemInstruction: string, contents: string): Promise<NormalizedDecision> {
  const response = await genaiClient.models.generateContent({
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
