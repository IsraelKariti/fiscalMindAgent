import * as clients from '../db/queries/clients.js';
import * as llmUsage from '../db/queries/llmUsage.js';
import * as users from '../db/queries/users.js';
import * as clientDocuments from '../db/queries/clientDocuments.js';
import * as documentFiles from '../db/queries/documentFiles.js';
import * as emails from '../db/queries/emails.js';
import * as waSenders from '../db/queries/waSenders.js';
import * as waTemplates from '../db/queries/waTemplates.js';
import { buildPrompt, type WaChannelState } from '../gemini/prompt.js';
import { getPromptTemplate } from '../gemini/promptSettings.js';
import { decide } from '../gemini/decide.js';
import type { DecisionContext } from '../gemini/decisionSchema.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { scheduleDraftMessage } from './scheduleDraftEmail.js';
import { windowCloseTime } from './whatsappWindow.js';
import { zonedTimeToUtc } from '../util/time.js';
import { env } from '../config/env.js';
import { hasPremiumAccess } from '../util/premium.js';
import { logger } from '../util/logger.js';
import type { ClientRow, UserRow } from '../db/types.js';

/**
 * What the agent may do on WhatsApp right now: the accountant must be on the
 * premium plan, the client must be opted in with a valid number, the
 * accountant must have a sender, and there must be something sendable (an
 * open 24h window for free-form text, or at least one approved template).
 */
async function getWaChannelState(client: ClientRow, accountant: UserRow | null, now: Date): Promise<WaChannelState> {
  if (!client.wa_enabled || !client.wa_phone) {
    return {
      allowed: false,
      unavailableReason: 'the client has not opted in to WhatsApp',
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
    };
  }
  // Covers accounts downgraded after opting clients in: enabling anew is
  // blocked at the API, but existing opt-ins must also stop sending.
  if (!accountant || !(await hasPremiumAccess(accountant.email))) {
    return {
      allowed: false,
      unavailableReason: "the accountant's plan does not include WhatsApp",
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
    };
  }
  const sender = client.user_id ? await waSenders.getByUserId(client.user_id) : null;
  if (!sender) {
    return {
      allowed: false,
      unavailableReason: 'no WhatsApp sender number is assigned to the accountant',
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
    };
  }
  const windowClosesAt = windowCloseTime(await emails.lastInboundWhatsAppAt(client.id));
  const windowOpen = windowClosesAt !== null && now < windowClosesAt;
  const templates = await waTemplates.listAll();
  if (!windowOpen && templates.length === 0) {
    return {
      allowed: false,
      unavailableReason: 'the 24h window is closed and no approved templates exist',
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
    };
  }
  return { allowed: true, unavailableReason: null, windowOpen, windowClosesAt, templates };
}

/** Asks the LLM, given the full thread and required-documents list, which documents were just provided and whether a follow-up is needed, and acts on it. */
export async function setFutureEmail(clientId: string): Promise<void> {
  const client = await clients.getById(clientId);
  if (!client) throw new Error(`setFutureEmail: client ${clientId} not found`);
  if (client.goal_status === 'complete') return;
  if (client.paused) {
    // Replies/attachments still land and reach this re-plan path; while paused
    // the agent just never schedules the next send. Resuming re-plans.
    logger.info('client paused, not scheduling a follow-up', { clientId });
    return;
  }

  const now = new Date();
  const accountant = client.user_id ? await users.getById(client.user_id) : null;
  const history = await emails.listForClient(clientId);
  const documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const waState = await getWaChannelState(client, accountant, now);
  const { template } = await getPromptTemplate(client.user_id);
  const { systemInstruction, contents } = buildPrompt(client, accountant, history, documents, files, now, template, waState);
  const ctx: DecisionContext = { whatsappAllowed: waState.allowed, windowOpen: waState.windowOpen, templates: waState.templates };
  const { decision, usage, model } = await decide(systemInstruction, contents, ctx);

  // Bill the tokens to the owning accountant right away, so they count even if
  // acting on the decision fails below. Legacy CLI clients have no owner.
  if (client.user_id) {
    await llmUsage.add(client.user_id, model, usage);
  }

  // Record which pending documents the LLM saw the client provide (unknown ids are ignored).
  const pendingIds = new Set(documents.filter((d) => d.status === 'pending').map((d) => d.id));
  const newlyCollected = decision.collected_document_ids.filter((id) => pendingIds.has(id));
  if (newlyCollected.length > 0) {
    await clientDocuments.markCollected(clientId, newlyCollected);
    logger.info('documents marked collected', { clientId, documentIds: newlyCollected });
  }

  // File a received file under the required document it satisfies (unknown ids are ignored).
  const fileIds = new Set(files.map((f) => f.id));
  const documentIds = new Set(documents.map((d) => d.id));
  for (const match of decision.matched_files) {
    if (!fileIds.has(match.file_id) || !documentIds.has(match.document_id)) continue;
    await documentFiles.linkToDocument(match.file_id, clientId, match.document_id);
    logger.info('file linked to document', { clientId, fileId: match.file_id, documentId: match.document_id });
  }

  // Completion is derived from the documents, not the LLM's decision field: complete iff
  // every required document is collected. Clients with no configured documents fall back
  // to trusting the decision field (legacy behavior).
  const stillPending = pendingIds.size - newlyCollected.length;
  const allCollected = documents.length > 0 ? stillPending === 0 : decision.decision === 'goal_complete';

  if (allCollected) {
    await clients.updateGoalStatus(clientId, 'complete');
    publishClientUpdated(clientId);
    logger.info('goal complete', { clientId, reasoning: decision.reasoning });
    return;
  }

  if (decision.decision === 'goal_complete') {
    // Contract violation (prompt forbids goal_complete with pending documents): there is no
    // drafted email to schedule, so fail loudly and let the caller's retry path re-ask.
    throw new Error(
      `setFutureEmail: LLM returned goal_complete but ${stillPending} document(s) still pending for client ${clientId}`,
    );
  }

  // The LLM answers with a wall-clock datetime in the accountant's timezone.
  const sendAtUtc = zonedTimeToUtc(decision.send_at, env.ACCOUNTANT_TIMEZONE);
  const delayMs = sendAtUtc.getTime() - Date.now();
  if (delayMs < 0) {
    logger.warn('LLM send_at is in the past; sending immediately', { clientId, send_at: decision.send_at });
  }
  const message = decision.message;
  await scheduleDraftMessage(clientId, {
    channel: message.channel,
    subject: message.channel === 'email' ? message.subject : '',
    body: message.channel === 'email' || message.kind === 'freeform' ? message.body : message.renderedBody,
    waContentSid: message.channel === 'whatsapp' && message.kind === 'template' ? message.contentSid : null,
    waContentVariables: message.channel === 'whatsapp' && message.kind === 'template' ? message.variables : null,
    delayMs: Math.max(0, delayMs),
    reasoning: decision.reasoning,
  });
  logger.info('follow-up scheduled', {
    clientId,
    channel: message.channel,
    kind: message.channel === 'whatsapp' ? message.kind : 'email',
    send_at: decision.send_at,
    send_at_utc: sendAtUtc.toISOString(),
    reasoning: decision.reasoning,
  });
}
