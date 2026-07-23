import * as llmUsage from '../../db/queries/llmUsage.js';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as emails from '../../db/queries/emails.js';
import * as waSenders from '../../db/queries/waSenders.js';
import * as waTemplates from '../../db/queries/waTemplates.js';
import { buildPrompt, type WaChannelState } from './prompt.js';
import { sendGoalCompleteEmail } from './notifyAccountant.js';
import { getPromptTemplate } from '../../gemini/promptSettings.js';
import { decide } from './decide.js';
import { allowedTaxFetchActions, type DecisionContext } from './decisionSchema.js';
import { applyTaxFetchAction, loadTaxFetchContext } from './taxFetch/flow.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { scheduleDraftMessage } from '../../orchestration/scheduleDraftEmail.js';
import { windowCloseTime } from '../../orchestration/whatsappWindow.js';
import { zonedTimeToUtc } from '../../util/time.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { ClientRow } from '../../db/types.js';

/**
 * What the agent may do on WhatsApp right now: the client must be opted in
 * with a valid number, the accountant must have a sender, and there must be
 * something sendable (an open 24h window for free-form text, or at least one
 * approved template).
 */
export async function getWaChannelState(client: ClientRow, now: Date): Promise<WaChannelState> {
  if (!client.wa_enabled || !client.wa_phone) {
    return {
      allowed: false,
      unavailableReason: 'the client has not opted in to WhatsApp',
      windowOpen: false,
      windowClosesAt: null,
      templates: [],
    };
  }
  const sender = client.agent_instance_id ? await waSenders.getByInstanceId(client.agent_instance_id) : null;
  if (!sender) {
    return {
      allowed: false,
      unavailableReason: 'no WhatsApp sender number is assigned to this agent',
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
export async function planFollowUp(ctx: AgentContext): Promise<void> {
  const { client, accountant } = ctx;
  const clientId = client.id;
  const now = new Date();
  const history = await emails.listForClient(clientId);
  const documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const waState = await getWaChannelState(client, now);
  const taxFetch = await loadTaxFetchContext(client, documents, waState);
  const taxFetchAllowed = allowedTaxFetchActions(taxFetch.state, taxFetch.available);
  const { template } = await getPromptTemplate(client.user_id);
  const { systemInstruction, contents } = buildPrompt(client, accountant, history, documents, files, now, template, waState, {
    state: taxFetch.state,
    available: taxFetch.available,
    allowedActions: taxFetchAllowed,
  });
  const decisionCtx: DecisionContext = {
    whatsappAllowed: waState.allowed,
    windowOpen: waState.windowOpen,
    templates: waState.templates,
    taxFetch: { state: taxFetch.state, available: taxFetch.available },
  };
  const { decision, usage, model } = await decide(systemInstruction, contents, decisionCtx);

  // Bill the tokens to the owning accountant right away, so they count even if
  // acting on the decision fails below. Legacy CLI clients have no owner.
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
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
    // No message is drafted on this path; a fresh offer can't happen here (no
    // pending 106 left), but cancel/agreed actions still need to land.
    await applyTaxFetchAction(client, decision.tax_fetch_action, taxFetch, now, null);
    await clients.updateGoalStatus(clientId, 'complete');
    publishClientUpdated(clientId);
    logger.info('goal complete', { clientId, reasoning: decision.reasoning });
    // Fire-and-forget; skipped for document-less clients (trivially "complete"
    // on arrival, e.g. monday imports) where the email would be nonsense.
    if (documents.length > 0) {
      sendGoalCompleteEmail(client).catch((err) => logger.error('goal-complete notification failed', err, { clientId }));
    }
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
  const { emailId } = await scheduleDraftMessage(clientId, {
    channel: message.channel,
    subject: message.channel === 'email' ? message.subject : '',
    body: message.channel === 'email' || message.kind === 'freeform' ? message.body : message.renderedBody,
    waContentSid: message.channel === 'whatsapp' && message.kind === 'template' ? message.contentSid : null,
    waContentVariables: message.channel === 'whatsapp' && message.kind === 'template' ? message.variables : null,
    delayMs: Math.max(0, delayMs),
    reasoning: decision.reasoning,
  });
  // Act on the tax-authority 106-fetch step (offer / client agreed / start login /
  // cancel) after the draft exists, so an 'offered' session records which message
  // carries the offer — a superseded draft then re-enables offering.
  await applyTaxFetchAction(client, decision.tax_fetch_action, taxFetch, now, emailId);
  logger.info('follow-up scheduled', {
    clientId,
    channel: message.channel,
    kind: message.channel === 'whatsapp' ? message.kind : 'email',
    send_at: decision.send_at,
    send_at_utc: sendAtUtc.toISOString(),
    reasoning: decision.reasoning,
  });
}
