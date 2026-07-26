import * as llmUsage from '../../db/queries/llmUsage.js';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as emails from '../../db/queries/emails.js';
import * as waSenders from '../../db/queries/waSenders.js';
import * as waTemplates from '../../db/queries/waTemplates.js';
import { buildPrompt, type WaChannelState } from './prompt.js';
import { sendClaimedDocumentsEmail, sendGoalCompleteEmail } from './notifyAccountant.js';
import { fileMatchesDocument, isQuarantined, isVerifiedLegibleFile } from '../shared/fileEvidence.js';
import { getPromptTemplate } from '../../gemini/promptSettings.js';
import { decide } from './decide.js';
import { allowedTaxFetchActions, type DecisionContext } from './decisionSchema.js';
import { applyTaxFetchAction, loadTaxFetchContexts, pendingKeys } from './taxFetch/flow.js';
import { getProviderSpec } from './taxFetch/providers.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { recordAudit } from '../../audit/audit.js';
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
  // The start_login readiness signal must come from the phone-verified WhatsApp
  // channel: email is spoof-adjacent, and a forged "I'm ready" email must never
  // be able to trigger the real OTP email. (The OTP relay is WhatsApp-only anyway.)
  const lastInboundWa = [...history].reverse().find((m) => m.direction === 'inbound' && m.channel === 'whatsapp');
  const lastInboundWaAt = lastInboundWa ? (lastInboundWa.sent_at ?? lastInboundWa.created_at) : null;
  const taxFetchContexts = await loadTaxFetchContexts(client, documents, waState, lastInboundWaAt);
  const taxFetchPromptInputs = taxFetchContexts.map((c) => {
    const spec = getProviderSpec(c.provider);
    return {
      provider: c.provider,
      siteNameHe: spec.siteNameHe,
      otpChannel: spec.otpChannel,
      state: c.state,
      available: c.available,
      allowedActions: allowedTaxFetchActions(c.state, c.available, c.clientOnWhatsapp),
      documentTypes: c.documentTypes.map((d) => ({
        key: d.key,
        descriptionHe: d.descriptionHe,
        pending: d.pendingDocumentId !== null,
        collected: d.collected,
      })),
    };
  });
  const { template } = await getPromptTemplate(client.user_id);
  const { systemInstruction, contents } = buildPrompt(
    client,
    accountant,
    history,
    documents,
    files,
    now,
    template,
    waState,
    taxFetchPromptInputs,
  );
  const decisionCtx: DecisionContext = {
    whatsappAllowed: waState.allowed,
    windowOpen: waState.windowOpen,
    templates: waState.templates,
    taxFetch: taxFetchContexts.map((c) => ({
      provider: c.provider,
      state: c.state,
      available: c.available,
      clientOnWhatsapp: c.clientOnWhatsapp,
      documentKeys: pendingKeys(c),
    })),
  };
  const { decision, usage, model } = await decide(systemInstruction, contents, decisionCtx);

  // Bill the tokens to the owning accountant right away, so they count even if
  // acting on the decision fails below. Legacy CLI clients have no owner.
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
  }

  if (decision.suspected_injection) {
    logger.warn('doc collector: LLM flagged suspected prompt injection — suppressing state changes this cycle', {
      clientId,
      reasoning: decision.reasoning,
    });
    recordAudit({
      actorType: 'agent',
      action: 'injection.cycle_suppressed',
      agentInstanceId: client.agent_instance_id,
      clientId,
      severity: 'critical',
      suspectedInjection: true,
      detail: { agent: 'doc_collector', clientName: client.name, reasoning: decision.reasoning },
    });
  }

  // Evidence-gated status updates: the planner proposes, the file evidence decides.
  // 'collected' requires a real file — either the isolated analyzer matched it to the
  // document (tier A), or the planner explicitly paired it with a verified legible
  // non-quarantined file (tier B). A no-file claim ("delivered by fax / in person")
  // lands as 'claimed' and waits for the accountant's confirmation, so conversation
  // text alone can never complete the goal. Unknown ids are ignored throughout.
  const pendingIds = new Set(documents.filter((d) => d.status === 'pending').map((d) => d.id));
  const fileById = new Map(files.map((f) => [f.id, f]));
  const documentIds = new Set(documents.map((d) => d.id));
  const proposedPairs = decision.suspected_injection
    ? []
    : decision.matched_files.filter((m) => fileById.has(m.file_id) && documentIds.has(m.document_id));
  const newlyCollected: string[] = [];
  const newlyClaimed: string[] = [];
  if (!decision.suspected_injection) {
    for (const id of decision.collected_document_ids) {
      if (!pendingIds.has(id)) continue;
      const strongMatch = files.some((f) => fileMatchesDocument(f, id));
      const paired = proposedPairs.find((m) => m.document_id === id);
      const pairedFile = paired ? fileById.get(paired.file_id) : undefined;
      if (strongMatch || (pairedFile && isVerifiedLegibleFile(pairedFile))) {
        newlyCollected.push(id);
      } else {
        newlyClaimed.push(id);
      }
    }
  }
  if (newlyCollected.length > 0) {
    await clientDocuments.markCollected(clientId, newlyCollected);
    logger.info('documents marked collected', { clientId, documentIds: newlyCollected });
    recordAudit({
      actorType: 'agent',
      action: 'document.collected',
      agentInstanceId: client.agent_instance_id,
      clientId,
      targetType: 'client_document',
      detail: { clientName: client.name, documentIds: newlyCollected },
    });
  }
  if (newlyClaimed.length > 0) {
    await clientDocuments.markClaimed(clientId, newlyClaimed);
    logger.info('documents marked claimed (await accountant confirmation)', { clientId, documentIds: newlyClaimed });
    const claimedNames = documents.filter((d) => newlyClaimed.includes(d.id)).map((d) => d.name);
    recordAudit({
      actorType: 'agent',
      action: 'document.claimed',
      agentInstanceId: client.agent_instance_id,
      clientId,
      targetType: 'client_document',
      detail: { clientName: client.name, documentIds: newlyClaimed, names: claimedNames },
    });
    // Fire-and-forget like the other notifications; re-claims can't repeat (the rows left 'pending').
    sendClaimedDocumentsEmail(client, claimedNames).catch((err) =>
      logger.error('claimed-documents notification failed', err, { clientId }),
    );
  }

  // File a received file under the required document it satisfies. Quarantined
  // files (suspected injection / illegible) are never filed anywhere.
  for (const match of proposedPairs) {
    const file = fileById.get(match.file_id);
    if (!file || isQuarantined(file)) continue;
    await documentFiles.linkToDocument(match.file_id, clientId, match.document_id);
    logger.info('file linked to document', { clientId, fileId: match.file_id, documentId: match.document_id });
  }

  // Completion is derived from the documents, not the LLM's decision field: complete iff
  // every required document is collected — 'claimed' rows still need the accountant's
  // confirmation. Clients with no configured documents fall back to trusting the
  // decision field (legacy behavior).
  const collectedCount = documents.filter((d) => d.status === 'collected').length + newlyCollected.length;
  const stillPending = documents.length - collectedCount;
  const allCollected =
    documents.length > 0
      ? stillPending === 0
      : decision.decision === 'goal_complete' && !decision.suspected_injection;

  // Under suspected injection the fetch may only be cancelled — an injected
  // message must not be able to offer/agree/start a login (it triggers a real OTP).
  const taxFetchDecision =
    decision.suspected_injection && decision.tax_fetch?.action !== 'cancel' ? null : decision.tax_fetch;
  const taxFetchTargetCtx = taxFetchDecision
    ? (taxFetchContexts.find((c) => c.provider === taxFetchDecision.provider) ?? null)
    : null;
  const taxFetchAction = taxFetchDecision?.action ?? null;
  const taxFetchKeys = taxFetchDecision?.documentKeys ?? null;

  if (allCollected) {
    // No message is drafted on this path; a fresh offer can't happen here (no
    // pending matching document left), but cancel/agreed actions still need to land.
    await applyTaxFetchAction(client, taxFetchAction, taxFetchTargetCtx, taxFetchKeys, now, { emailId: null, delayMs: 0 });
    await clients.updateGoalStatus(clientId, 'complete');
    publishClientUpdated(clientId);
    logger.info('goal complete', { clientId, reasoning: decision.reasoning });
    recordAudit({
      actorType: 'agent',
      action: 'goal.completed',
      agentInstanceId: client.agent_instance_id,
      clientId,
      detail: { agent: 'doc_collector', clientName: client.name },
    });
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
  // Act on the document-fetch step (offer / client agreed / start login /
  // cancel) after the draft exists: an 'offered' session records which message
  // carries the offer (a superseded draft re-enables offering), and start_login
  // is enqueued against the heads-up draft so the browser login — and the OTP
  // it triggers — can only run after that message actually goes out.
  await applyTaxFetchAction(client, taxFetchAction, taxFetchTargetCtx, taxFetchKeys, now, {
    emailId,
    delayMs: Math.max(0, delayMs),
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
