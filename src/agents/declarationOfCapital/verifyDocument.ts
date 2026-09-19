import { Buffer } from 'node:buffer';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { downloadBlob } from '../../storage/blob.js';
import { runLlmCall } from '../../gemini/llmCall.js';
import { recordAudit } from '../../audit/audit.js';
import { withClientLock } from '../../db/withClientLock.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';
import { publishClientUpdated } from '../../events/clientEvents.js';
import { isKillSwitchOn } from '../killSwitch.js';
import { isAnalyzable } from '../declarationOfCapital/analyzeFile.js';
import { sendVerificationProblemEmail } from '../declarationOfCapital/notifyAccountant.js';
import { isQuarantined } from '../shared/fileEvidence.js';
import { capitalClientTaxYear } from '../shared/taxYear.js';
import { logger } from '../../util/logger.js';
import { buildExtractionCall, checksFor } from './extractionCall.js';
import { ExtractionSchema, runChecks, type ExtractedFields } from './verifyChecks.js';
import * as clients from '../../db/queries/clients.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { fetchItemDetails } from '../shared/mondayData.js';
import { crmIdNumber } from './crmIdentity.js';
import { clientIdNumber, type ClientIdOnFile } from './taxFetch/clientId.js';
import type { AgentInstanceRow, ClientRow, ClientDocumentRow } from '../../db/types.js';
import type { Readable } from 'node:stream';
import {
  runVerificationBatch,
  type VerificationOutcome,
  type VerificationResult,
  type VerificationTarget,
} from './verifyBatchRules.js';

type IdOnFile = ClientIdOnFile;

/**
 * The client's national id the checks compare a printed id against, and
 * where it came from: the tax-portal credentials first, then the id the
 * kickoff stored from the monday CRM card, then — for a client enrolled
 * before the card's id cell was recognised — the card itself, fetched once
 * and stored (openspec `declaration-kickoff`). monday trouble never fails a
 * verification: it just leaves no id on file.
 */
async function clientIdOnFile(client: ClientRow): Promise<IdOnFile | null> {
  const onFile = await clientIdNumber(client, 'israel_tax_authority');
  if (onFile) return onFile;

  const crmItemId = client.agent_fields['monday_crm_item_id'];
  if (typeof crmItemId !== 'string' || crmItemId === '' || !client.user_id) return null;
  try {
    const token = await mondayOauthTokens.getByUserId(client.user_id);
    if (!token) return null;
    const crm = await fetchItemDetails(token.access_token, crmItemId);
    const id = crm ? crmIdNumber(crm.columns) : null;
    if (!id) {
      logger.info('document verification: linked CRM card carries no id cell', { clientId: client.id, crmItemId });
      return null;
    }
    await clients.setDeclarationEngagement(client.id, { idNumber: id });
    logger.info('document verification: client id fetched from the CRM card and stored', { clientId: client.id });
    return { id, source: 'monday_crm' };
  } catch (err) {
    logger.warn('document verification: CRM card fetch for the client id failed', { clientId: client.id, crmItemId, err: String(err) });
    return null;
  }
}

/**
 * The automatic verification pipeline (collected → approved), the only code
 * path that can write 'approved':
 *
 *   1. classify — consume the ingestion analyzer's verdict (quarantine gate);
 *   2. extract  — a second isolated Gemini read of the file bytes, forced
 *      through the extraction schema below (the "OCR" step);
 *   3. validate — pure code checks (verifyChecks.ts) against ground truth:
 *      the client's name/id and the 31.12 valuation date.
 *
 * Pass → approved. Fail → the row reopens as pending carrying the Hebrew
 * failure reasons the planner relays to the client; after MAX_FAILED_ATTEMPTS
 * the row stays collected (stalled) and the accountant is notified — the only
 * human touchpoint, and only as a dead-end escape hatch. Unverifiable files
 * (unsupported type, quarantined, injection flagged by the extractor) also
 * stall to the accountant rather than loop.
 */

const MAX_FAILED_ATTEMPTS = 3;

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

interface VerificationRecord extends Record<string, unknown> {
  passed: boolean;
  attempts: number;
  file_id: string;
  reasons: string[];
  verified_at: string;
}

function previousAttempts(doc: ClientDocumentRow): number {
  const attempts = doc.verification?.['attempts'];
  return typeof attempts === 'number' && Number.isFinite(attempts) ? attempts : 0;
}

/** The stalled/unverifiable outcome: row stays collected, accountant notified once per dead end. */
async function stall(
  client: ClientRow,
  doc: ClientDocumentRow,
  record: VerificationRecord,
  opts: { suspectedInjection?: boolean } = {},
): Promise<void> {
  const alreadyStalled = doc.verification?.['stalled'] === true;
  await clientDocuments.setVerification(doc.id, client.id, { ...record, stalled: true });
  recordAudit({
    actorType: 'system',
    action: 'document.verification_failed',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'client_document',
    targetId: doc.id,
    severity: opts.suspectedInjection ? 'critical' : undefined,
    suspectedInjection: opts.suspectedInjection,
    detail: { clientName: client.name, name: doc.name, stalled: true, reasons: record.reasons },
  });
  publishClientUpdated(client.id);
  if (!alreadyStalled) {
    sendVerificationProblemEmail(client, doc.name, record.reasons).catch((err) =>
      logger.error('verification-problem notification failed', err, { clientId: client.id, documentId: doc.id }),
    );
  }
}

/**
 * Verifies one just-collected document against its linked file and returns
 * the outcome. It never re-plans: the caller verifies its whole batch
 * (verifyBatch) and then runs ONE follow-up planning cycle (openspec
 * `verification-reply`).
 */
export async function verifyCollectedDocument(
  client: ClientRow,
  instance: AgentInstanceRow | null,
  documentId: string,
  fileId: string,
): Promise<VerificationOutcome> {
  if (await isKillSwitchOn()) {
    logger.warn('platform kill switch on, skipping document verification', { clientId: client.id, documentId });
    return 'skipped';
  }
  const doc = await clientDocuments.getForClient(documentId, client.id);
  if (!doc || doc.status !== 'collected') return 'skipped';
  const attempts = previousAttempts(doc);
  if (doc.verification?.['stalled'] === true) return 'skipped'; // dead-ended; the accountant owns it now

  const now = new Date();
  const base = { attempts, file_id: fileId, verified_at: now.toISOString() };

  const file = await documentFiles.getForClient(fileId, client.id);
  if (!file) {
    await stall(client, doc, { ...base, passed: false, unavailable: true, reasons: ['הקובץ המקושר לא נמצא במערכת'] });
    return 'stalled';
  }
  if (isQuarantined(file)) {
    await stall(
      client,
      doc,
      { ...base, passed: false, unavailable: true, reasons: ['הקובץ סומן כחשוד או בלתי קריא בניתוח התוכן'] },
      { suspectedInjection: file.analysis?.injection_suspected === true },
    );
    return 'stalled';
  }
  if (!isAnalyzable(file.content_type, Number(file.size_bytes))) {
    await stall(client, doc, {
      ...base,
      passed: false,
      unavailable: true,
      reasons: ['סוג הקובץ או גודלו אינם נתמכים באימות אוטומטי'],
    });
    return 'stalled';
  }

  const checks = checksFor(doc);
  const taxYear = capitalClientTaxYear(client, now);

  // Extract — the isolated "OCR" read, forced through the schema.
  let extracted: ExtractedFields;
  try {
    const bytes = await streamToBuffer((await downloadBlob(file.blob_key)).stream);
    const { text, usage, model } = await runLlmCall(
      buildExtractionCall({ doc, bytes, contentType: file.content_type, filename: file.filename, taxYear }),
      { log: { userId: client.user_id, agentInstanceId: client.agent_instance_id, clientId: client.id } },
    );
    if (client.user_id) {
      await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
    }
    extracted = ExtractionSchema.parse(JSON.parse(text));
  } catch (err) {
    // Transient extraction failure (model/storage hiccup): leave the row as-is
    // with no verdict — it does not burn an attempt, and the accountant can
    // always approve manually if it never recovers.
    logger.error('document verification: extraction failed', err, { clientId: client.id, documentId, fileId });
    return 'skipped';
  }

  if (extracted.injection_suspected) {
    await stall(
      client,
      doc,
      { ...base, passed: false, unavailable: true, reasons: ['הקובץ מכיל טקסט שמנסה להנחות מערכת AI'] },
      { suspectedInjection: true },
    );
    return 'stalled';
  }

  // Validate — deterministic code against ground truth. The ת"ז may come from
  // the tax-portal credentials or from the client's CRM card (declaration-of-
  // capital kickoff stores it in agent_fields.id_number).
  const idOnFile = await clientIdOnFile(client);
  const verdict = runChecks(extracted, {
    clientName: client.name,
    credentialIdNumber: idOnFile?.id ?? null,
    credentialIdSource: idOnFile?.source ?? null,
    taxYear,
    now,
    checks,
    documentName: doc.name,
  });
  // Step verify_extraction: the code checks after extract_document, one row per
  // attempt with the per-check table (reasons are our own Hebrew strings).
  recordAudit({
    actorType: 'system',
    action: 'verify_extraction',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'client_document',
    targetId: doc.id,
    severity: verdict.passed ? 'info' : 'warning',
    detail: {
      clientName: client.name,
      name: doc.name,
      fileId,
      attempt: attempts + 1,
      result: verdict.passed,
      issuer: extracted.issuer,
      checks: verdict.checks.map((c) => ({ key: c.key, passed: c.passed, note: c.reason, observed: c.observed, expected: c.expected })),
      reasons: verdict.reasons,
    },
  });

  if (verdict.passed) {
    const record: VerificationRecord = {
      ...base,
      passed: true,
      reasons: [],
      checks: verdict.checks,
      extracted,
    };
    const approved = await clientDocuments.markApproved(doc.id, client.id, record);
    if (!approved) return 'skipped'; // status changed underneath us — leave it be
    recordAudit({
      actorType: 'system',
      action: 'document.verified',
      agentInstanceId: client.agent_instance_id,
      clientId: client.id,
      targetType: 'client_document',
      targetId: doc.id,
      detail: { clientName: client.name, name: doc.name, fileId, issuer: extracted.issuer },
    });
    publishClientUpdated(client.id);
    logger.info('document verified and approved', { clientId: client.id, documentId: doc.id, fileId });
    return 'approved';
  }

  const failedAttempts = attempts + 1;
  const record: VerificationRecord = {
    ...base,
    passed: false,
    attempts: failedAttempts,
    reasons: verdict.reasons,
    checks: verdict.checks,
    extracted,
  };
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    await stall(client, doc, record);
    logger.warn('document verification stalled after repeated failures', {
      clientId: client.id,
      documentId: doc.id,
      attempts: failedAttempts,
      reasons: verdict.reasons,
    });
    return 'stalled';
  }
  const reopened = await clientDocuments.revertToPending(doc.id, client.id, record);
  if (!reopened) return 'skipped';
  recordAudit({
    actorType: 'system',
    action: 'document.verification_failed',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'client_document',
    targetId: doc.id,
    detail: { clientName: client.name, name: doc.name, fileId, attempt: failedAttempts, reasons: verdict.reasons },
  });
  publishClientUpdated(client.id);
  logger.info('document verification failed, reopened as pending', {
    clientId: client.id,
    documentId: doc.id,
    attempt: failedAttempts,
    reasons: verdict.reasons,
  });
  return 'reopened';
}

/**
 * Verifies a batch of just-collected documents, one after the other. A
 * verification that throws is logged and never stops the batch or the reply.
 */
export async function verifyBatch(
  client: ClientRow,
  instance: AgentInstanceRow | null,
  targets: readonly VerificationTarget[],
): Promise<VerificationResult[]> {
  return runVerificationBatch(targets, (t) => verifyCollectedDocument(client, instance, t.documentId, t.fileId), {
    // A long batch must not push the workspace's "drafting…" placeholder past its stale limit.
    beforeEach: () => clients.markDraftingStarted(client.id),
    onError: (t, err) => logger.error('document verification failed', err, { clientId: client.id, documentId: t.documentId, fileId: t.fileId }),
  });
}

/** The one `planner.rerun_after_verification` step of a batch: every document with its outcome. */
export async function recordRerunAfterVerification(client: ClientRow, results: readonly VerificationResult[]): Promise<void> {
  const docs = await clientDocuments.listForClient(client.id);
  recordAudit({
    actorType: 'system',
    action: 'planner.rerun_after_verification',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'client_document',
    targetId: results.length === 1 ? results[0]!.documentId : undefined,
    detail: {
      clientName: client.name,
      documents: results.map((r) => ({
        documentId: r.documentId,
        name: docs.find((d) => d.id === r.documentId)?.name ?? r.documentId,
        outcome: r.outcome,
      })),
    },
  });
}

/**
 * For batches started OUTSIDE a planning cycle (fetch delivery): verify, then
 * one planning cycle so the agent reports the outcomes right away instead of
 * waiting for the client's next message. The cycle runs with the
 * afterVerification hint: it cannot collect files, so it cannot verify again
 * — no loop. Best-effort: the verdicts themselves are already recorded.
 * (The planner verifies its own batch inline — see plan.ts.)
 */
export async function verifyBatchAndReplan(
  client: ClientRow,
  instance: AgentInstanceRow | null,
  targets: readonly VerificationTarget[],
): Promise<void> {
  if (targets.length === 0) return;
  const results = await verifyBatch(client, instance, targets);
  await recordRerunAfterVerification(client, results);
  try {
    await withClientLock(client.id, async () => {
      await removeFutureEmail(client.id);
      await setFutureEmail(client.id, { afterVerification: true });
    });
  } catch (err) {
    logger.error('post-verification re-plan failed', err, { clientId: client.id, documentIds: targets.map((t) => t.documentId) });
  }
}
