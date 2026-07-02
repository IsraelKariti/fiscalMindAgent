import { z } from 'zod';

// `strict: true` structured outputs require every property to always be present (no `.optional()`).
// The "email fields only apply when decision === 'follow_up'" rule is expressed as always-present
// nullable fields plus a `decision` discriminator, documented in the prompt and re-checked below.
export const DecisionResponseSchema = z.object({
  decision: z.enum(['goal_complete', 'follow_up']),
  reasoning: z.string(),
  email_subject: z.string().nullable(),
  email_body: z.string().nullable(),
  wait_hours: z.number().nullable(),
});

export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

export type NormalizedDecision =
  | { decision: 'goal_complete'; reasoning: string }
  | { decision: 'follow_up'; reasoning: string; email_subject: string; email_body: string; wait_hours: number };

export function normalizeDecision(raw: DecisionResponse): NormalizedDecision {
  if (raw.decision === 'goal_complete') {
    return { decision: 'goal_complete', reasoning: raw.reasoning };
  }
  if (raw.email_body == null || raw.email_subject == null || raw.wait_hours == null || raw.wait_hours <= 0) {
    throw new Error(`follow_up decision missing/invalid fields: ${JSON.stringify(raw)}`);
  }
  return {
    decision: 'follow_up',
    reasoning: raw.reasoning,
    email_subject: raw.email_subject,
    email_body: raw.email_body,
    wait_hours: raw.wait_hours,
  };
}
