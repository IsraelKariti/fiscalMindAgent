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
import { buildExtractionCall, checksFor, fieldsFor } from './extractionCall.js';
import { extractionSchemaFor, runChecks, typeFieldValue, type ChecksVerdict, type ExtractedAnswer } from './verifyChecks.js';
import type { ExtractionField, VerificationChecks } from './catalog.js';
import * as clients from '../../db/queries/clients.js';
import * as mondayOauthTokens from '../../db/queries/mondayOauthTokens.js';
import { fetchItemDetails } from '../shared/mondayData.js';
import { crmIdNumber } from './crmIdentity.js';
import { clientIdNumber, type ClientIdOnFile } from './taxFetch/clientId.js';
import { mergeSpouse, readMaritalStatus, readSpouse, spouseToStored } from './spouseIdentity.js';
import { maskId } from '../shared/gateChecks.js';
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
 *
 * verifyCollectedDocument below is the orchestrator; every step of the chart
 * is one named function under it (loadCollectedDocument, documentTypeRules,
 * loadCheckableFile, extractDocumentData, stallOnAttackText,
 * checkExtractedData, applyVerdict → approveDocument / reopenDocument /
 * stallAfterRepeatedFailures).
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

/** One document check in progress: what every step below shares. */
interface VerificationRun {
  client: ClientRow;
  doc: ClientDocumentRow;
  fileId: string;
  /** Failed attempts before this one. */
  attempts: number;
  now: Date;
  taxYear: number;
  /** The record fields every outcome writes. */
  base: { attempts: number; file_id: string; verified_at: string };
}

/** The stored file row the check reads (documentFiles.getForClient). */
type StoredFile = NonNullable<Awaited<ReturnType<typeof documentFiles.getForClient>>>;

/** What the document's catalog type says about the check: which checks apply and which extra fields to read. */
interface DocumentTypeRules {
  checks: VerificationChecks;
  fields: readonly ExtractionField[] | undefined;
  fieldsAnyOf: readonly string[] | undefined;
}

/**
 * Verifies one just-collected document against its linked file and returns
 * the outcome. It never re-plans: the caller verifies its whole batch
 * (verifyBatch) and then runs ONE follow-up planning cycle (openspec
 * `verification-reply`).
 *
 * One named function per step of the "Document Check Flow" chart (Notion page
 * "4. Document extraction"). Step 1 — the planner ties the file to a document
 * (apply_collections in plan.ts) — happens before this runs. Step 12 — the
 * planner tells the client the result — happens after, in the batch's
 * follow-up cycle.
 */
export async function verifyCollectedDocument(
  client: ClientRow,
  instance: AgentInstanceRow | null,
  documentId: string,
  fileId: string,
): Promise<VerificationOutcome> {
  void instance; // the batch carries it for its callers; the check itself reads nothing from it
  const run = await loadCollectedDocument(client, documentId, fileId);
  if (!run) return 'skipped';
  const rules = documentTypeRules(run.doc); // step 2
  const file = await loadCheckableFile(run); // step 3
  if (!file) return 'stalled';
  const extracted = await extractDocumentData(run, file, rules); // steps 4 and 5
  if (!extracted) return 'skipped';
  if (await stallOnAttackText(run, extracted)) return 'stalled'; // step 6
  const verdict = await checkExtractedData(run, extracted, rules); // step 7
  return applyVerdict(run, extracted, verdict); // steps 8 to 13
}

/**
 * Guards before the check starts: the platform kill switch, a row that is no
 * longer "collected" (someone changed it meanwhile), a row already handed to
 * the accountant (stalled). Any of them means 'skipped'.
 */
async function loadCollectedDocument(client: ClientRow, documentId: string, fileId: string): Promise<VerificationRun | null> {
  if (await isKillSwitchOn()) {
    logger.warn('platform kill switch on, skipping document verification', { clientId: client.id, documentId });
    return null;
  }
  const doc = await clientDocuments.getForClient(documentId, client.id);
  if (!doc || doc.status !== 'collected') return null;
  if (doc.verification?.['stalled'] === true) return null; // dead-ended; the accountant owns it now
  const attempts = previousAttempts(doc);
  const now = new Date();
  return {
    client,
    doc,
    fileId,
    attempts,
    now,
    taxYear: capitalClientTaxYear(client, now),
    base: { attempts, file_id: fileId, verified_at: now.toISOString() },
  };
}

/**
 * Chart step 2 — the code finds the type of that document. The checklist row
 * carries a type key (for example `bank_balance`); the catalog entry of that
 * one type says which checks apply and which extra fields the model reads.
 */
function documentTypeRules(doc: ClientDocumentRow): DocumentTypeRules {
  const { fields, fieldsAnyOf } = fieldsFor(doc);
  return { checks: checksFor(doc), fields, fieldsAnyOf };
}

/**
 * Chart step 3 — can the code check this file? A file that is missing,
 * quarantined by the classifier, or of an unsupported type or size cannot be
 * checked: the document stalls to the accountant and this returns null.
 */
async function loadCheckableFile(run: VerificationRun): Promise<StoredFile | null> {
  const { client, doc, fileId, base } = run;
  const file = await documentFiles.getForClient(fileId, client.id);
  if (!file) {
    await stall(client, doc, { ...base, passed: false, unavailable: true, reasons: ['הקובץ המקושר לא נמצא במערכת'] });
    return null;
  }
  if (isQuarantined(file)) {
    await stall(
      client,
      doc,
      { ...base, passed: false, unavailable: true, reasons: ['הקובץ סומן כחשוד או בלתי קריא בניתוח התוכן'] },
      { suspectedInjection: file.analysis?.injection_suspected === true },
    );
    return null;
  }
  if (!isAnalyzable(file.content_type, Number(file.size_bytes))) {
    await stall(client, doc, {
      ...base,
      passed: false,
      unavailable: true,
      reasons: ['סוג הקובץ או גודלו אינם נתמכים באימות אוטומטי'],
    });
    return null;
  }
  return file;
}

/**
 * Chart steps 4 and 5 — the code builds the prompt for that type
 * (buildExtractionCall) and the model reads the data from the file: the
 * isolated "OCR" read, forced through the base schema plus the type's own
 * fields (openspec `document-extraction`). A transient failure (model or
 * storage hiccup) returns null: the row keeps no verdict, the attempt is not
 * counted, and the accountant can always approve by hand.
 */
async function extractDocumentData(run: VerificationRun, file: StoredFile, rules: DocumentTypeRules): Promise<ExtractedAnswer | null> {
  const { client, doc, fileId } = run;
  try {
    const bytes = await streamToBuffer((await downloadBlob(file.blob_key)).stream);
    const { text, usage, model } = await runLlmCall(
      buildExtractionCall({ doc, bytes, contentType: file.content_type, filename: file.filename, taxYear: run.taxYear }),
      { log: { userId: client.user_id, agentInstanceId: client.agent_instance_id, clientId: client.id, documentFileId: file.id } },
    );
    if (client.user_id) {
      await llmUsage.add(client.user_id, client.agent_instance_id, model, usage);
    }
    return extractionSchemaFor(rules.fields).parse(JSON.parse(text));
  } catch (err) {
    logger.error('document verification: extraction failed', err, { clientId: client.id, documentId: doc.id, fileId });
    return null;
  }
}

/**
 * Chart step 6 — did the model find attack text? A file with text that tries
 * to instruct an AI is never checked further: the document stalls with a
 * critical audit row.
 */
async function stallOnAttackText(run: VerificationRun, extracted: ExtractedAnswer): Promise<boolean> {
  if (!extracted.injection_suspected) return false;
  await stall(
    run.client,
    run.doc,
    { ...run.base, passed: false, unavailable: true, reasons: ['הקובץ מכיל טקסט שמנסה להנחות מערכת AI'] },
    { suspectedInjection: true },
  );
  return true;
}

/**
 * Chart step 7 — the code gate compares the data with known facts: the
 * client's (or spouse's) name and id number and the 31.12 valuation date
 * (runChecks, pure). The id may come from the tax-portal credentials or the
 * CRM card. The spouse on file is re-read for every document: a batch
 * verifies documents one after the other, and the first one may have just
 * adopted the spouse the second one must be compared with (openspec
 * `spouse-identity`). Writes the verify_extraction step row.
 */
async function checkExtractedData(run: VerificationRun, extracted: ExtractedAnswer, rules: DocumentTypeRules): Promise<ChecksVerdict> {
  const { client, doc } = run;
  const idOnFile = await clientIdOnFile(client);
  const fresh = (await clients.getById(client.id)) ?? client;
  const spouseOnFile = readSpouse(fresh.agent_fields);
  const verdict = runChecks(extracted, {
    clientName: client.name,
    credentialIdNumber: idOnFile?.id ?? null,
    credentialIdSource: idOnFile?.source ?? null,
    spouse: spouseOnFile,
    maritalStatus: readMaritalStatus(fresh.agent_fields),
    taxYear: run.taxYear,
    now: run.now,
    checks: rules.checks,
    documentName: doc.name,
    fields: rules.fields,
    fieldsAnyOf: rules.fieldsAnyOf,
  });
  if (verdict.adoptSpouse) await adoptSpouseFromDocument(run, spouseOnFile, verdict.adoptSpouse);
  recordVerifyExtractionStep(run, extracted, verdict, rules.fields);
  return verdict;
}

/**
 * The printed id was adopted as the spouse's: stored before the next document
 * of the batch is verified, whatever the other checks decided (the wife's
 * pension that fails a typed field still teaches who the wife is).
 */
async function adoptSpouseFromDocument(
  run: VerificationRun,
  spouseOnFile: ReturnType<typeof readSpouse>,
  adopted: NonNullable<ChecksVerdict['adoptSpouse']>,
): Promise<void> {
  const { client, doc, fileId } = run;
  const merged = mergeSpouse(spouseOnFile, adopted, 'document');
  await clients.setDeclarationEngagement(client.id, { spouse: spouseToStored(merged) });
  recordAudit({
    actorType: 'system',
    action: 'client.spouse_inferred',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'client_document',
    targetId: doc.id,
    detail: {
      clientName: client.name,
      name: doc.name,
      fileId,
      spouseName: merged.name,
      spouseId: maskId(adopted.idNumber),
    },
  });
  publishClientUpdated(client.id);
  logger.info('document verification: spouse adopted from the printed id', { clientId: client.id, documentId: doc.id, fileId });
}

/**
 * The verify_extraction step row: one per attempt, with the per-check table
 * (reasons are our own Hebrew strings) and the type's fields by their Hebrew
 * labels, so the step modal shows the values by name.
 */
function recordVerifyExtractionStep(
  run: VerificationRun,
  extracted: ExtractedAnswer,
  verdict: ChecksVerdict,
  fields: readonly ExtractionField[] | undefined,
): void {
  const { client, doc, fileId, attempts } = run;
  const labelledFields = fields?.map((f) => ({ key: f.key, label: f.labelHe, value: typeFieldValue(extracted, f) }));
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
      subject_matched: verdict.subjectMatched,
      // Every party the extraction listed (openspec `document-extraction`), ids
      // masked, with whom the identity rule resolved each one as.
      parties: verdict.parties.map((p) => ({ name: p.name, role: p.role, masked_id: p.maskedId, resolved: p.resolved })),
      ...(labelledFields && labelledFields.length > 0 ? { fields: labelledFields } : {}),
      checks: verdict.checks.map((c) => ({ key: c.key, passed: c.passed, note: c.reason, observed: c.observed, expected: c.expected })),
      reasons: verdict.reasons,
    },
  });
}

/**
 * Chart steps 8 to 13 — all checks passed? The document is approved. Else:
 * third failure in a row? The accountant takes over. Else the document opens
 * again for the client.
 */
async function applyVerdict(run: VerificationRun, extracted: ExtractedAnswer, verdict: ChecksVerdict): Promise<VerificationOutcome> {
  if (verdict.passed) return approveDocument(run, extracted, verdict);
  const failedAttempts = run.attempts + 1;
  const record: VerificationRecord = {
    ...run.base,
    passed: false,
    attempts: failedAttempts,
    reasons: verdict.reasons,
    checks: verdict.checks,
    extracted,
  };
  if (failedAttempts >= MAX_FAILED_ATTEMPTS) return stallAfterRepeatedFailures(run, record);
  return reopenDocument(run, record);
}

/** Chart step 10 — the document is approved. The only code path that writes 'approved'. */
async function approveDocument(run: VerificationRun, extracted: ExtractedAnswer, verdict: ChecksVerdict): Promise<VerificationOutcome> {
  const { client, doc, fileId } = run;
  const record: VerificationRecord = {
    ...run.base,
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

/** Chart steps 9 and 13 — the third failure in a row: the document stays collected and the accountant takes over. */
async function stallAfterRepeatedFailures(run: VerificationRun, record: VerificationRecord): Promise<VerificationOutcome> {
  await stall(run.client, run.doc, record);
  logger.warn('document verification stalled after repeated failures', {
    clientId: run.client.id,
    documentId: run.doc.id,
    attempts: record.attempts,
    reasons: record.reasons,
  });
  return 'stalled';
}

/** Chart step 11 — the document opens again: back to pending, carrying the Hebrew reasons the planner relays to the client. */
async function reopenDocument(run: VerificationRun, record: VerificationRecord): Promise<VerificationOutcome> {
  const { client, doc, fileId } = run;
  const reopened = await clientDocuments.revertToPending(doc.id, client.id, record);
  if (!reopened) return 'skipped';
  recordAudit({
    actorType: 'system',
    action: 'document.verification_failed',
    agentInstanceId: client.agent_instance_id,
    clientId: client.id,
    targetType: 'client_document',
    targetId: doc.id,
    detail: { clientName: client.name, name: doc.name, fileId, attempt: record.attempts, reasons: record.reasons },
  });
  publishClientUpdated(client.id);
  logger.info('document verification failed, reopened as pending', {
    clientId: client.id,
    documentId: doc.id,
    attempt: record.attempts,
    reasons: record.reasons,
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
      await setFutureEmail(client.id, { afterVerification: true, verificationResults: results });
    });
  } catch (err) {
    logger.error('post-verification re-plan failed', err, { clientId: client.id, documentIds: targets.map((t) => t.documentId) });
  }
}
