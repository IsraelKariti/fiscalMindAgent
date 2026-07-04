import { z } from 'zod';
import { isWallClockDateTime } from '../util/time.js';

// Gemini's `responseJsonSchema` doesn't support Zod's `.optional()` the same way structured
// outputs need every property always present; the "email fields only apply when
// decision === 'follow_up'" rule is expressed as always-present nullable fields plus a
// `decision` discriminator, documented in the prompt and re-checked below.
export const DecisionResponseSchema = z.object({
  decision: z.enum(['goal_complete', 'follow_up']),
  reasoning: z.string(),
  /** Ids from the REQUIRED DOCUMENTS list the thread shows the client has now provided. */
  collected_document_ids: z.array(z.string()),
  /** Which received file satisfies which required document (both by id); empty when nothing new matches. */
  matched_files: z.array(z.object({ file_id: z.string(), document_id: z.string() })),
  email_subject: z.string().nullable(),
  email_body: z.string().nullable(),
  /** When to send, as "YYYY-MM-DD HH:MM" wall-clock time in the accountant's timezone. */
  send_at: z.string().nullable(),
});

export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

export interface MatchedFile {
  file_id: string;
  document_id: string;
}

export type NormalizedDecision =
  | { decision: 'goal_complete'; reasoning: string; collected_document_ids: string[]; matched_files: MatchedFile[] }
  | {
      decision: 'follow_up';
      reasoning: string;
      collected_document_ids: string[];
      matched_files: MatchedFile[];
      email_subject: string;
      email_body: string;
      /** Validated wall-clock datetime in the accountant's timezone. */
      send_at: string;
    };

export function normalizeDecision(raw: DecisionResponse): NormalizedDecision {
  if (raw.decision === 'goal_complete') {
    return {
      decision: 'goal_complete',
      reasoning: raw.reasoning,
      collected_document_ids: raw.collected_document_ids,
      matched_files: raw.matched_files,
    };
  }
  if (raw.email_body == null || raw.email_subject == null || raw.send_at == null || !isWallClockDateTime(raw.send_at)) {
    throw new Error(`follow_up decision missing/invalid fields: ${JSON.stringify(raw)}`);
  }
  return {
    decision: 'follow_up',
    reasoning: raw.reasoning,
    collected_document_ids: raw.collected_document_ids,
    matched_files: raw.matched_files,
    email_subject: raw.email_subject,
    email_body: raw.email_body,
    send_at: raw.send_at.trim(),
  };
}
