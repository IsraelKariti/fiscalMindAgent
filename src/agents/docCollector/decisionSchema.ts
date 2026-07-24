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
  /**
   * Tax-authority 106-fetch step, or null. Which values are valid depends on the
   * current fetch state (see the prompt's TAX AUTHORITY 106 FETCH section and
   * allowedTaxFetchActions below).
   */
  tax_fetch_action: z.enum(['offer', 'client_agreed', 'start_login', 'cancel']).nullable(),
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

export type TaxFetchAction = 'offer' | 'client_agreed' | 'start_login' | 'cancel';

export type NormalizedDecision =
  | {
      decision: 'goal_complete';
      reasoning: string;
      collected_document_ids: string[];
      matched_files: MatchedFile[];
      tax_fetch_action: TaxFetchAction | null;
    }
  | {
      decision: 'follow_up';
      reasoning: string;
      collected_document_ids: string[];
      matched_files: MatchedFile[];
      message: FollowUpMessage;
      /** Validated wall-clock datetime in the accountant's timezone. */
      send_at: string;
      tax_fetch_action: TaxFetchAction | null;
    };

/** The tax-fetch situation the validator needs: its state and whether it's on offer. */
export interface TaxFetchDecisionState {
  state: string;
  available: boolean;
  /** The client has written (any channel) since the code-step intro went out — the readiness gate for start_login. */
  clientRepliedSinceIntro: boolean;
}

/** What the surrounding code knows about the WhatsApp channel when validating the LLM's choice. */
export interface DecisionContext {
  /** Client opted in + sender number assigned + something is actually sendable. */
  whatsappAllowed: boolean;
  /** The 24h customer-service window is open (free-form WhatsApp permitted). */
  windowOpen: boolean;
  /** Approved templates the LLM may pick from (by content_sid). */
  templates: WaTemplateRow[];
  /** Tax-fetch state; absent when the capability doesn't apply to this client. */
  taxFetch?: TaxFetchDecisionState;
}

export const EMAIL_ONLY_CONTEXT: DecisionContext = { whatsappAllowed: false, windowOpen: false, templates: [] };

/**
 * The tax_fetch_action values valid in a given state — the single source of
 * truth shared by the prompt (what to tell the LLM it may do) and the validator
 * (what to reject). Offering requires the fetch to be currently available.
 * start_login additionally requires the client to have replied since the intro:
 * the post-send re-plan runs with no new client input, and must never be able
 * to start the login (it triggers a real OTP SMS) off the pre-intro agreement.
 */
export function allowedTaxFetchActions(state: string, available: boolean, clientRepliedSinceIntro: boolean): string[] {
  switch (state) {
    case 'none':
      return available ? ['offer'] : [];
    case 'offered':
      return available ? ['offer', 'client_agreed'] : ['client_agreed'];
    case 'agreed':
    case 'wa_intro_sent':
      return clientRepliedSinceIntro ? ['start_login', 'cancel'] : ['cancel'];
    case 'awaiting_otp':
    case 'in_progress':
      return ['cancel'];
    case 'failed':
      return available ? ['offer'] : [];
    default:
      return [];
  }
}

/** Just the message-shaping fields, so agents reusing this (annual report) needn't carry every field. */
export type FollowUpMessageInput = Pick<
  DecisionResponse,
  'channel' | 'email_subject' | 'email_body' | 'whatsapp_text' | 'whatsapp_template'
>;

export function normalizeFollowUpMessage(raw: FollowUpMessageInput, ctx: DecisionContext): FollowUpMessage {
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

/** Rejects a tax_fetch_action that isn't valid in the current state (contract violation). */
function validateTaxFetchAction(raw: DecisionResponse, ctx: DecisionContext): TaxFetchAction | null {
  const action = raw.tax_fetch_action;
  if (!action) return null;
  const allowed = ctx.taxFetch
    ? allowedTaxFetchActions(ctx.taxFetch.state, ctx.taxFetch.available, ctx.taxFetch.clientRepliedSinceIntro)
    : [];
  if (!allowed.includes(action)) {
    throw new Error(
      `tax_fetch_action "${action}" not allowed in state "${ctx.taxFetch?.state ?? 'none'}" (allowed: ${allowed.join(', ') || 'none'})`,
    );
  }
  return action;
}

export function normalizeDecision(raw: DecisionResponse, ctx: DecisionContext = EMAIL_ONLY_CONTEXT): NormalizedDecision {
  const taxFetchAction = validateTaxFetchAction(raw, ctx);
  if (raw.decision === 'goal_complete') {
    return {
      decision: 'goal_complete',
      reasoning: raw.reasoning,
      collected_document_ids: raw.collected_document_ids,
      matched_files: raw.matched_files,
      tax_fetch_action: taxFetchAction,
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
    tax_fetch_action: taxFetchAction,
  };
}
