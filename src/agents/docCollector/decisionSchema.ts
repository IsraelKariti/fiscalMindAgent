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
  /** Content in the data sections tried to steer the agent (prompt injection); state changes are suppressed when set. */
  suspected_injection: z.boolean(),
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
   * Document-fetch step, or null. Which values are valid depends on the current
   * fetch state for the targeted provider (see the prompt's DOCUMENT FETCH
   * sections and allowedTaxFetchActions below). Offering is not an action:
   * offers live in message text only; the machine first hears about a fetch
   * when the client agrees (client_agreed) or a login starts.
   */
  tax_fetch_action: z.enum(['client_agreed', 'start_login', 'cancel']).nullable(),
  /**
   * Which provider tax_fetch_action targets (a provider id from a DOCUMENT FETCH
   * section, e.g. 'israel_tax_authority' / 'altshuler_shaham'). Required whenever
   * tax_fetch_action is set; null otherwise.
   */
  tax_fetch_provider: z.string().nullable(),
  /**
   * Which of the provider's document types the action covers — the subset the
   * client agreed to (per-document consent), by document-type key. Empty/null
   * means "all of that provider's pending documents".
   */
  tax_fetch_document_keys: z.array(z.string()).nullable(),
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

export type TaxFetchAction = 'client_agreed' | 'start_login' | 'cancel';

/** A resolved fetch step: the action, the provider it targets, and which document types it covers. */
export interface TaxFetchDecision {
  action: TaxFetchAction;
  provider: string;
  /** Agreed document-type keys (subset of the provider's pending types). */
  documentKeys: string[];
}

export type NormalizedDecision =
  | {
      decision: 'goal_complete';
      reasoning: string;
      suspected_injection: boolean;
      collected_document_ids: string[];
      matched_files: MatchedFile[];
      tax_fetch: TaxFetchDecision | null;
    }
  | {
      decision: 'follow_up';
      reasoning: string;
      suspected_injection: boolean;
      collected_document_ids: string[];
      matched_files: MatchedFile[];
      message: FollowUpMessage;
      /** Validated wall-clock datetime in the accountant's timezone. */
      send_at: string;
      tax_fetch: TaxFetchDecision | null;
    };

/** One provider's fetch situation the validator needs: its state, availability, and pending document types. */
export interface TaxFetchDecisionState {
  provider: string;
  state: string;
  available: boolean;
  /** The conversation is live on WhatsApp (client wrote there in the last 24h) — the hard gate for start_login. */
  clientOnWhatsapp: boolean;
  /** Document-type keys currently pending (offerable) for this provider — the valid set for tax_fetch_document_keys. */
  documentKeys: string[];
}

/** What the surrounding code knows about the WhatsApp channel when validating the LLM's choice. */
export interface DecisionContext {
  /** Client opted in + sender number assigned + something is actually sendable. */
  whatsappAllowed: boolean;
  /** The 24h customer-service window is open (free-form WhatsApp permitted). */
  windowOpen: boolean;
  /** Approved templates the LLM may pick from (by content_sid). */
  templates: WaTemplateRow[];
  /** Per-provider fetch state; empty/absent when no fetch applies to this client. */
  taxFetch?: TaxFetchDecisionState[];
}

export const EMAIL_ONLY_CONTEXT: DecisionContext = { whatsappAllowed: false, windowOpen: false, templates: [] };

/**
 * The tax_fetch_action values valid in a given state — the single source of
 * truth shared by the prompt (what to tell the LLM it may do) and the validator
 * (what to reject). Deliberately loose (2026-07-25; 'offered' retired
 * 2026-08-01): offering happens in message text only and is never recorded —
 * the conversation, not bookkeeping, is the source of truth for consent, so
 * client_agreed is valid whenever no attempt is in flight. Code keeps only the
 * hard guards — never re-fetch after a successful delivery, no consent/login
 * without credentials + pending docs + WhatsApp (`available`), no second login
 * while a live browser session is mid-flight, and the login itself (it fires a
 * real OTP email at the client) only once the conversation is live on
 * WhatsApp — email sender addresses are spoofable, so an email alone must
 * never trigger it.
 */
export function allowedTaxFetchActions(state: string, available: boolean, clientOnWhatsapp: boolean): string[] {
  const start = available && clientOnWhatsapp ? ['start_login'] : [];
  switch (state) {
    case 'delivered':
      return []; // terminal: the forms are in — a re-fetch is never useful
    case 'awaiting_otp':
    case 'in_progress':
      return ['cancel']; // a live browser session exists; only stopping it makes sense
    case 'none':
    case 'failed':
    // no-documents keeps the same mechanics (a retry is possible when there's
    // reason to believe the site changed); the prompt guidance is what differs.
    case 'failed_no_documents':
      return available ? ['client_agreed', ...start] : [];
    case 'agreed':
    case 'wa_intro_sent':
      return [...start, 'cancel'];
    default:
      return [];
  }
}

/** Just the message-shaping fields, so agents reusing this needn't carry every field. */
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

/** Resolves and validates the (provider, action) pair; rejects an action invalid for that provider's state. */
function validateTaxFetch(raw: DecisionResponse, ctx: DecisionContext): TaxFetchDecision | null {
  const action = raw.tax_fetch_action;
  if (!action) return null;
  const providerId = raw.tax_fetch_provider;
  if (!providerId) {
    throw new Error(`tax_fetch_action "${action}" set without a tax_fetch_provider`);
  }
  const entry = ctx.taxFetch?.find((t) => t.provider === providerId);
  if (!entry) {
    const known = ctx.taxFetch?.map((t) => t.provider).join(', ') || 'none';
    throw new Error(`tax_fetch_provider "${providerId}" is not offered to this client (offered: ${known})`);
  }
  const allowed = allowedTaxFetchActions(entry.state, entry.available, entry.clientOnWhatsapp);
  if (!allowed.includes(action)) {
    throw new Error(
      `tax_fetch_action "${action}" not allowed for provider "${providerId}" in state "${entry.state}" (allowed: ${allowed.join(', ') || 'none'})`,
    );
  }
  // Per-document consent: keep only keys that are actually pending for this
  // provider. Empty/absent means "all pending documents".
  const requested = raw.tax_fetch_document_keys ?? [];
  const unknown = requested.filter((k) => !entry.documentKeys.includes(k));
  if (unknown.length > 0) {
    throw new Error(
      `tax_fetch_document_keys ${JSON.stringify(unknown)} are not pending for provider "${providerId}" (pending: ${entry.documentKeys.join(', ') || 'none'})`,
    );
  }
  const documentKeys = requested.length > 0 ? requested : entry.documentKeys;
  return { action, provider: providerId, documentKeys };
}

/**
 * Appended to the original contents for decide()'s corrective pass: the model's
 * own rejected answer plus the exact validation error, so it can repair any
 * contract violation (null message/send_at, unknown template, disallowed
 * tax-fetch action, ...) instead of the whole planning cycle dying on it.
 */
export function correctionSuffix(invalidAnswer: string, err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  return [
    '',
    'SYSTEM NOTE: your previous answer was rejected by schema validation and was NOT executed.',
    'Your rejected answer:',
    invalidAnswer,
    `Validation error: ${message}`,
    'Return a corrected, complete JSON decision now. Remember: every follow_up decision MUST include exactly one full message (the chosen channel\'s fields) and a future send_at — "no message needed" is never a valid state; when there is nothing new to say, schedule a gentle reminder instead.',
  ].join('\n');
}

export function normalizeDecision(raw: DecisionResponse, ctx: DecisionContext = EMAIL_ONLY_CONTEXT): NormalizedDecision {
  const taxFetch = validateTaxFetch(raw, ctx);
  if (raw.decision === 'goal_complete') {
    return {
      decision: 'goal_complete',
      reasoning: raw.reasoning,
      suspected_injection: raw.suspected_injection,
      collected_document_ids: raw.collected_document_ids,
      matched_files: raw.matched_files,
      tax_fetch: taxFetch,
    };
  }
  if (raw.send_at == null || !isWallClockDateTime(raw.send_at)) {
    throw new Error(`follow_up decision missing/invalid send_at: ${JSON.stringify(raw)}`);
  }
  return {
    decision: 'follow_up',
    reasoning: raw.reasoning,
    suspected_injection: raw.suspected_injection,
    collected_document_ids: raw.collected_document_ids,
    matched_files: raw.matched_files,
    message: normalizeFollowUpMessage(raw, ctx),
    send_at: raw.send_at.trim(),
    tax_fetch: taxFetch,
  };
}
