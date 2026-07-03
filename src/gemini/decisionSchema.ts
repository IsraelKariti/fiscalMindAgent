import { z } from 'zod';

// Gemini's `responseJsonSchema` doesn't support Zod's `.optional()` the same way structured
// outputs need every property always present; the "email fields only apply when
// decision === 'follow_up'" rule is expressed as always-present nullable fields plus a
// `decision` discriminator, documented in the prompt and re-checked below.
export const DecisionResponseSchema = z.object({
  decision: z.enum(['goal_complete', 'follow_up']),
  reasoning: z.string(),
  /** Ids from the REQUIRED DOCUMENTS list the thread shows the client has now provided. */
  collected_document_ids: z.array(z.string()),
  email_subject: z.string().nullable(),
  email_body: z.string().nullable(),
  wait_hours: z.number().nullable(),
});

export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

export type NormalizedDecision =
  | { decision: 'goal_complete'; reasoning: string; collected_document_ids: string[] }
  | {
      decision: 'follow_up';
      reasoning: string;
      collected_document_ids: string[];
      email_subject: string;
      email_body: string;
      wait_hours: number;
    };

export function normalizeDecision(raw: DecisionResponse): NormalizedDecision {
  if (raw.decision === 'goal_complete') {
    return {
      decision: 'goal_complete',
      reasoning: raw.reasoning,
      collected_document_ids: raw.collected_document_ids,
    };
  }
  if (raw.email_body == null || raw.email_subject == null || raw.wait_hours == null || raw.wait_hours <= 0) {
    throw new Error(`follow_up decision missing/invalid fields: ${JSON.stringify(raw)}`);
  }
  return {
    decision: 'follow_up',
    reasoning: raw.reasoning,
    collected_document_ids: raw.collected_document_ids,
    email_subject: raw.email_subject,
    email_body: raw.email_body,
    wait_hours: raw.wait_hours,
  };
}
