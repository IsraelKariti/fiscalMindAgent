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
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { lastInboundMessageAt, rollBlockedSendAt } from '../shared/sendAtGuard.js';
import { MONDAY_STATUS_DOCS_COLLECTED, syncMondayStatus } from '../shared/mondayStatusSync.js';
import { capitalClientTaxYear, resolveTaxYear } from '../shared/taxYear.js';
import { DECLARATION_OF_CAPITAL_PROMPT_TEMPLATE } from '../declarationOfCapital/prompt.js';
import { getCatalogType } from '../declarationOfCapital/catalog.js';
import { verifyCollectedDocument } from '../declarationOfCapital/verifyDocument.js';
import { getPromptTemplate } from '../../gemini/promptSettings.js';
import { decide } from './decide.js';
import { allowedTaxFetchActions, type DecisionContext, type IntakeDecisionState } from './decisionSchema.js';
import { applyTaxFetchAction, loadTaxFetchContexts, pendingKeys } from './taxFetch/flow.js';
import { getProviderSpec } from './taxFetch/providers.js';
import { getAgentTypeIfKnown } from '../registry.js';
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
export async function getWaChannelState(client: ClientRow, now: Date, agentType: string): Promise<WaChannelState> {
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
  const templates = await waTemplates.listForAgentType(agentType);
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
  const agentType = ctx.instance?.agent_type ?? 'doc_collector';
  const isCapitalDeclaration = agentType === 'declaration_of_capital';
  // Capital declaration: the year is per client (from the monday board row) —
  // the instance has no year. Doc collector: the admin-set instance year.
  const taxYear = isCapitalDeclaration ? capitalClientTaxYear(client, now) : resolveTaxYear(ctx.instance, now);
  const whatsappOnly = getAgentTypeIfKnown(agentType)?.whatsappOnly === true;
  const history = await emails.listForClient(clientId);
  let documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const waState = await getWaChannelState(client, now, agentType);
  // A WhatsApp-only agent with nothing sendable has no possible follow-up —
  // fail loudly (drafting-failed marker + manual retry) instead of asking the
  // LLM for a message no channel can carry. Fix by assigning a sender number,
  // opting the client in, or approving a template (waAdmin).
  if (whatsappOnly && !waState.allowed) {
    throw new Error(
      `planFollowUp: agent ${agentType} is WhatsApp-only but the channel is unavailable for client ${clientId}: ${waState.unavailableReason}`,
    );
  }
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
  // Capital-declaration intake: what the validator lets the model resolve, and
  // where the attestation gate stands. The request is trusted only once its
  // draft actually SENT (sent_at set) — an abandoned draft is not a request —
  // and only inbound messages after that send can confirm it.
  let intake: IntakeDecisionState | undefined;
  let attestationConfirmed = false;
  if (isCapitalDeclaration) {
    // The model quotes from the sanitized transcript it reads (bidi/zero-width
    // chars stripped, fences defanged) — validate against that same view, or
    // legitimate quotes of messages with invisible characters would never match.
    const inboundTexts = new Map(
      history
        .filter((m) => m.direction === 'inbound')
        .map((m) => [m.id, `${sanitizeInline(m.subject ?? '', 300)}\n${sanitizeUntrusted(m.body, 10_000)}`] as const),
    );
    attestationConfirmed = typeof client.agent_fields['attestation_confirmed_at'] === 'string';
    const requestEmailId = client.agent_fields['attestation_request_email_id'];
    const requestEmail = typeof requestEmailId === 'string' ? await emails.getById(requestEmailId) : null;
    const requestSentAt = requestEmail?.sent_at ?? null;
    intake = {
      resolvable: documents
        .filter((d) => d.status === 'unresolved' || d.status === 'not_required')
        .map((d) => ({
          id: d.id,
          status: d.status as 'unresolved' | 'not_required',
          multiInstance: (d.type_key ? getCatalogType(d.type_key)?.multiInstance : undefined) ?? false,
        })),
      // Already-resolved catalog rows: anchors for added_instances (ladder
      // escalations, late discoveries) and targets for superseded_documents.
      typedRows: documents
        .filter((d) => d.type_key !== null && d.status !== 'unresolved' && d.status !== 'not_required')
        .map((d) => ({
          id: d.id,
          status: d.status,
          multiInstance: getCatalogType(d.type_key as string)?.multiInstance ?? false,
        })),
      inboundTexts,
      allSettled:
        documents.length > 0 &&
        documents.every((d) => d.status === 'approved' || d.status === 'not_required' || d.status === 'superseded'),
      attestationRequested: requestSentAt !== null,
      confirmableMessageIds: new Set(
        requestSentAt === null
          ? []
          : history
              .filter((m) => m.direction === 'inbound' && (m.sent_at ?? m.created_at) > requestSentAt)
              .map((m) => m.id),
      ),
      attestationConfirmed,
    };
  }

  // The accountant-editable template (legacy setting key) applies to the doc
  // collector only; the declaration-of-capital collector uses its built-in
  // template. Per-agent custom-template keys are deferred work.
  const template = isCapitalDeclaration
    ? DECLARATION_OF_CAPITAL_PROMPT_TEMPLATE
    : (await getPromptTemplate(client.user_id)).template;
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
    taxYear,
    intake
      ? {
          unresolvedCount: intake.resolvable.filter((r) => r.status === 'unresolved').length,
          allSettled: intake.allSettled,
          attestation: intake.attestationConfirmed ? 'confirmed' : intake.attestationRequested ? 'requested' : 'none',
        }
      : undefined,
  );
  const decisionCtx: DecisionContext = {
    emailAllowed: !whatsappOnly,
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
    intake,
  };
  const { decision, usage, model } = await decide(systemInstruction, contents, decisionCtx, {
    log: {
      userId: client.user_id,
      agentInstanceId: client.agent_instance_id,
      clientId,
      purpose: 'conversation_decide',
    },
  });

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
      detail: { agent: agentType, clientName: client.name, reasoning: decision.reasoning },
    });
  }

  // Intake resolutions + ladder actions (capital declaration): already
  // validated against the resolvable/typed rows and the evidence quotes
  // (decisionSchema); the DB guards re-check the statuses. Suppressed
  // wholesale under suspected injection — a hostile message must not be able
  // to shrink the declaration.
  // Rows created directly as 'claimed' (the client says the office already
  // holds the document) feed the same accountant notification as claim-marks.
  const claimedAtCreation: string[] = [];
  let applied = 0;
  if (!decision.suspected_injection && decision.resolutions.length > 0) {
    for (const resolution of decision.resolutions) {
      if (resolution.resolution === 'not_required') {
        const row = await clientDocuments.resolveNotRequired(resolution.documentId, clientId, resolution.evidence);
        if (!row) continue;
        applied += 1;
        recordAudit({
          actorType: 'agent',
          action: 'document.resolved',
          agentInstanceId: client.agent_instance_id,
          clientId,
          targetType: 'client_document',
          targetId: row.id,
          detail: {
            clientName: client.name,
            name: row.name,
            typeKey: row.type_key,
            resolution: 'not_required',
            evidence: resolution.evidence,
          },
        });
      } else {
        const rows = await clientDocuments.resolveRequired(resolution.documentId, clientId, resolution.instances);
        if (!rows) continue;
        applied += 1;
        claimedAtCreation.push(...rows.filter((r) => r.status === 'claimed').map((r) => r.name));
        recordAudit({
          actorType: 'agent',
          action: 'document.resolved',
          agentInstanceId: client.agent_instance_id,
          clientId,
          targetType: 'client_document',
          targetId: resolution.documentId,
          detail: {
            clientName: client.name,
            typeKey: rows[0]?.type_key ?? null,
            resolution: 'required',
            instances: rows.map((r) => r.name),
          },
        });
      }
    }
  }

  // Instance additions after resolution (capital declaration): the
  // requirements-ladder escalation and late discoveries.
  if (!decision.suspected_injection && decision.addedInstances.length > 0) {
    for (const addition of decision.addedInstances) {
      const rows = await clientDocuments.addInstances(addition.anchorDocumentId, clientId, addition.instances);
      if (!rows || rows.length === 0) continue;
      applied += 1;
      claimedAtCreation.push(...rows.filter((r) => r.status === 'claimed').map((r) => r.name));
      recordAudit({
        actorType: 'agent',
        action: 'document.instances_added',
        agentInstanceId: client.agent_instance_id,
        clientId,
        targetType: 'client_document',
        targetId: addition.anchorDocumentId,
        detail: {
          clientName: client.name,
          typeKey: rows[0]?.type_key ?? null,
          instances: rows.map((r) => r.name),
        },
      });
    }
  }

  // Document retirements (capital declaration): the ladder replaced these rows
  // with different documents (evidence-backed; collected/approved rows are
  // valid targets per the office's unit rule).
  if (!decision.suspected_injection && decision.superseded.length > 0) {
    for (const supersession of decision.superseded) {
      const row = await clientDocuments.supersede(supersession.documentId, clientId, supersession.evidence);
      if (!row) continue;
      applied += 1;
      recordAudit({
        actorType: 'agent',
        action: 'document.superseded',
        agentInstanceId: client.agent_instance_id,
        clientId,
        targetType: 'client_document',
        targetId: row.id,
        detail: {
          clientName: client.name,
          name: row.name,
          typeKey: row.type_key,
          evidence: supersession.evidence,
        },
      });
    }
  }

  if (applied > 0) {
    // A reopened checklist voids any earlier attestation — a stale
    // confirmation must never complete the goal over a changed list.
    if (intake && (intake.attestationRequested || intake.attestationConfirmed)) {
      await clients.clearAttestation(clientId);
      attestationConfirmed = false;
    }
    documents = await clientDocuments.listForClient(clientId);
    publishClientUpdated(clientId);
    logger.info('intake changes applied', { clientId, count: applied });
  }
  if (claimedAtCreation.length > 0) {
    // Same accountant touchpoint as claim-marks: rows born 'claimed' ("the
    // office already has it") await the accountant's confirmation too.
    sendClaimedDocumentsEmail(client, claimedAtCreation).catch((err) =>
      logger.error('claimed-documents notification failed', err, { clientId }),
    );
  }

  // Attestation confirmation (capital declaration): validated to cite a real
  // post-summary inbound message; record it with its evidence.
  if (!decision.suspected_injection && decision.attestation?.action === 'confirmed') {
    await clients.setAttestationConfirmed(clientId, decision.attestation.evidence);
    attestationConfirmed = true;
    recordAudit({
      actorType: 'agent',
      action: 'client.attestation_confirmed',
      agentInstanceId: client.agent_instance_id,
      clientId,
      detail: { clientName: client.name, evidence: decision.attestation.evidence },
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

  // Verification pipeline (capital declaration): each just-collected document
  // is verified against the file that earned it — the analyzer's own match
  // (tier A), else the planner's pairing (tier B). Fire-and-forget: a
  // verification hiccup must never fail the planning cycle; the outcome
  // (approved / reopened pending) lands before the next cycle reads statuses.
  if (isCapitalDeclaration && newlyCollected.length > 0) {
    const targets = newlyCollected.flatMap((id) => {
      const tierA = files.find((f) => fileMatchesDocument(f, id));
      const paired = proposedPairs.find((m) => m.document_id === id);
      const fileId = tierA?.id ?? paired?.file_id;
      return fileId ? [{ documentId: id, fileId }] : [];
    });
    void (async () => {
      for (const target of targets) {
        await verifyCollectedDocument(client, ctx.instance, target.documentId, target.fileId);
      }
    })().catch((err) => logger.error('document verification pipeline failed', err, { clientId }));
  }

  // Completion is derived from the documents, not the LLM's decision field.
  // Doc collector: complete iff every required document is collected —
  // 'claimed' rows still need the accountant's confirmation. Declaration of
  // capital: complete iff every row is settled (approved / not_required — the
  // verification pipeline, not receipt, is what closes a document) AND the
  // client confirmed the attestation summary. Clients with no configured
  // documents fall back to trusting the decision field (legacy behavior).
  const collectedCount = documents.filter((d) => d.status === 'collected').length + newlyCollected.length;
  const stillPending = documents.length - collectedCount;
  const allSettled =
    documents.length > 0 &&
    documents.every((d) => d.status === 'approved' || d.status === 'not_required' || d.status === 'superseded');
  const allCollected =
    documents.length > 0
      ? isCapitalDeclaration
        ? allSettled && attestationConfirmed
        : stillPending === 0
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
    await applyTaxFetchAction(client, taxFetchAction, taxFetchTargetCtx, taxFetchKeys, taxYear, { emailId: null, delayMs: 0 });
    await clients.updateGoalStatus(clientId, 'complete');
    // Report the finished collection back to the board row's status column.
    void syncMondayStatus(clientId, MONDAY_STATUS_DOCS_COLLECTED);
    publishClientUpdated(clientId);
    logger.info('goal complete', { clientId, reasoning: decision.reasoning });
    recordAudit({
      actorType: 'agent',
      action: 'goal.completed',
      agentInstanceId: client.agent_instance_id,
      clientId,
      detail: { agent: agentType, clientName: client.name },
    });
    // Fire-and-forget; skipped for document-less clients (trivially "complete"
    // on arrival, e.g. monday imports) where the email would be nonsense.
    if (documents.length > 0) {
      sendGoalCompleteEmail(client).catch((err) => logger.error('goal-complete notification failed', err, { clientId }));
    }
    return;
  }

  if (decision.decision === 'goal_complete') {
    // Contract violation (prompt forbids goal_complete before the goal is actually
    // done): there is no drafted email to schedule, so fail loudly and let the
    // caller's retry path re-ask.
    const why = isCapitalDeclaration
      ? allSettled
        ? 'the attestation is not confirmed'
        : 'documents are still unsettled'
      : `${stillPending} document(s) still pending`;
    throw new Error(`setFutureEmail: LLM returned goal_complete but ${why} for client ${clientId}`);
  }

  // The LLM answers with a wall-clock datetime in the accountant's timezone.
  const sendAtGuard = rollBlockedSendAt(decision.send_at, lastInboundMessageAt(history), now);
  if (sendAtGuard.rolled) {
    logger.warn('proactive send_at fell on a weekend or chag; rolled forward', {
      clientId,
      requested: decision.send_at,
      send_at: sendAtGuard.sendAt,
    });
  }
  const sendAtUtc = zonedTimeToUtc(sendAtGuard.sendAt, env.ACCOUNTANT_TIMEZONE);
  const delayMs = sendAtUtc.getTime() - Date.now();
  if (delayMs < 0) {
    logger.warn('LLM send_at is in the past; sending immediately', { clientId, send_at: sendAtGuard.sendAt });
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
  // Attestation request (capital declaration): this very draft is the closing
  // summary. Stamped by email id — the confirmation validator only trusts it
  // once the row actually sent, so an abandoned draft never becomes a request.
  if (!decision.suspected_injection && decision.attestation?.action === 'request') {
    await clients.setAttestationRequest(clientId, emailId);
    recordAudit({
      actorType: 'agent',
      action: 'client.attestation_requested',
      agentInstanceId: client.agent_instance_id,
      clientId,
      detail: { clientName: client.name, emailId, send_at: sendAtGuard.sendAt },
    });
  }
  // Act on the document-fetch step (client agreed / start login / cancel)
  // after the draft exists: start_login is enqueued against the heads-up draft
  // so the browser login — and the OTP it triggers — can only run after that
  // message actually goes out. (Offers are message text only; nothing to act on.)
  await applyTaxFetchAction(client, taxFetchAction, taxFetchTargetCtx, taxFetchKeys, taxYear, {
    emailId,
    delayMs: Math.max(0, delayMs),
  });
  logger.info('follow-up scheduled', {
    clientId,
    channel: message.channel,
    kind: message.channel === 'whatsapp' ? message.kind : 'email',
    send_at: sendAtGuard.sendAt,
    send_at_utc: sendAtUtc.toISOString(),
    reasoning: decision.reasoning,
  });
}
