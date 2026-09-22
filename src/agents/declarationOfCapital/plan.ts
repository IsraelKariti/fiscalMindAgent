import * as llmUsage from '../../db/queries/llmUsage.js';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as emails from '../../db/queries/emails.js';
import * as waSenders from '../../db/queries/waSenders.js';
import * as waTemplates from '../../db/queries/waTemplates.js';
import { buildPrompt, type VerificationResultPromptInput, type WaChannelState } from './prompt.js';
import { sendClaimedDocumentsEmail, sendGoalCompleteEmail } from './notifyAccountant.js';
import { applicableFilePairs, fileMatchesDocument, isQuarantined, isVerifiedLegibleFile } from '../shared/fileEvidence.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { lastInboundMessageAt, rollBlockedSendAt } from '../shared/sendAtGuard.js';
import { MONDAY_STATUS_DOCS_COLLECTED, syncMondayStatus } from '../shared/mondayStatusSync.js';
import { capitalClientTaxYear } from '../shared/taxYear.js';
import { getCatalogType } from './catalog.js';
import { recordRerunAfterVerification, verifyBatch } from './verifyDocument.js';
import { shouldWithholdDraft } from './verifyBatchRules.js';
import { childDisplayName } from './splitChildNames.js';
import { assignFilesToNewRows, filterPairsByCompany, type NewRowFiles } from './fileTies.js';
import { additionsStepDetail, collectionsStepDetail, resolutionsStepDetail, retirementsStepDetail } from './applyStepDetails.js';
import { DECLARATION_OF_CAPITAL } from './agentType.js';
import { decide } from './decide.js';
import { allowedTaxFetchActions, type DecisionContext, type IntakeDecisionState } from './decisionSchema.js';
import { applyTaxFetchAction, loadTaxFetchContexts, pendingKeys } from './taxFetch/flow.js';
import { getProviderSpec } from './taxFetch/providers.js';
import { getAgentTypeIfKnown } from '../registry.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { recordAudit, type AuditAction } from '../../audit/audit.js';
import { scheduleDraftMessage } from '../../orchestration/scheduleDraftEmail.js';
import { windowCloseTime } from '../../orchestration/whatsappWindow.js';
import { zonedTimeToUtc } from '../../util/time.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { ClientRow } from '../../db/types.js';

/** Covers a realistic burst of client messages; older drafts add nothing the documents list doesn't already show. */
const MAX_UNSENT_DRAFTS = 5;

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
  const agentType = ctx.instance?.agent_type ?? DECLARATION_OF_CAPITAL;
  // The declaration year is per client (from the monday board row) — the
  // instance has no year.
  const taxYear = capitalClientTaxYear(client, now);
  const history = await emails.listForClient(clientId);
  let documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const waState = await getWaChannelState(client, now, agentType);
  // The agent is WhatsApp-only: with nothing sendable there is no possible
  // follow-up — fail loudly (drafting-failed marker + manual retry) instead of
  // asking the LLM for a message no channel can carry. Fix by assigning a
  // sender number, opting the client in, or approving a template (waAdmin).
  if (!waState.allowed) {
    throw new Error(
      `planFollowUp: the WhatsApp channel is unavailable for client ${clientId}: ${waState.unavailableReason}`,
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
  // Intake: what the validator lets the model resolve, and where the
  // attestation gate stands. The request is trusted only once its draft
  // actually SENT (sent_at set) — an abandoned draft is not a request — and
  // only inbound messages after that send can confirm it.
  // The model quotes from the sanitized transcript it reads (bidi/zero-width
  // chars stripped, fences defanged) — validate against that same view, or
  // legitimate quotes of messages with invisible characters would never match.
  const inboundTexts = new Map(
    history
      .filter((m) => m.direction === 'inbound')
      .map((m) => [m.id, `${sanitizeInline(m.subject ?? '', 300)}\n${sanitizeUntrusted(m.body, 10_000)}`] as const),
  );
  let attestationConfirmed = typeof client.agent_fields['attestation_confirmed_at'] === 'string';
  const requestEmailId = client.agent_fields['attestation_request_email_id'];
  const requestEmail = typeof requestEmailId === 'string' ? await emails.getById(requestEmailId) : null;
  const requestSentAt = requestEmail?.sent_at ?? null;
  const intake: IntakeDecisionState = {
    resolvable: documents
      .filter((d) => d.status === 'unresolved' || d.status === 'not_required')
      .map((d) => ({
        id: d.id,
        status: d.status as 'unresolved' | 'not_required',
        multiInstance: (d.type_key ? getCatalogType(d.type_key)?.multiInstance : undefined) ?? false,
      })),
    // Already-resolved catalog rows: anchors for added_instances (ladder
    // escalations, late discoveries) and targets for retired_documents.
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
      documents.every((d) => d.status === 'approved' || d.status === 'not_required' || d.status === 'retired'),
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

  // The model's own drafts that never went out (replaced by a newer plan, or
  // parked for review) since its last delivered reply — prompt context only.
  // `history` stays delivered-only: every rule above reads what the client saw.
  const lastDeliveredOutboundAt = history.reduce<Date | null>(
    (latest, m) => (m.direction === 'outbound' && m.sent_at && (!latest || m.sent_at > latest) ? m.sent_at : latest),
    null,
  );
  const unsentDrafts = await emails.listUnsentDraftsForClient(clientId, lastDeliveredOutboundAt, MAX_UNSENT_DRAFTS);

  // Follow-up cycle after a verification batch: tell the model which files of
  // THIS turn were just approved or rejected (the reasons live on the rows).
  const verificationResults: VerificationResultPromptInput[] = (ctx.hints?.verificationResults ?? []).flatMap((r) => {
    const doc = documents.find((d) => d.id === r.documentId);
    if (!doc) return [];
    const file = files.find((f) => f.id === r.fileId);
    const reasons = (doc.verification as { reasons?: unknown } | null)?.reasons;
    return [
      {
        documentId: doc.id,
        documentName: doc.name,
        fileId: r.fileId,
        fileName: file ? (file.label ?? file.filename) : r.fileId,
        outcome: r.outcome,
        reasons: Array.isArray(reasons) ? reasons.filter((x): x is string => typeof x === 'string') : [],
      },
    ];
  });

  const { systemInstruction, contents } = buildPrompt(
    client,
    accountant,
    history,
    documents,
    files,
    now,
    waState,
    taxFetchPromptInputs,
    taxYear,
    {
      unresolvedCount: intake.resolvable.filter((r) => r.status === 'unresolved').length,
      allSettled: intake.allSettled,
      attestation: intake.attestationConfirmed ? 'confirmed' : intake.attestationRequested ? 'requested' : 'none',
    },
    unsentDrafts,
    verificationResults,
  );
  const decisionCtx: DecisionContext = {
    // WhatsApp-only: the planner may never choose email.
    emailAllowed: false,
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
      purpose: 'generate_message',
    },
  });

  // Bill the tokens to the owning accountant right away, so they count even if
  // acting on the decision fails below. Legacy CLI clients have no owner.
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
  }

  // Intake resolutions + ladder actions (capital declaration): already
  // validated against the resolvable/typed rows and the evidence quotes
  // (decisionSchema); the DB guards re-check the statuses. The planner gives
  // no injection verdict — that is the dedicated screens' job, before it runs.
  // Rows created directly as 'claimed' (the client says the office already
  // holds the document) feed the same accountant notification as claim-marks.
  const claimedAtCreation: string[] = [];
  let applied = 0;
  // Apply phase: each decision field is executed by its own block below; a
  // block that changed state records one `apply_*` step row (never for a
  // no-op), so the trail reads validate_message → apply_* → send_reply.
  const step = (action: AuditAction, detail: Record<string, unknown>): void =>
    recordAudit({
      actorType: 'system',
      action,
      agentInstanceId: client.agent_instance_id,
      clientId,
      detail: { clientName: client.name, ...detail },
    });
  // Names for the step details (read at call time: `documents` is reloaded
  // after the apply block). Unknown ids fall back to the id itself.
  const docName = (id: string): string | undefined => documents.find((d) => d.id === id)?.name;
  const fileName = (id: string): string | undefined => {
    const f = files.find((x) => x.id === id);
    return f ? (f.label ?? f.filename) : undefined;
  };
  let stepBase = applied;
  // Rows created in this cycle on the client's quoted words, with the waiting
  // files the model named for them (openspec `unlisted-files`).
  const createdWithFiles: NewRowFiles[] = [];
  if (decision.resolutions.length > 0) {
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
        const rows = await clientDocuments.resolveRequired(resolution.documentId, clientId, resolution.instances, resolution.evidence);
        if (!rows) continue;
        applied += 1;
        rows.forEach((row, i) => createdWithFiles.push({ row, fileIds: resolution.instances[i]?.fileIds ?? [] }));
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
            evidence: resolution.evidence,
          },
        });
      }
    }
  }

  if (applied > stepBase) {
    step('apply_resolutions', resolutionsStepDetail(decision.resolutions, docName, applied - stepBase));
    stepBase = applied;
  }

  // Instance additions after resolution (capital declaration): the
  // requirements-ladder escalation and late discoveries.
  if (decision.addedInstances.length > 0) {
    for (const addition of decision.addedInstances) {
      const rows = await clientDocuments.addInstances(addition.anchorDocumentId, clientId, addition.instances, addition.evidence);
      if (!rows || rows.length === 0) continue;
      applied += 1;
      rows.forEach((row, i) => createdWithFiles.push({ row, fileIds: addition.instances[i]?.fileIds ?? [] }));
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
          evidence: addition.evidence,
        },
      });
    }
  }

  if (applied > stepBase) {
    step('apply_additions', additionsStepDetail(decision.addedInstances, docName, applied - stepBase));
    stepBase = applied;
  }

  // Document retirements (capital declaration): the ladder replaced these rows
  // with different documents (evidence-backed; collected/approved rows are
  // valid targets per the office's unit rule).
  if (decision.retired.length > 0) {
    for (const retirement of decision.retired) {
      const row = await clientDocuments.retire(retirement.documentId, clientId, retirement.evidence);
      if (!row) continue;
      applied += 1;
      recordAudit({
        actorType: 'agent',
        action: 'document.retired',
        agentInstanceId: client.agent_instance_id,
        clientId,
        targetType: 'client_document',
        targetId: row.id,
        detail: {
          clientName: client.name,
          name: row.name,
          typeKey: row.type_key,
          evidence: retirement.evidence,
        },
      });
    }
  }

  if (applied > stepBase) {
    step('apply_retirements', retirementsStepDetail(decision.retired, docName, applied - stepBase));
    stepBase = applied;
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
  if (decision.attestation?.action === 'confirmed') {
    await clients.setAttestationConfirmed(clientId, decision.attestation.evidence);
    attestationConfirmed = true;
    recordAudit({
      actorType: 'agent',
      action: 'client.attestation_confirmed',
      agentInstanceId: client.agent_instance_id,
      clientId,
      detail: { clientName: client.name, evidence: decision.attestation.evidence },
    });
    step('apply_attestation', { action: 'confirmed', evidence: decision.attestation.evidence });
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
  // A split parent (058) is never paired: its children are, each on its own.
  // The company check (institutions.ts) then refuses a pair between two
  // different companies, and a pair with a file of an unidentified company
  // unless the client's own words back it; an item that names no company is
  // paired on the type agreement alone.
  const companyChecked = filterPairsByCompany(applicableFilePairs(decision.matched_files, fileById, documentIds), fileById, documents);
  // Files the model named for rows it created in this cycle: code decides which
  // of them a new row may take; an accepted file makes the row collectable now.
  const newRowFiles = ctx.hints?.afterVerification ? { pairs: [], refused: [] } : assignFilesToNewRows(createdWithFiles, fileById);
  const proposedPairs: { file_id: string; document_id: string }[] = [...companyChecked.allowed, ...newRowFiles.pairs];
  const refusedTies = [...companyChecked.refused, ...newRowFiles.refused];
  if (refusedTies.length > 0) logger.warn('file-to-document ties refused', { clientId, refusedTies });
  const proposedCollected = [...new Set([...decision.collected_document_ids, ...newRowFiles.pairs.map((p) => p.document_id)])];
  const newlyCollected: string[] = [];
  const newlyClaimed: string[] = [];
  // A cycle triggered by a verification verdict reports the outcome only: no
  // new file arrived, so nothing may be collected (and therefore nothing can
  // be verified again — the rerun cannot loop).
  if (!ctx.hints?.afterVerification) {
    for (const id of proposedCollected) {
      if (!pendingIds.has(id)) continue;
      const strongMatch = files.some((f) => fileMatchesDocument(f, id));
      const paired = proposedPairs.find((m) => m.document_id === id);
      const pairedFile = paired ? fileById.get(paired.file_id) : undefined;
      if (strongMatch || (pairedFile && isVerifiedLegibleFile(pairedFile))) {
        newlyCollected.push(id);
      } else if (refusedTies.some((r) => r.document_id === id)) {
        // The model rested this on a file code refused to tie to the document:
        // that is not a "delivered another way" claim — the row stays pending.
        continue;
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
      detail: { clientName: client.name, documentIds: newlyCollected, names: newlyCollected.map((id) => docName(id) ?? id) },
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
    // A child cut out of a multi-document PDF carries the name of its list
    // document: keep it in step when the planner files it under another row.
    if (file.parent_file_id !== null) {
      await documentFiles.setLabel(file.id, childDisplayName(docName(match.document_id)));
    }
    logger.info('file linked to document', { clientId, fileId: match.file_id, documentId: match.document_id });
  }

  if (newlyCollected.length + newlyClaimed.length + proposedPairs.length + refusedTies.length > 0) {
    step(
      'apply_collections',
      collectionsStepDetail(
        { proposed: proposedCollected, collected: newlyCollected, claimed: newlyClaimed, pairs: proposedPairs, refused: refusedTies },
        docName,
        fileName,
      ),
    );
  }

  // Verification pipeline (openspec `verification-reply`): each just-collected
  // document is verified against the file that earned it — the analyzer's own
  // match (tier A), else the planner's pairing (tier B). This cycle's message
  // was written BEFORE any verdict ("thank you, received" for a file that may
  // be rejected a minute later), so it is withheld: never stored, never
  // scheduled. The batch is verified inline — under the caller's client lock,
  // inside the same drafting attempt, so a restart cannot lose the reply — and
  // ONE follow-up cycle then writes the reply with every verdict in view.
  // Message-bound actions (attestation request, fetch action) are left to it.
  const verificationTargets = newlyCollected.flatMap((id) => {
    const tierA = files.find((f) => fileMatchesDocument(f, id));
    const paired = proposedPairs.find((m) => m.document_id === id);
    const fileId = tierA?.id ?? paired?.file_id;
    return fileId ? [{ documentId: id, fileId }] : [];
  });
  if (shouldWithholdDraft({ afterVerification: ctx.hints?.afterVerification === true, targets: verificationTargets })) {
    step('withhold_reply', {
      reason: 'awaiting_verification',
      documentIds: verificationTargets.map((t) => t.documentId),
      names: verificationTargets.map((t) => docName(t.documentId) ?? t.documentId),
    });
    logger.info('draft withheld until the collected documents are verified', {
      clientId,
      documentIds: verificationTargets.map((t) => t.documentId),
    });
    const results = await verifyBatch(client, ctx.instance, verificationTargets);
    await recordRerunAfterVerification(client, results);
    const fresh = await clients.getById(clientId);
    if (!fresh) return;
    // The hint blocks collecting, so the follow-up has no targets: depth 1, no loop.
    return planFollowUp({ ...ctx, client: fresh, hints: { ...ctx.hints, afterVerification: true, verificationResults: results } });
  }

  // Completion is derived from the documents, not the LLM's decision field:
  // complete iff every row is settled (approved / not_required / retired — the
  // verification pipeline, not receipt, is what closes a document) AND the
  // client confirmed the attestation summary. Clients with no configured
  // documents fall back to trusting the decision field (legacy behavior).
  const allSettled =
    documents.length > 0 &&
    documents.every((d) => d.status === 'approved' || d.status === 'not_required' || d.status === 'retired');
  const allCollected =
    documents.length > 0 ? allSettled && attestationConfirmed : decision.decision === 'goal_complete';

  const taxFetchDecision = decision.tax_fetch;
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
    const why = allSettled ? 'the attestation is not confirmed' : 'documents are still unsettled';
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
  step('send_reply', {
    emailId,
    channel: message.channel,
    kind: message.channel === 'whatsapp' ? message.kind : 'email',
    send_at: sendAtGuard.sendAt,
    chars: (message.channel === 'email' || message.kind === 'freeform' ? message.body : message.renderedBody).length,
  });
  // Attestation request (capital declaration): this very draft is the closing
  // summary. Stamped by email id — the confirmation validator only trusts it
  // once the row actually sent, so an abandoned draft never becomes a request.
  if (decision.attestation?.action === 'request') {
    await clients.setAttestationRequest(clientId, emailId);
    recordAudit({
      actorType: 'agent',
      action: 'client.attestation_requested',
      agentInstanceId: client.agent_instance_id,
      clientId,
      detail: { clientName: client.name, emailId, send_at: sendAtGuard.sendAt },
    });
    step('apply_attestation', { action: 'request', emailId });
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
