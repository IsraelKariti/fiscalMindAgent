import * as llmUsage from '../../db/queries/llmUsage.js';
import * as clients from '../../db/queries/clients.js';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as emails from '../../db/queries/emails.js';
import * as auditEvents from '../../db/queries/auditEvents.js';
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
import { approvedPropertyFilesOf, provenFactsLine, provenFactsOf } from './provenFacts.js';
import { recordRerunAfterVerification, verifyBatch } from './verifyDocument.js';
import { childDisplayName } from './splitChildNames.js';
import { assignFilesToNewRows, filterPairsByCompany, type NewRowFiles } from './fileTies.js';
import { planCompanySplit } from './companySplit.js';
import { lostFilesByMessage } from './lostFiles.js';
import {
  additionsStepDetail,
  collectionsStepDetail,
  resolutionsStepDetail,
  retirementsStepDetail,
  type CompanySplitDetail,
} from './applyStepDetails.js';
import { DECLARATION_OF_CAPITAL } from './agentType.js';
import { decide } from './decide.js';
import { allowedTaxFetchActions, type DecisionContext, type IntakeDecisionState, type NormalizedDecision } from './decisionSchema.js';
import { applyTaxFetchAction, loadTaxFetchContexts, pendingKeys, type TaxFetchContext } from './taxFetch/flow.js';
import { getProviderSpec } from './taxFetch/providers.js';
import { clientIdNumber } from './taxFetch/clientId.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { recordAudit, type AuditAction } from '../../audit/audit.js';
import { scheduleDraftMessage } from '../../orchestration/scheduleDraftEmail.js';
import { windowCloseTime } from '../../orchestration/whatsappWindow.js';
import { zonedTimeToUtc } from '../../util/time.js';
import { env } from '../../config/env.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { ClientDocumentRow, ClientRow, DocumentFileRow, EmailRow } from '../../db/types.js';

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

/**
 * One planning cycle in progress: what every step below shares. `documents`
 * and `attestationConfirmed` are reloaded or changed by the apply steps; the
 * other fields are the snapshot the cycle started from (`files` on purpose:
 * the verification targets read the pre-link snapshot).
 */
interface PlanRun {
  ctx: AgentContext;
  client: ClientRow;
  clientId: string;
  now: Date;
  agentType: string;
  /** The declaration year is per client (from the monday board row) — the instance has no year. */
  taxYear: number;
  /** The follow-up cycle after a verification batch: report the outcomes, collect nothing. */
  afterVerification: boolean;
  /** Delivered messages only: every rule reads what the client saw. */
  history: EmailRow[];
  documents: ClientDocumentRow[];
  files: DocumentFileRow[];
  fileById: Map<string, DocumentFileRow>;
  waState: WaChannelState;
  taxFetchContexts: TaxFetchContext[];
  intake: IntakeDecisionState;
  attestationConfirmed: boolean;
}

/** The answer that carries a message to send. */
type FollowUpDecision = Extract<NormalizedDecision, { decision: 'follow_up' }>;

/** What the apply steps changed on the checklist in this cycle. */
interface ChecklistChanges {
  /** How many decision items changed state (one per resolution, addition or retirement that landed). */
  applied: number;
  /** Rows created in this cycle on the client's quoted words, with the waiting files the model named for them (openspec `unlisted-files`). */
  createdWithFiles: NewRowFiles[];
  /** Rows born 'claimed' (the client says the office already holds the document): the accountant is told once. */
  claimedAtCreation: string[];
}

/** What the collect step decided and did: the input of the verification targets and of the apply_collections row. */
interface CollectionOutcome {
  newlyCollected: string[];
  newlyClaimed: string[];
  proposedCollected: string[];
  proposedPairs: { file_id: string; document_id: string }[];
  refusedTies: ReturnType<typeof assignFilesToNewRows>['refused'];
  splitDetail: CompanySplitDetail;
  /** Items the split renamed or created: their verification file is this cycle's pair, never a stale strong match. */
  splitTouched: Set<string>;
}

/**
 * Asks the LLM, given the full thread and required-documents list, which
 * documents were just provided and whether a follow-up is needed, and acts on
 * it. One named function per step; the trail reads validate_message →
 * apply_* → (withhold_reply → verify → rerun) → send_reply.
 */
export async function planFollowUp(ctx: AgentContext): Promise<void> {
  const run = await loadPlanningContext(ctx);
  const decision = await askPlanner(run);
  const changes: ChecklistChanges = { applied: 0, createdWithFiles: [], claimedAtCreation: [] };
  await applyResolutions(run, decision, changes);
  await applyAdditions(run, decision, changes);
  await applyRetirements(run, decision, changes);
  await settleChecklistChanges(run, changes);
  await applyAttestationConfirmed(run, decision);
  const collection = await collectFiles(run, decision, changes);
  if (decision.decision === 'collect') return verifyThenReplan(run, collection);
  if (await completeGoalIfDone(run, decision)) return;
  if (decision.decision !== 'follow_up') return; // unreachable: 'collect' returned above, goal_complete ended the cycle or threw
  await scheduleReply(run, decision);
}

/** One `apply_*` / `withhold_reply` / `send_reply` step row of this cycle. Never written for a no-op. */
function recordPlannerStep(run: PlanRun, action: AuditAction, detail: Record<string, unknown>): void {
  recordAudit({
    actorType: 'system',
    action,
    agentInstanceId: run.client.agent_instance_id,
    clientId: run.clientId,
    detail: { clientName: run.client.name, ...detail },
  });
}

/** The name of a checklist row at call time (`documents` is reloaded by the apply steps). Unknown ids give undefined. */
function docName(run: PlanRun, id: string): string | undefined {
  return run.documents.find((d) => d.id === id)?.name;
}

function fileName(run: PlanRun, id: string): string | undefined {
  const f = run.files.find((x) => x.id === id);
  return f ? (f.label ?? f.filename) : undefined;
}

/**
 * Everything the cycle reads before the model is asked: the thread, the
 * checklist, the files, the lost files, the WhatsApp channel, the fetch
 * contexts and the intake state. Throws when no WhatsApp channel is usable.
 */
async function loadPlanningContext(ctx: AgentContext): Promise<PlanRun> {
  const { client } = ctx;
  const clientId = client.id;
  const now = new Date();
  const agentType = ctx.instance?.agent_type ?? DECLARATION_OF_CAPITAL;
  const taxYear = capitalClientTaxYear(client, now);
  const history = await emails.listForClient(clientId);
  const documents = await clientDocuments.listForClient(clientId);
  const files = await documentFiles.listForClient(clientId);
  const waState = await loadWaChannelOrThrow(client, now, agentType);
  const taxFetchContexts = await loadTaxFetchContexts(client, documents, waState, lastInboundWhatsAppAt(history));
  const { intake, attestationConfirmed } = await buildIntakeState(client, history, documents);
  return {
    ctx,
    client,
    clientId,
    now,
    agentType,
    taxYear,
    afterVerification: ctx.hints?.afterVerification === true,
    history,
    documents,
    files,
    fileById: new Map(files.map((f) => [f.id, f])),
    waState,
    taxFetchContexts,
    intake,
    attestationConfirmed,
  };
}

/**
 * The agent is WhatsApp-only: with nothing sendable there is no possible
 * follow-up — fail loudly (drafting-failed marker + manual retry) instead of
 * asking the LLM for a message no channel can carry. Fix by assigning a
 * sender number, opting the client in, or approving a template (waAdmin).
 */
async function loadWaChannelOrThrow(client: ClientRow, now: Date, agentType: string): Promise<WaChannelState> {
  const waState = await getWaChannelState(client, now, agentType);
  if (!waState.allowed) {
    throw new Error(`planFollowUp: the WhatsApp channel is unavailable for client ${client.id}: ${waState.unavailableReason}`);
  }
  return waState;
}

/**
 * When the client last wrote on WhatsApp. The start_login readiness signal
 * must come from the phone-verified WhatsApp channel: email is
 * spoof-adjacent, and a forged "I'm ready" email must never be able to
 * trigger the real OTP email. (The OTP relay is WhatsApp-only anyway.)
 */
function lastInboundWhatsAppAt(history: readonly EmailRow[]): Date | null {
  const lastInboundWa = [...history].reverse().find((m) => m.direction === 'inbound' && m.channel === 'whatsapp');
  return lastInboundWa ? (lastInboundWa.sent_at ?? lastInboundWa.created_at) : null;
}

/**
 * Intake: what the validator lets the model resolve, and where the
 * attestation gate stands. The request is trusted only once its draft
 * actually SENT (sent_at set) — an abandoned draft is not a request — and
 * only inbound messages after that send can confirm it.
 */
async function buildIntakeState(
  client: ClientRow,
  history: readonly EmailRow[],
  documents: readonly ClientDocumentRow[],
): Promise<{ intake: IntakeDecisionState; attestationConfirmed: boolean }> {
  // The model quotes from the sanitized transcript it reads (bidi/zero-width
  // chars stripped, fences defanged) — validate against that same view, or
  // legitimate quotes of messages with invisible characters would never match.
  const inboundTexts = new Map(
    history
      .filter((m) => m.direction === 'inbound')
      .map((m) => [m.id, `${sanitizeInline(m.subject ?? '', 300)}\n${sanitizeUntrusted(m.body, 10_000)}`] as const),
  );
  const attestationConfirmed = typeof client.agent_fields['attestation_confirmed_at'] === 'string';
  const requestEmailId = client.agent_fields['attestation_request_email_id'];
  const requestEmail = typeof requestEmailId === 'string' ? await emails.getById(requestEmailId) : null;
  const requestSentAt = requestEmail?.sent_at ?? null;
  const intake: IntakeDecisionState = {
    resolvable: documents
      .filter((d) => d.status === 'unresolved' || d.status === 'not_required')
      .map((d) => ({
        id: d.id,
        status: d.status as 'unresolved' | 'not_required',
        typeKey: d.type_key,
        multiInstance: (d.type_key ? getCatalogType(d.type_key)?.multiInstance : undefined) ?? false,
      })),
    // Already-resolved catalog rows: anchors for added_instances (ladder
    // escalations, late discoveries) and targets for retired_documents.
    typedRows: documents
      .filter((d) => d.type_key !== null && d.status !== 'unresolved' && d.status !== 'not_required')
      .map((d) => ({
        id: d.id,
        status: d.status,
        typeKey: d.type_key,
        multiInstance: getCatalogType(d.type_key as string)?.multiInstance ?? false,
        paperKey: d.paper_key,
      })),
    inboundTexts,
    // The approved property papers the planner may cite instead of a quote
    // (openspec `real-estate-goal-driven-clarification`).
    approvedPropertyFiles: approvedPropertyFilesOf(documents),
    allSettled: allDocumentsSettled(documents),
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
  return { intake, attestationConfirmed };
}

/** Every row is settled: approved, not needed, or retired. The verification pipeline, not receipt, is what closes a document. */
function allDocumentsSettled(documents: readonly ClientDocumentRow[]): boolean {
  return documents.length > 0 && documents.every((d) => d.status === 'approved' || d.status === 'not_required' || d.status === 'retired');
}

/**
 * The generate_message call: builds the prompt from the snapshot, asks the
 * model (decide: validate_message with at most one corrective retry), and
 * bills the tokens to the owning accountant right away, so they count even
 * if acting on the decision fails afterwards. Legacy CLI clients have no owner.
 */
async function askPlanner(run: PlanRun): Promise<NormalizedDecision> {
  const { client, clientId } = run;
  const { systemInstruction, contents } = await buildPlannerPrompt(run);
  const { decision, usage, model } = await decide(systemInstruction, contents, buildDecisionContext(run), {
    log: {
      userId: client.user_id,
      agentInstanceId: client.agent_instance_id,
      clientId,
      purpose: 'generate_message',
    },
  });
  if (client.user_id) {
    await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
  }
  return decision;
}

/** The system prompt and the fenced data of this cycle (buildPrompt), with the prompt-only context: fetch states, unsent drafts, verification results, lost files. */
async function buildPlannerPrompt(run: PlanRun): Promise<{ systemInstruction: string; contents: string }> {
  const { ctx, client, clientId, history, documents, files, now, waState, taxYear, intake } = run;
  // Files the client sent that never arrived (openspec `inbound-files`): the
  // model must ask for them again, not read the caption as the document.
  const lostFiles = lostFilesByMessage(
    await auditEvents.listForClientAction(clientId, 'file.ingest_failed'),
    files.map((f) => f.provider_attachment_id),
  );
  const { systemInstruction, contents } = buildPrompt(
    client,
    ctx.accountant,
    history,
    documents,
    files,
    now,
    waState,
    taxFetchPromptInputs(run),
    taxYear,
    {
      unresolvedCount: intake.resolvable.filter((r) => r.status === 'unresolved').length,
      allSettled: intake.allSettled,
      attestation: intake.attestationConfirmed ? 'confirmed' : intake.attestationRequested ? 'requested' : 'none',
    },
    await loadUnsentDrafts(run),
    verificationResultsForPrompt(run),
    run.afterVerification,
    (await clientIdNumber(client, 'israel_tax_authority')) !== null,
    lostFiles,
  );
  return { systemInstruction, contents };
}

/** The document-fetch section of the prompt: per website, its state and the actions the model may pick. */
function taxFetchPromptInputs(run: PlanRun) {
  return run.taxFetchContexts.map((c) => {
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
}

/**
 * The model's own drafts that never went out (replaced by a newer plan, or
 * parked for review) since its last delivered reply — prompt context only.
 * `history` stays delivered-only: every rule reads what the client saw.
 */
async function loadUnsentDrafts(run: PlanRun) {
  const lastDeliveredOutboundAt = run.history.reduce<Date | null>(
    (latest, m) => (m.direction === 'outbound' && m.sent_at && (!latest || m.sent_at > latest) ? m.sent_at : latest),
    null,
  );
  return emails.listUnsentDraftsForClient(run.clientId, lastDeliveredOutboundAt, MAX_UNSENT_DRAFTS);
}

/**
 * Follow-up cycle after a verification batch: tell the model which files of
 * THIS turn were just approved or rejected (the reasons live on the rows).
 */
function verificationResultsForPrompt(run: PlanRun): VerificationResultPromptInput[] {
  return (run.ctx.hints?.verificationResults ?? []).flatMap((r) => {
    const doc = run.documents.find((d) => d.id === r.documentId);
    if (!doc) return [];
    const file = run.files.find((f) => f.id === r.fileId);
    const reasons = (doc.verification as { reasons?: unknown } | null)?.reasons;
    return [
      {
        documentId: doc.id,
        documentName: doc.name,
        fileId: r.fileId,
        fileName: file ? (file.label ?? file.filename) : r.fileId,
        outcome: r.outcome,
        reasons: Array.isArray(reasons) ? reasons.filter((x): x is string => typeof x === 'string') : [],
        // What an approved property paper proved (openspec `real-estate-goal-driven-clarification`).
        provenFacts: provenFactsLine(provenFactsOf(doc)),
      },
    ];
  });
}

/** What the validate_message gate is allowed to accept in this cycle. */
function buildDecisionContext(run: PlanRun): DecisionContext {
  return {
    // WhatsApp-only: the planner may never choose email.
    emailAllowed: false,
    // The follow-up cycle after a verification batch may not collect again.
    afterVerification: run.afterVerification,
    whatsappAllowed: run.waState.allowed,
    windowOpen: run.waState.windowOpen,
    templates: run.waState.templates,
    taxFetch: run.taxFetchContexts.map((c) => ({
      provider: c.provider,
      state: c.state,
      available: c.available,
      clientOnWhatsapp: c.clientOnWhatsapp,
      documentKeys: pendingKeys(c),
    })),
    intake: run.intake,
  };
}

/**
 * apply_resolutions — intake resolutions (capital declaration): already
 * validated against the resolvable rows and the evidence quotes
 * (decisionSchema); the DB guards re-check the statuses. The planner gives no
 * injection verdict — that is the dedicated screens' job, before it runs.
 */
async function applyResolutions(run: PlanRun, decision: NormalizedDecision, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  const before = changes.applied;
  for (const resolution of decision.resolutions) {
    if (resolution.resolution === 'not_required') {
      const row = await clientDocuments.resolveNotRequired(resolution.documentId, clientId, resolution.evidence);
      if (!row) continue;
      changes.applied += 1;
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
      changes.applied += 1;
      rows.forEach((row, i) => changes.createdWithFiles.push({ row, fileIds: resolution.instances[i]?.fileIds ?? [] }));
      changes.claimedAtCreation.push(...rows.filter((r) => r.status === 'claimed').map((r) => r.name));
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
  if (changes.applied > before) {
    recordPlannerStep(run, 'apply_resolutions', resolutionsStepDetail(decision.resolutions, (id) => docName(run, id), changes.applied - before));
  }
}

/**
 * apply_additions — instance additions after resolution (capital
 * declaration): the requirements-ladder escalation and late discoveries.
 */
async function applyAdditions(run: PlanRun, decision: NormalizedDecision, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  const before = changes.applied;
  for (const addition of decision.addedInstances) {
    const rows = await clientDocuments.addInstances(addition.anchorDocumentId, clientId, addition.instances, addition.evidence);
    if (!rows || rows.length === 0) continue;
    changes.applied += 1;
    rows.forEach((row, i) => changes.createdWithFiles.push({ row, fileIds: addition.instances[i]?.fileIds ?? [] }));
    changes.claimedAtCreation.push(...rows.filter((r) => r.status === 'claimed').map((r) => r.name));
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
  if (changes.applied > before) {
    recordPlannerStep(run, 'apply_additions', additionsStepDetail(decision.addedInstances, (id) => docName(run, id), changes.applied - before));
  }
}

/**
 * apply_retirements — document retirements (capital declaration): the ladder
 * replaced these rows with different documents (evidence-backed;
 * collected/approved rows are valid targets per the office's unit rule).
 */
async function applyRetirements(run: PlanRun, decision: NormalizedDecision, changes: ChecklistChanges): Promise<void> {
  const { client, clientId } = run;
  const before = changes.applied;
  for (const retirement of decision.retired) {
    const row = await clientDocuments.retire(retirement.documentId, clientId, retirement.evidence);
    if (!row) continue;
    changes.applied += 1;
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
  if (changes.applied > before) {
    recordPlannerStep(run, 'apply_retirements', retirementsStepDetail(decision.retired, (id) => docName(run, id), changes.applied - before));
  }
}

/**
 * After the checklist changed: a reopened checklist voids any earlier
 * attestation (a stale confirmation must never complete the goal over a
 * changed list), the documents are reloaded, and the accountant hears about
 * rows born 'claimed' — the same touchpoint as claim-marks.
 */
async function settleChecklistChanges(run: PlanRun, changes: ChecklistChanges): Promise<void> {
  const { client, clientId, intake } = run;
  if (changes.applied > 0) {
    if (intake && (intake.attestationRequested || intake.attestationConfirmed)) {
      await clients.clearAttestation(clientId);
      run.attestationConfirmed = false;
    }
    run.documents = await clientDocuments.listForClient(clientId);
    publishClientUpdated(clientId);
    logger.info('intake changes applied', { clientId, count: changes.applied });
  }
  if (changes.claimedAtCreation.length > 0) {
    sendClaimedDocumentsEmail(client, changes.claimedAtCreation).catch((err) =>
      logger.error('claimed-documents notification failed', err, { clientId }),
    );
  }
}

/**
 * apply_attestation (confirmed) — the client confirmed the closing summary:
 * validated to cite a real post-summary inbound message; recorded with its
 * evidence.
 */
async function applyAttestationConfirmed(run: PlanRun, decision: NormalizedDecision): Promise<void> {
  if (decision.attestation?.action !== 'confirmed') return;
  const { client, clientId } = run;
  await clients.setAttestationConfirmed(clientId, decision.attestation.evidence);
  run.attestationConfirmed = true;
  recordAudit({
    actorType: 'agent',
    action: 'client.attestation_confirmed',
    agentInstanceId: client.agent_instance_id,
    clientId,
    detail: { clientName: client.name, evidence: decision.attestation.evidence },
  });
  recordPlannerStep(run, 'apply_attestation', { action: 'confirmed', evidence: decision.attestation.evidence });
}

/**
 * apply_collections — evidence-gated status updates: the planner proposes,
 * the file evidence decides. 'collected' requires a real file — either the
 * isolated analyzer matched it to the document (tier A), or the planner
 * explicitly paired it with a verified legible non-quarantined file (tier B).
 * A no-file claim ("delivered by fax / in person") lands as 'claimed' and
 * waits for the accountant's confirmation, so conversation text alone can
 * never complete the goal. Unknown ids are ignored throughout.
 *
 * In order: the company/employer split of the tied items, the collect-or-claim
 * decision, the status writes, the file links, the step row.
 */
async function collectFiles(run: PlanRun, decision: NormalizedDecision, changes: ChecklistChanges): Promise<CollectionOutcome> {
  const { clientId, fileById } = run;
  const pendingIds = new Set(run.documents.filter((d) => d.status === 'pending').map((d) => d.id));
  const documentIds = new Set(run.documents.map((d) => d.id));
  // A split parent (058) is never paired: its children are, each on its own.
  // The company check (institutions.ts) then refuses a pair between two
  // different companies, and a pair with a file of an unidentified company
  // unless the client's own words back it; an item that names no company is
  // paired on the type agreement alone.
  const companyChecked = filterPairsByCompany(applicableFilePairs(decision.matched_files, fileById, documentIds), fileById, run.documents);
  const { splitPairs, splitDetail, pairs: splitAllowedPairs } = await splitItemsByCompany(run, companyChecked.allowed);
  const splitTouched = new Set([...splitDetail.renamed.map((r) => r.documentId), ...splitDetail.created.map((c) => c.documentId)]);
  for (const c of splitDetail.created) pendingIds.add(c.documentId); // born pending, after the snapshot above
  // Files the model named for rows it created in this cycle: code decides which
  // of them a new row may take; an accepted file makes the row collectable now.
  const newRowFiles = run.afterVerification ? { pairs: [], refused: [] } : assignFilesToNewRows(changes.createdWithFiles, fileById);
  const proposedPairs: { file_id: string; document_id: string }[] = [...splitAllowedPairs, ...splitPairs, ...newRowFiles.pairs];
  const refusedTies = [...companyChecked.refused, ...newRowFiles.refused];
  if (refusedTies.length > 0) logger.warn('file-to-document ties refused', { clientId, refusedTies });
  const modelCollected = new Set(decision.collected_document_ids);
  const proposedCollected = [
    ...new Set([
      ...decision.collected_document_ids,
      ...newRowFiles.pairs.map((p) => p.document_id),
      // A row the split created is collected when its source item was.
      ...splitDetail.created.filter((c) => modelCollected.has(c.fromDocumentId)).map((c) => c.documentId),
    ]),
  ];
  const { newlyCollected, newlyClaimed } = decideCollectOrClaim(run, proposedCollected, pendingIds, proposedPairs, refusedTies);
  await markCollected(run, newlyCollected);
  await markClaimed(run, newlyClaimed);
  await linkFilesToDocuments(run, proposedPairs);
  const outcome: CollectionOutcome = { newlyCollected, newlyClaimed, proposedCollected, proposedPairs, refusedTies, splitDetail, splitTouched };
  recordApplyCollectionsStep(run, outcome);
  return outcome;
}

/**
 * Per-company split (openspec `unlisted-files`): an item that names no
 * company ("ביטוח מנהלים ניב") takes the name of the first company whose
 * file is tied to it, and every further company gets its own sibling row —
 * code over this cycle's allowed pairs (planCompanySplit, pure), before the
 * collect decision, so each resulting row is collected and verified on its
 * own file. Skipped in the follow-up cycle after verification (no new file
 * arrived). Returns the pairs re-pointed at the rows that now hold them.
 */
async function splitItemsByCompany(
  run: PlanRun,
  allowedPairs: ReturnType<typeof filterPairsByCompany>['allowed'],
): Promise<{ pairs: ReturnType<typeof filterPairsByCompany>['allowed']; splitPairs: { file_id: string; document_id: string }[]; splitDetail: CompanySplitDetail }> {
  const { client, clientId, fileById } = run;
  const split = run.afterVerification
    ? { renames: [], created: [], pairs: allowedPairs }
    : planCompanySplit(allowedPairs, fileById, run.documents);
  const splitPairs: { file_id: string; document_id: string }[] = [];
  const splitDetail: CompanySplitDetail = { renamed: [], created: [] };
  if (split.renames.length > 0 || split.created.length > 0) {
    // Every item the split touched: renamed, given siblings, or both (an item
    // that already names its company is divided by employer without a rename;
    // its unchanged name still goes through the write, which is what checks
    // the row is live).
    const touchedIds = [...new Set([...split.renames.map((r) => r.documentId), ...split.created.map((c) => c.fromDocumentId)])];
    const items = touchedIds.map((documentId) => ({
      documentId,
      newName: split.renames.find((r) => r.documentId === documentId)?.newName ?? (docName(run, documentId) ?? ''),
      siblings: split.created.filter((c) => c.fromDocumentId === documentId).map((c) => ({ name: c.name, evidence: c.evidence })),
    }));
    const { created, skipped } = await clientDocuments.splitByCompany(clientId, items);
    items.forEach((item, i) => {
      const siblings = split.created.filter((c) => c.fromDocumentId === item.documentId);
      const rows = created[i] ?? [];
      if (skipped.includes(item.documentId)) {
        // The head raced out of a live status: nothing of this item changed,
        // so the files planned for siblings go back to the head as before.
        for (const c of siblings) for (const fileId of c.fileIds) splitPairs.push({ file_id: fileId, document_id: item.documentId });
        return;
      }
      const rename = split.renames.find((r) => r.documentId === item.documentId);
      if (rename) splitDetail.renamed.push(rename);
      siblings.forEach((c, j) => {
        const row = rows[j];
        if (!row) {
          for (const fileId of c.fileIds) splitPairs.push({ file_id: fileId, document_id: item.documentId });
          return;
        }
        for (const fileId of c.fileIds) splitPairs.push({ file_id: fileId, document_id: row.id });
        splitDetail.created.push({ documentId: row.id, name: row.name, fromDocumentId: item.documentId, fileId: c.evidence.file_id, employer: c.employer });
        recordAudit({
          actorType: 'system',
          action: 'document.instances_added',
          agentInstanceId: client.agent_instance_id,
          clientId,
          targetType: 'client_document',
          targetId: item.documentId,
          detail: {
            clientName: client.name,
            typeKey: row.type_key,
            instances: [row.name],
            evidence: c.evidence,
            reason: c.employer !== null ? 'employer_split' : 'company_split',
            fromName: rename?.oldName ?? item.newName,
          },
        });
      });
    });
    logger.info('items split by company and employer', {
      clientId,
      renamed: splitDetail.renamed.map((r) => ({ id: r.documentId, name: r.newName })),
      created: splitDetail.created.map((c) => ({ id: c.documentId, name: c.name })),
      skipped,
    });
    run.documents = await clientDocuments.listForClient(clientId);
    publishClientUpdated(clientId);
  }
  return { pairs: split.pairs, splitPairs, splitDetail };
}

/**
 * Collect or claim: a proposed document is collected when a real file earned
 * it (a strong analyzer match, or a verified legible pair); it is claimed
 * when the client says it was delivered another way; it stays pending when
 * the model rested it on a file code refused to tie. A cycle triggered by a
 * verification verdict reports the outcome only: no new file arrived, so
 * nothing may be collected (and therefore nothing can be verified again —
 * the rerun cannot loop).
 */
function decideCollectOrClaim(
  run: PlanRun,
  proposedCollected: readonly string[],
  pendingIds: ReadonlySet<string>,
  proposedPairs: readonly { file_id: string; document_id: string }[],
  refusedTies: readonly { document_id: string }[],
): { newlyCollected: string[]; newlyClaimed: string[] } {
  const newlyCollected: string[] = [];
  const newlyClaimed: string[] = [];
  if (run.afterVerification) return { newlyCollected, newlyClaimed };
  for (const id of proposedCollected) {
    if (!pendingIds.has(id)) continue;
    const strongMatch = run.files.some((f) => fileMatchesDocument(f, id));
    const paired = proposedPairs.find((m) => m.document_id === id);
    const pairedFile = paired ? run.fileById.get(paired.file_id) : undefined;
    if (strongMatch || (pairedFile && isVerifiedLegibleFile(pairedFile))) {
      newlyCollected.push(id);
    } else if (refusedTies.some((r) => r.document_id === id)) {
      continue;
    } else {
      newlyClaimed.push(id);
    }
  }
  return { newlyCollected, newlyClaimed };
}

/** The documents a real file earned become 'collected'. */
async function markCollected(run: PlanRun, newlyCollected: string[]): Promise<void> {
  if (newlyCollected.length === 0) return;
  const { client, clientId } = run;
  await clientDocuments.markCollected(clientId, newlyCollected);
  logger.info('documents marked collected', { clientId, documentIds: newlyCollected });
  recordAudit({
    actorType: 'agent',
    action: 'document.collected',
    agentInstanceId: client.agent_instance_id,
    clientId,
    targetType: 'client_document',
    detail: { clientName: client.name, documentIds: newlyCollected, names: newlyCollected.map((id) => docName(run, id) ?? id) },
  });
}

/** The documents the client says were delivered another way become 'claimed' and wait for the accountant's confirmation. */
async function markClaimed(run: PlanRun, newlyClaimed: string[]): Promise<void> {
  if (newlyClaimed.length === 0) return;
  const { client, clientId } = run;
  await clientDocuments.markClaimed(clientId, newlyClaimed);
  logger.info('documents marked claimed (await accountant confirmation)', { clientId, documentIds: newlyClaimed });
  const claimedNames = run.documents.filter((d) => newlyClaimed.includes(d.id)).map((d) => d.name);
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

/**
 * File a received file under the required document it satisfies. Quarantined
 * files (suspected injection / illegible) are never filed anywhere. A child
 * cut out of a multi-document PDF carries the name of its list document: kept
 * in step when the planner files it under another row.
 */
async function linkFilesToDocuments(run: PlanRun, proposedPairs: readonly { file_id: string; document_id: string }[]): Promise<void> {
  const { clientId, fileById } = run;
  for (const match of proposedPairs) {
    const file = fileById.get(match.file_id);
    if (!file || isQuarantined(file)) continue;
    await documentFiles.linkToDocument(match.file_id, clientId, match.document_id);
    if (file.parent_file_id !== null) {
      await documentFiles.setLabel(file.id, childDisplayName(docName(run, match.document_id)));
    }
    logger.info('file linked to document', { clientId, fileId: match.file_id, documentId: match.document_id });
  }
}

/** The apply_collections step row: what was proposed, collected, claimed, paired, refused and split. Never for a no-op. */
function recordApplyCollectionsStep(run: PlanRun, o: CollectionOutcome): void {
  if (o.newlyCollected.length + o.newlyClaimed.length + o.proposedPairs.length + o.refusedTies.length === 0) return;
  recordPlannerStep(
    run,
    'apply_collections',
    collectionsStepDetail(
      {
        proposed: o.proposedCollected,
        collected: o.newlyCollected,
        claimed: o.newlyClaimed,
        pairs: o.proposedPairs,
        refused: o.refusedTies,
        split: o.splitDetail.renamed.length > 0 || o.splitDetail.created.length > 0 ? o.splitDetail : undefined,
      },
      (id) => docName(run, id),
      (id) => fileName(run, id),
    ),
  );
}

/**
 * Which file each just-collected document is verified against: the
 * analyzer's own match (tier A), else the planner's pairing (tier B).
 * `files` is oldest-first: when several files match the same item (a re-sent
 * report after a failed check), the newest one is the file the client just
 * sent, so it is the one to verify. An item the split touched is verified
 * against the file tied to it in this cycle: `files` is the pre-link
 * snapshot, so a sibling's file (whose stored match still names the head)
 * would otherwise pass as the head's.
 */
function pickVerificationTargets(run: PlanRun, o: CollectionOutcome): { documentId: string; fileId: string }[] {
  return o.newlyCollected.flatMap((id) => {
    const tierA = [...run.files].reverse().find((f) => fileMatchesDocument(f, id));
    const paired = o.proposedPairs.find((m) => m.document_id === id);
    const fileId = o.splitTouched.has(id) ? (paired?.file_id ?? tierA?.id) : (tierA?.id ?? paired?.file_id);
    return fileId ? [{ documentId: id, fileId }] : [];
  });
}

/**
 * withhold_reply → verify → planner.rerun_after_verification — the collect
 * branch (openspec `verification-reply`): a collecting answer carries no
 * message (the gate rejects one), so the batch is verified inline — under the
 * caller's client lock, inside the same drafting attempt, so a restart cannot
 * lose the reply — and ONE follow-up cycle then writes the reply with every
 * verdict in view. Message-bound actions (attestation request, fetch action)
 * are absent from the collecting answer; the follow-up cycle decides them.
 * The branch keys on the decision value, not on the targets: it runs even
 * when the code refused every tie or every collected document was claimed
 * without a file (an empty batch). The follow-up cycle's schema has no
 * 'collect', so this recursion is depth 1.
 */
async function verifyThenReplan(run: PlanRun, o: CollectionOutcome): Promise<void> {
  const { ctx, client, clientId } = run;
  const verificationTargets = pickVerificationTargets(run, o);
  recordPlannerStep(run, 'withhold_reply', {
    reason: 'awaiting_verification',
    documentIds: o.newlyCollected,
    names: o.newlyCollected.map((id) => docName(run, id) ?? id),
    verified: verificationTargets.length,
  });
  logger.info('reply deferred until the collected documents are verified', {
    clientId,
    documentIds: o.newlyCollected,
    verified: verificationTargets.length,
  });
  const results = await verifyBatch(client, ctx.instance, verificationTargets);
  await recordRerunAfterVerification(client, results);
  const fresh = await clients.getById(clientId);
  if (!fresh) return;
  return planFollowUp({ ...ctx, client: fresh, hints: { ...ctx.hints, afterVerification: true, verificationResults: results } });
}

/**
 * goal.completed — completion is derived from the documents, not the LLM's
 * decision field: complete iff every row is settled AND the client confirmed
 * the attestation summary. Clients with no configured documents fall back to
 * trusting the decision field (legacy behavior). A goal_complete answer
 * before the goal is actually done is a contract violation: there is no
 * drafted message to schedule, so it throws and the caller's retry path
 * re-asks. Returns true when the cycle ends here.
 */
async function completeGoalIfDone(run: PlanRun, decision: NormalizedDecision): Promise<boolean> {
  const { client, clientId, documents, agentType, taxYear } = run;
  const allSettled = allDocumentsSettled(documents);
  const allCollected = documents.length > 0 ? allSettled && run.attestationConfirmed : decision.decision === 'goal_complete';
  if (allCollected) {
    // No message is drafted on this path; a fresh offer can't happen here (no
    // pending matching document left), but cancel/agreed actions still need to land.
    const fetch = taxFetchDecisionOf(run, decision);
    await applyTaxFetchAction(client, fetch.action, fetch.targetCtx, fetch.keys, taxYear, { emailId: null, delayMs: 0 });
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
    return true;
  }
  if (decision.decision === 'goal_complete') {
    const why = allSettled ? 'the attestation is not confirmed' : 'documents are still unsettled';
    throw new Error(`setFutureEmail: LLM returned goal_complete but ${why} for client ${clientId}`);
  }
  return false;
}

/** The document-fetch step the model chose (client agreed / start login / cancel), with the website it is about. */
function taxFetchDecisionOf(run: PlanRun, decision: NormalizedDecision) {
  const taxFetchDecision = decision.tax_fetch;
  return {
    action: taxFetchDecision?.action ?? null,
    targetCtx: taxFetchDecision ? (run.taxFetchContexts.find((c) => c.provider === taxFetchDecision.provider) ?? null) : null,
    keys: taxFetchDecision?.documentKeys ?? null,
  };
}

/**
 * send_reply — the follow-up message: its send time is rolled off weekends
 * and chagim (sendAtGuard), the draft is scheduled (review mode or the send
 * job), the attestation request is stamped on this very draft when the
 * message is the closing summary, and the document-fetch action lands after
 * the draft exists (start_login is enqueued against the heads-up draft, so
 * the browser login — and the OTP it triggers — can only run after that
 * message actually goes out).
 */
async function scheduleReply(run: PlanRun, decision: FollowUpDecision): Promise<void> {
  const { client, clientId, history, now, taxYear } = run;
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
  recordPlannerStep(run, 'send_reply', {
    emailId,
    channel: message.channel,
    kind: message.channel === 'whatsapp' ? message.kind : 'email',
    send_at: sendAtGuard.sendAt,
    chars: (message.channel === 'email' || message.kind === 'freeform' ? message.body : message.renderedBody).length,
  });
  await applyAttestationRequest(run, decision, emailId, sendAtGuard.sendAt);
  const fetch = taxFetchDecisionOf(run, decision);
  await applyTaxFetchAction(client, fetch.action, fetch.targetCtx, fetch.keys, taxYear, {
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

/**
 * apply_attestation (request) — this very draft is the closing summary.
 * Stamped by email id — the confirmation validator only trusts it once the
 * row actually sent, so an abandoned draft never becomes a request.
 */
async function applyAttestationRequest(run: PlanRun, decision: NormalizedDecision, emailId: string, sendAt: string): Promise<void> {
  if (decision.attestation?.action !== 'request') return;
  const { client, clientId } = run;
  await clients.setAttestationRequest(clientId, emailId);
  recordAudit({
    actorType: 'agent',
    action: 'client.attestation_requested',
    agentInstanceId: client.agent_instance_id,
    clientId,
    detail: { clientName: client.name, emailId, send_at: sendAt },
  });
  recordPlannerStep(run, 'apply_attestation', { action: 'request', emailId });
}
