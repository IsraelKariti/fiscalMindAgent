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
  /**
   * Capital-declaration intake resolutions (null/empty for other agents): each
   * entry settles one catalog row based on an explicit client statement.
   * 'not_required' requires evidence (a verbatim quote from a stored inbound
   * message); 'required' turns the row into 1..N concrete pending documents.
   */
  resolved_documents: z
    .array(
      z.object({
        document_id: z.string(),
        resolution: z.enum(['required', 'not_required']),
        /** For 'required' only: the concrete instances the client described ("two cars" → two entries). */
        instances: z
          .array(
            z.object({
              name: z.string(),
              description: z.string().nullable(),
              /** The client says the office already holds this document — it starts as 'claimed' (awaits the accountant) instead of being requested. */
              already_provided: z.boolean(),
            }),
          )
          .nullable(),
        /** For 'not_required': the client statement this rests on — a real inbound message_id + verbatim quote. */
        evidence: z.object({ message_id: z.string(), quote: z.string() }).nullable(),
      }),
    )
    .nullable(),
  /**
   * Capital-declaration instance additions (null/empty otherwise): new concrete
   * documents for a type that was ALREADY resolved — the requirements-ladder
   * escalation (the replacement documents when the client can't provide the
   * original set) or a late discovery ("actually there's a third account").
   * anchor_document_id is any existing checklist row of that type.
   */
  added_instances: z
    .array(
      z.object({
        anchor_document_id: z.string(),
        instances: z.array(
          z.object({ name: z.string(), description: z.string().nullable(), already_provided: z.boolean() }),
        ),
      }),
    )
    .nullable(),
  /**
   * Capital-declaration document retirements (null/empty otherwise): checklist
   * rows that are no longer needed because the requirements ladder replaced
   * them with different documents (e.g. contract + appendix → assessment +
   * Tabu; the two are one unit — if either is unobtainable, retire both, even
   * one already received). Each entry needs evidence: the verbatim client
   * statement the retirement rests on.
   */
  superseded_documents: z
    .array(
      z.object({
        document_id: z.string(),
        evidence: z.object({ message_id: z.string(), quote: z.string() }).nullable(),
      }),
    )
    .nullable(),
  /**
   * Capital-declaration attestation gate (null for other agents): 'request' —
   * this decision's message IS the closing completeness summary (valid only
   * when every row is settled); 'confirmed' — the client explicitly confirmed
   * the summary (requires attestation_evidence citing a post-request inbound
   * message).
   */
  attestation: z.enum(['request', 'confirmed']).nullable(),
  attestation_evidence: z.object({ message_id: z.string(), quote: z.string() }).nullable(),
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

/** A verbatim client statement (message id + quote) an intake decision rests on. */
export interface EvidenceRef {
  message_id: string;
  quote: string;
}

/** One concrete instance a resolution/addition creates; alreadyProvided rows start 'claimed'. */
export interface ResolvedInstance {
  name: string;
  description: string | null;
  alreadyProvided: boolean;
}

/** One validated intake resolution (capital declaration). */
export type DocumentResolution =
  | { documentId: string; resolution: 'not_required'; evidence: EvidenceRef }
  | { documentId: string; resolution: 'required'; instances: ResolvedInstance[] };

/** One validated instance addition to an already-resolved type (capital declaration). */
export interface InstanceAddition {
  anchorDocumentId: string;
  instances: ResolvedInstance[];
}

/** One validated document retirement (capital declaration): the ladder replaced it. */
export interface DocumentSupersession {
  documentId: string;
  evidence: EvidenceRef;
}

/** A validated attestation step (capital declaration). */
export type AttestationDecision = { action: 'request' } | { action: 'confirmed'; evidence: EvidenceRef };

export type NormalizedDecision =
  | {
      decision: 'goal_complete';
      reasoning: string;
      suspected_injection: boolean;
      collected_document_ids: string[];
      matched_files: MatchedFile[];
      tax_fetch: TaxFetchDecision | null;
      resolutions: DocumentResolution[];
      addedInstances: InstanceAddition[];
      superseded: DocumentSupersession[];
      attestation: AttestationDecision | null;
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
      resolutions: DocumentResolution[];
      addedInstances: InstanceAddition[];
      superseded: DocumentSupersession[];
      attestation: AttestationDecision | null;
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

/** One checklist row the intake may resolve, and what the catalog allows for it. */
export interface ResolvableRow {
  id: string;
  /** 'unresolved' may go either way; 'not_required' may only be reopened to required (a client correction). */
  status: 'unresolved' | 'not_required';
  /** The catalog type allows more than one concrete instance (cars, accounts…). */
  multiInstance: boolean;
}

/**
 * The capital-declaration intake state the validator needs. Absent for other
 * agent types — any intake field the model sets is then rejected outright.
 */
/** One already-resolved catalog row — a valid anchor for added_instances / target for superseded_documents. */
export interface TypedRow {
  id: string;
  /** Current status (anything past 'unresolved'). */
  status: string;
  /** The catalog type allows more than one concrete instance. */
  multiInstance: boolean;
}

export interface IntakeDecisionState {
  /** Rows an intake resolution may target. */
  resolvable: ResolvableRow[];
  /** Catalog rows already resolved (status past 'unresolved'/'not_required') — the pool added_instances anchors to and superseded_documents may retire. */
  typedRows: TypedRow[];
  /** Inbound message texts by id — the only pool evidence quotes may cite. */
  inboundTexts: Map<string, string>;
  /** Every checklist row is settled (approved / not_required) — precondition for attestation 'request'. */
  allSettled: boolean;
  /** The attestation summary was actually SENT (not merely drafted). */
  attestationRequested: boolean;
  /** Ids of inbound messages received after the sent request — the only valid confirmation sources. */
  confirmableMessageIds: Set<string>;
  /** Confirmation already recorded — no further attestation action is valid. */
  attestationConfirmed: boolean;
}

/** What the surrounding code knows about the WhatsApp channel when validating the LLM's choice. */
export interface DecisionContext {
  /** False for WhatsApp-only agents: the email channel may never be chosen. Undefined = allowed. */
  emailAllowed?: boolean;
  /** Client opted in + sender number assigned + something is actually sendable. */
  whatsappAllowed: boolean;
  /** The 24h customer-service window is open (free-form WhatsApp permitted). */
  windowOpen: boolean;
  /** Approved templates the LLM may pick from (by content_sid). */
  templates: WaTemplateRow[];
  /** Per-provider fetch state; empty/absent when no fetch applies to this client. */
  taxFetch?: TaxFetchDecisionState[];
  /** Capital-declaration intake state; absent for other agent types. */
  intake?: IntakeDecisionState;
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
    if (ctx.emailAllowed === false) {
      throw new Error(`follow_up chose email but this agent messages on WhatsApp only — set channel to "whatsapp": ${JSON.stringify(raw)}`);
    }
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

/** Hard cap on concrete instances one resolution may create (the checklist is not a spreadsheet). */
const MAX_RESOLUTION_INSTANCES = 10;

/** Whitespace-insensitive containment — the transcript the model quotes from collapses whitespace differently than the raw body. */
function quoteAppearsIn(quote: string, text: string): boolean {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
  const q = norm(quote);
  return q.length > 0 && norm(text).includes(q);
}

/** Validates one evidence ref against the stored inbound messages; returns it normalized. */
function validateEvidence(
  evidence: { message_id: string; quote: string } | null,
  inboundTexts: Map<string, string>,
  what: string,
): EvidenceRef {
  if (!evidence) throw new Error(`${what} requires evidence ({message_id, quote}) and none was given`);
  const text = inboundTexts.get(evidence.message_id);
  if (text === undefined) {
    throw new Error(`${what}: evidence message_id "${evidence.message_id}" is not a stored inbound message of this client`);
  }
  if (!quoteAppearsIn(evidence.quote, text)) {
    throw new Error(`${what}: evidence quote is not contained verbatim in message ${evidence.message_id}`);
  }
  return { message_id: evidence.message_id, quote: evidence.quote };
}

/**
 * Validates the intake resolutions (capital declaration): only resolvable rows
 * move, 'not_required' never without a verbatim client quote, instance counts
 * only where the catalog allows them. The LLM proposes, this decides.
 */
function validateResolutions(raw: DecisionResponse, ctx: DecisionContext): DocumentResolution[] {
  const entries = raw.resolved_documents ?? [];
  if (entries.length === 0) return [];
  const intake = ctx.intake;
  if (!intake) throw new Error('resolved_documents is not applicable to this agent — leave it null');

  const byId = new Map(intake.resolvable.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const result: DocumentResolution[] = [];
  for (const entry of entries) {
    if (seen.has(entry.document_id)) throw new Error(`resolved_documents targets document ${entry.document_id} twice`);
    seen.add(entry.document_id);
    const row = byId.get(entry.document_id);
    if (!row) {
      throw new Error(`resolved_documents: document ${entry.document_id} is not a resolvable (unresolved/not_required) row of this client`);
    }
    if (entry.resolution === 'not_required') {
      if (row.status !== 'unresolved') {
        throw new Error(`resolved_documents: document ${entry.document_id} is already not_required`);
      }
      const evidence = validateEvidence(entry.evidence, intake.inboundTexts, `not_required resolution of ${entry.document_id}`);
      result.push({ documentId: entry.document_id, resolution: 'not_required', evidence });
      continue;
    }
    const instances = normalizeInstances(entry.instances ?? [], row.multiInstance, `required resolution of ${entry.document_id}`);
    result.push({ documentId: entry.document_id, resolution: 'required', instances });
  }
  return result;
}

/** Shared instance normalization + caps for resolutions and post-resolution additions. */
function normalizeInstances(
  raw: { name: string; description: string | null; already_provided: boolean }[],
  multiInstance: boolean,
  what: string,
): ResolvedInstance[] {
  const instances = raw.map((i) => ({
    name: i.name.trim(),
    description: i.description?.trim() || null,
    alreadyProvided: i.already_provided,
  }));
  if (instances.length === 0) {
    throw new Error(`${what} needs at least one instance ({name, description})`);
  }
  if (instances.some((i) => i.name.length === 0 || i.name.length > 200)) {
    throw new Error(`${what}: every instance needs a name of 1-200 characters`);
  }
  if (instances.length > 1 && !multiInstance) {
    throw new Error(`${what}: this document type allows a single instance only`);
  }
  if (instances.length > MAX_RESOLUTION_INSTANCES) {
    throw new Error(`${what}: at most ${MAX_RESOLUTION_INSTANCES} instances`);
  }
  return instances;
}

/**
 * Validates post-resolution instance additions (capital declaration): the
 * anchor must be one of the client's already-resolved catalog rows of a
 * multi-instance type. The LLM proposes, this decides.
 */
function validateAddedInstances(raw: DecisionResponse, ctx: DecisionContext): InstanceAddition[] {
  const entries = raw.added_instances ?? [];
  if (entries.length === 0) return [];
  const intake = ctx.intake;
  if (!intake) throw new Error('added_instances is not applicable to this agent — leave it null');

  const byId = new Map(intake.typedRows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const result: InstanceAddition[] = [];
  for (const entry of entries) {
    if (seen.has(entry.anchor_document_id)) {
      throw new Error(`added_instances anchors on document ${entry.anchor_document_id} twice — merge the entries`);
    }
    seen.add(entry.anchor_document_id);
    const anchor = byId.get(entry.anchor_document_id);
    if (!anchor) {
      throw new Error(
        `added_instances: document ${entry.anchor_document_id} is not an already-resolved catalog row of this client — unresolved rows go through resolved_documents`,
      );
    }
    if (!anchor.multiInstance) {
      throw new Error(`added_instances: the type of document ${entry.anchor_document_id} allows a single instance only`);
    }
    const instances = normalizeInstances(entry.instances, true, `added_instances for ${entry.anchor_document_id}`);
    result.push({ anchorDocumentId: entry.anchor_document_id, instances });
  }
  return result;
}

/**
 * Validates document retirements (capital declaration): only the client's
 * already-resolved catalog rows may be superseded, never without the verbatim
 * client statement the retirement rests on. Rows already collected/approved
 * ARE valid targets — the office's unit rule retires a fulfilled document when
 * its counterpart is unobtainable.
 */
function validateSuperseded(raw: DecisionResponse, ctx: DecisionContext): DocumentSupersession[] {
  const entries = raw.superseded_documents ?? [];
  if (entries.length === 0) return [];
  const intake = ctx.intake;
  if (!intake) throw new Error('superseded_documents is not applicable to this agent — leave it null');

  const byId = new Map(intake.typedRows.map((r) => [r.id, r]));
  const seen = new Set<string>();
  const result: DocumentSupersession[] = [];
  for (const entry of entries) {
    if (seen.has(entry.document_id)) throw new Error(`superseded_documents targets document ${entry.document_id} twice`);
    seen.add(entry.document_id);
    const row = byId.get(entry.document_id);
    if (!row) {
      throw new Error(
        `superseded_documents: document ${entry.document_id} is not an already-resolved catalog row of this client`,
      );
    }
    if (row.status === 'superseded') {
      throw new Error(`superseded_documents: document ${entry.document_id} is already superseded`);
    }
    const evidence = validateEvidence(entry.evidence, intake.inboundTexts, `superseding of ${entry.document_id}`);
    result.push({ documentId: entry.document_id, evidence });
  }
  return result;
}

/**
 * Validates the attestation step (capital declaration): 'request' only once
 * every row is settled (this decision's message is the summary, so follow_up
 * only); 'confirmed' only for a sent request, citing a post-request inbound
 * message verbatim.
 */
function validateAttestation(raw: DecisionResponse, ctx: DecisionContext): AttestationDecision | null {
  if (!raw.attestation) return null;
  const intake = ctx.intake;
  if (!intake) throw new Error('attestation is not applicable to this agent — leave it null');
  if (intake.attestationConfirmed) {
    throw new Error('attestation is already confirmed for this client — leave the field null');
  }
  if (raw.attestation === 'request') {
    if (raw.decision !== 'follow_up') {
      throw new Error("attestation 'request' must come with a follow_up decision — the scheduled message IS the summary");
    }
    const changesThisCycle =
      (raw.resolved_documents ?? []).length + (raw.added_instances ?? []).length + (raw.superseded_documents ?? []).length;
    if (!intake.allSettled || changesThisCycle > 0) {
      throw new Error("attestation 'request' is valid only when every document is already settled (approved / not_required) and no new resolutions, additions or supersessions are being made");
    }
    return { action: 'request' };
  }
  if (!intake.attestationRequested) {
    throw new Error("attestation 'confirmed' is invalid — no attestation summary has been sent to the client yet");
  }
  const evidence = validateEvidence(raw.attestation_evidence, intake.inboundTexts, "attestation 'confirmed'");
  if (!intake.confirmableMessageIds.has(evidence.message_id)) {
    throw new Error("attestation 'confirmed': the cited message predates the attestation summary — only a reply to the summary can confirm it");
  }
  return { action: 'confirmed', evidence };
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
  const resolutions = validateResolutions(raw, ctx);
  const addedInstances = validateAddedInstances(raw, ctx);
  const superseded = validateSuperseded(raw, ctx);
  const attestation = validateAttestation(raw, ctx);
  if (raw.decision === 'goal_complete') {
    return {
      decision: 'goal_complete',
      reasoning: raw.reasoning,
      suspected_injection: raw.suspected_injection,
      collected_document_ids: raw.collected_document_ids,
      matched_files: raw.matched_files,
      tax_fetch: taxFetch,
      resolutions,
      addedInstances,
      superseded,
      attestation,
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
    resolutions,
    addedInstances,
    superseded,
    attestation,
  };
}
