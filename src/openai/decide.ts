import type OpenAI from 'openai';
import { zodResponseFormat } from 'openai/helpers/zod';
import { openaiClient } from './client.js';
import { env } from '../config/env.js';
import { DecisionResponseSchema, normalizeDecision, type NormalizedDecision } from './decisionSchema.js';

export async function decide(messages: OpenAI.Chat.ChatCompletionMessageParam[]): Promise<NormalizedDecision> {
  const completion = await openaiClient.beta.chat.completions.parse({
    model: env.OPENAI_MODEL,
    messages,
    response_format: zodResponseFormat(DecisionResponseSchema, 'form106_followup_decision'),
    temperature: 0.3,
  });

  const choice = completion.choices[0];
  const raw = choice?.message.parsed;
  if (!raw) {
    throw new Error(`OpenAI returned no parsed structured output (refusal or parse failure): ${JSON.stringify(choice?.message)}`);
  }
  return normalizeDecision(raw);
}
