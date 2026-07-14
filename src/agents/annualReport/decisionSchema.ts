import { z } from 'zod';
import { isWallClockDateTime } from '../../util/time.js';
import { normalizeFollowUpMessage, EMAIL_ONLY_CONTEXT } from '../docCollector/decisionSchema.js';
import type { DecisionContext, FollowUpMessage, MatchedFile } from '../docCollector/decisionSchema.js';

export { EMAIL_ONLY_CONTEXT };
export type { DecisionContext, FollowUpMessage, MatchedFile };

// Same Gemini structured-output convention as the doc collector: every property is
// always present (nullable, never .optional()), with the conditional rules documented
// in the prompt and re-checked in normalizeDecision.
export const DecisionResponseSchema = z.object({
  decision: z.enum(['goal_complete', 'follow_up']),
  reasoning: z.string(),
  /** Sticky once true: the interview covered every topic applicable to this client. */
  interview_complete: z.boolean(),
  /** Documents the interview just determined are required; each becomes a client_documents row (deduped by name). */
  add_documents: z.array(
    z.object({
      name: z.string(),
      description: z.string().nullable(),
      /** A file already in the thread that satisfies this document — the row is created collected and linked. */
      matched_file_id: z.string().nullable(),
    }),
  ),
  /** Ids from the DOCUMENTS DETERMINED SO FAR list the thread shows the client has now provided. */
  collected_document_ids: z.array(z.string()),
  /** Which received file satisfies which determined document (both by id); empty when nothing new matches. */
  matched_files: z.array(z.object({ file_id: z.string(), document_id: z.string() })),
  /** Which channel the follow-up goes out on; null/'email' unless the prompt offered WhatsApp. */
  channel: z.enum(['email', 'whatsapp']).nullable(),
  email_subject: z.string().nullable(),
  email_body: z.string().nullable(),
  /** Free-form WhatsApp text — only valid while the 24h customer-service window is open. */
  whatsapp_text: z.string().nullable(),
  /** Pre-approved template + its {{n}} variable values — the only WhatsApp option outside the window. */
  whatsapp_template: z.object({ template_id: z.string(), variables: z.array(z.string()) }).nullable(),
  /** When to send, as "YYYY-MM-DD HH:MM" wall-clock time in the accountant's timezone. */
  send_at: z.string().nullable(),
});

export type DecisionResponse = z.infer<typeof DecisionResponseSchema>;

export interface AddDocument {
  name: string;
  description: string | null;
  matched_file_id: string | null;
}

interface DecisionCommon {
  reasoning: string;
  interview_complete: boolean;
  add_documents: AddDocument[];
  collected_document_ids: string[];
  matched_files: MatchedFile[];
}

export type NormalizedDecision =
  | ({ decision: 'goal_complete' } & DecisionCommon)
  | ({
      decision: 'follow_up';
      message: FollowUpMessage;
      /** Validated wall-clock datetime in the accountant's timezone. */
      send_at: string;
    } & DecisionCommon);

export function normalizeDecision(raw: DecisionResponse, ctx: DecisionContext = EMAIL_ONLY_CONTEXT): NormalizedDecision {
  const common: DecisionCommon = {
    reasoning: raw.reasoning,
    interview_complete: raw.interview_complete,
    add_documents: raw.add_documents,
    collected_document_ids: raw.collected_document_ids,
    matched_files: raw.matched_files,
  };
  if (raw.decision === 'goal_complete') {
    return { decision: 'goal_complete', ...common };
  }
  if (raw.send_at == null || !isWallClockDateTime(raw.send_at)) {
    throw new Error(`follow_up decision missing/invalid send_at: ${JSON.stringify(raw)}`);
  }
  return {
    decision: 'follow_up',
    ...common,
    message: normalizeFollowUpMessage(raw, ctx),
    send_at: raw.send_at.trim(),
  };
}
