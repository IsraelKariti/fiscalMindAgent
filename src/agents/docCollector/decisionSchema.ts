import { z } from 'zod';
import { isWallClockDateTime } from '../../util/time.js';
import { renderTemplateBody } from '../../twilio/renderTemplate.js';
import type { WaTemplateRow } from '../../db/types.js';

// Gemini's `responseJsonSchema` doesn't support Zod's `.optional()` the same way structured
// outputs need every property always present; the "message fields only apply when
// decision === 'follow_up'" rule is expressed as always-present nullable fields plus a
// `decision` discriminator, documented in the prompt and re-checked below.
export const DecisionResponseSchema = z.object({
  decision: z.enum(['goal_complete', 'follow_up']),
  reasoning: z.string(),
  /** Ids from the REQUIRED DOCUMENTS list the thread shows the client has now provided. */
  collected_document_ids: z.array(z.string()),
  /** Which received file satisfies which required document (both by id); empty when nothing new matches. */
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

export interface MatchedFile {
  file_id: string;
  document_id: string;
}

export type FollowUpMessage =
  | { channel: 'email'; subject: string; body: string }
  | { channel: 'whatsapp'; kind: 'freeform'; body: string }
  | { channel: 'whatsapp'; kind: 'template'; contentSid: string; variables: string[]; renderedBody: string };

export type NormalizedDecision =
  | { decision: 'goal_complete'; reasoning: string; collected_document_ids: string[]; matched_files: MatchedFile[] }
  | {
      decision: 'follow_up';
      reasoning: string;
      collected_document_ids: string[];
      matched_files: MatchedFile[];
      message: FollowUpMessage;
      /** Validated wall-clock datetime in the accountant's timezone. */
      send_at: string;
    };

/** What the surrounding code knows about the WhatsApp channel when validating the LLM's choice. */
export interface DecisionContext {
  /** Client opted in + sender number assigned + something is actually sendable. */
  whatsappAllowed: boolean;
  /** The 24h customer-service window is open (free-form WhatsApp permitted). */
  windowOpen: boolean;
  /** Approved templates the LLM may pick from (by content_sid). */
  templates: WaTemplateRow[];
}

export const EMAIL_ONLY_CONTEXT: DecisionContext = { whatsappAllowed: false, windowOpen: false, templates: [] };

function normalizeFollowUpMessage(raw: DecisionResponse, ctx: DecisionContext): FollowUpMessage {
  // Old-style / email answers: a missing channel means email (backward-safe).
  if (raw.channel !== 'whatsapp') {
    if (raw.email_body == null || raw.email_subject == null) {
      throw new Error(`follow_up email decision missing subject/body: ${JSON.stringify(raw)}`);
    }
    return { channel: 'email', subject: raw.email_subject, body: raw.email_body };
  }

  if (!ctx.whatsappAllowed) {
    throw new Error(`follow_up chose whatsapp but the channel is unavailable for this client: ${JSON.stringify(raw)}`);
  }
  if (raw.whatsapp_text != null && raw.whatsapp_text.trim() !== '') {
    if (!ctx.windowOpen) {
      throw new Error(`follow_up chose free-form whatsapp outside the 24h window: ${JSON.stringify(raw)}`);
    }
    return { channel: 'whatsapp', kind: 'freeform', body: raw.whatsapp_text };
  }
  if (raw.whatsapp_template != null) {
    const template = ctx.templates.find((t) => t.content_sid === raw.whatsapp_template!.template_id);
    if (!template) {
      throw new Error(`follow_up chose unknown whatsapp template ${raw.whatsapp_template.template_id}`);
    }
    const variables = raw.whatsapp_template.variables;
    if (variables.length !== template.variable_count) {
      throw new Error(
        `follow_up template ${template.content_sid} expects ${template.variable_count} variables, got ${variables.length}`,
      );
    }
    return {
      channel: 'whatsapp',
      kind: 'template',
      contentSid: template.content_sid,
      variables,
      renderedBody: renderTemplateBody(template.body, variables),
    };
  }
  throw new Error(`follow_up chose whatsapp but filled neither whatsapp_text nor whatsapp_template: ${JSON.stringify(raw)}`);
}

export function normalizeDecision(raw: DecisionResponse, ctx: DecisionContext = EMAIL_ONLY_CONTEXT): NormalizedDecision {
  if (raw.decision === 'goal_complete') {
    return {
      decision: 'goal_complete',
      reasoning: raw.reasoning,
      collected_document_ids: raw.collected_document_ids,
      matched_files: raw.matched_files,
    };
  }
  if (raw.send_at == null || !isWallClockDateTime(raw.send_at)) {
    throw new Error(`follow_up decision missing/invalid send_at: ${JSON.stringify(raw)}`);
  }
  return {
    decision: 'follow_up',
    reasoning: raw.reasoning,
    collected_document_ids: raw.collected_document_ids,
    matched_files: raw.matched_files,
    message: normalizeFollowUpMessage(raw, ctx),
    send_at: raw.send_at.trim(),
  };
}
