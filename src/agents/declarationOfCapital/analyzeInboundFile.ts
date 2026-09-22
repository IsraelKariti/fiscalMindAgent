import { createHash } from 'node:crypto';
import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { analyzeFile, isAnalyzable } from './analyzeFile.js';
import { classifierCandidates } from './analyzeFileRules.js';
import { cutPdf, readPdfPageCount, type PageRange } from './pdfPages.js';
import { splitFile } from './splitFile.js';
import { childLabel } from './splitChildNames.js';
import { capitalClientTaxYear } from '../shared/taxYear.js';
import { recordAudit } from '../../audit/audit.js';
import { extractFileText } from '../shared/fileText.js';
import { runInjectionRegexStep, screenFileForInjection } from '../shared/injectionScreen.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { deleteBlob, downloadBlob, uploadBlob } from '../../storage/blob.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { DocumentFileRow, InjectionBlock } from '../../db/types.js';
import type { Readable } from 'node:stream';

const PDF_CONTENT_TYPE = 'application/pdf';

function isPdf(contentType: string): boolean {
  return (contentType.toLowerCase().split(';')[0] ?? '').trim() === PDF_CONTENT_TYPE;
}

/**
 * Reads the file's actual contents with Gemini and stores the verdict on the
 * row, so the decision loop judges receipt from content rather than filename.
 * Failures only mark the row 'failed' — the file itself is already stored and
 * the decision prompt treats missing analysis as "judge from context".
 *
 * A PDF with two or more pages first goes through the file_splitting stage: a
 * file that holds several documents is cut into one child file per document
 * and every child is classified on its own (openspec `file-splitting`).
 */
export async function analyzeInboundFile(ctx: AgentContext, file: DocumentFileRow, body: Buffer): Promise<void> {
  const clientId = ctx.client.id;
  if (!isAnalyzable(file.content_type, body.length)) {
    await documentFiles.setAnalysis(file.id, 'unsupported', null);
    logger.info('attachment not analyzable, skipping content analysis', {
      clientId,
      fileId: file.id,
      contentType: file.content_type,
      size: body.length,
    });
    return;
  }
  // The three injection layers BEFORE classification: regex over the filename
  // and (for a PDF) the text layer code can read, then the multimodal LLM
  // screen over the bytes, then the code check of its proof. A hit
  // quarantines the file — never classified, never evidence, never linked.
  // Fails closed: a screen failure blocks like a hit.
  const screenCtx = {
    userId: ctx.client.user_id,
    agentInstanceId: ctx.client.agent_instance_id,
    clientId,
    source: 'inbound_file' as const,
    targetId: file.id,
  };
  const textLayer = sanitizeUntrusted(extractFileText(body, file.content_type), 20_000);
  let block: InjectionBlock | null = null;
  const regexHit = runInjectionRegexStep(`${sanitizeInline(file.filename, 150)}\n${textLayer}`, screenCtx);
  if (regexHit) {
    block = { detector: 'regex', kind: regexHit.kind, evidence: regexHit.evidence };
  } else {
    try {
      const verdict = await screenFileForInjection(
        { bytes: body, contentType: file.content_type, filename: file.filename, text: textLayer },
        screenCtx,
      );
      if (verdict.suspected) block = { detector: 'llm', kind: null, evidence: verdict.evidence };
    } catch (err) {
      logger.error('file injection screen failed — quarantining the file (fail closed)', err, { clientId, fileId: file.id });
      block = { detector: 'llm', kind: null, evidence: `scan failed: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300) };
    }
  }
  if (block) {
    await documentFiles.setBlocked(file.id, block);
    // One row, the sibling agent's name for it: the file is quarantined and
    // every state change of this cycle is suppressed. Targets the file so the
    // trail links it to the quarantined row.
    recordAudit({
      actorType: 'agent',
      action: 'injection.cycle_suppressed',
      agentInstanceId: ctx.client.agent_instance_id,
      clientId,
      targetType: 'document_file',
      targetId: file.id,
      severity: 'critical',
      suspectedInjection: true,
      detail: {
        clientName: ctx.client.name,
        source: 'inbound_file_screen',
        fileId: file.id,
        filename: file.filename,
        contentType: file.content_type,
        ...block,
      },
    });
    logger.warn('attachment quarantined by the injection screen', { clientId, fileId: file.id, detector: block.detector, kind: block.kind });
    return;
  }

  // A multi-document PDF is cut into children and each child is classified on
  // its own; the parent is then never classified. Any trouble in the split
  // step means "no split": the whole file is classified exactly as before.
  let children: DocumentFileRow[] | null = null;
  try {
    children = await splitIntoChildren(ctx, file, body);
  } catch (err) {
    logger.error('file splitting failed — classifying the whole file', err, { clientId, fileId: file.id });
  }
  if (children === null) {
    await classifyAndStore(ctx, file, body);
    return;
  }
  // Children skip the injection layers: every page of the parent already
  // passed them. The classifier's own suspected/illegible flags still apply.
  for (const child of children) {
    if (child.analysis_status !== 'pending') continue; // a re-run: already classified
    try {
      await classifyAndStore(ctx, child, await readBlob(child.blob_key));
    } catch (err) {
      await documentFiles.setAnalysis(child.id, 'failed', null).catch(() => {});
      logger.error('split child could not be read for content analysis', err, { clientId, fileId: child.id, parentFileId: file.id });
    }
  }
}

async function readBlob(blobKey: string): Promise<Buffer> {
  const stream: Readable = (await downloadBlob(blobKey)).stream;
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Stages file_splitting + validate_file_split. Returns the child rows when the
 * file was cut into two or more documents (the parent is then marked 'split'),
 * or null when the step does not apply or nothing was cut: not a PDF, one page,
 * a PDF the library cannot open, a rejected answer, or a single document.
 * Throws on a model/storage error — the caller falls back to the whole file.
 */
async function splitIntoChildren(ctx: AgentContext, file: DocumentFileRow, body: Buffer): Promise<DocumentFileRow[] | null> {
  const clientId = ctx.client.id;
  if (!isPdf(file.content_type)) return null;
  // A child is never split again.
  if (file.parent_file_id !== null) return null;
  // Already cut on an earlier run: reuse those children instead of asking the
  // model again (a second answer could propose other ranges).
  if (file.analysis_status === 'split') return documentFiles.listChildren(file.id);
  let pageCount: number;
  try {
    pageCount = await readPdfPageCount(body);
  } catch (err) {
    logger.warn('pdf page count unreadable (encrypted or damaged) — skipping the split step', { clientId, fileId: file.id, err: String(err) });
    return null;
  }
  if (pageCount < 2) return null;

  const { raw, gate, usage, model } = await splitFile(body, file.filename, pageCount, {
    log: {
      userId: ctx.client.user_id,
      agentInstanceId: ctx.client.agent_instance_id,
      clientId,
      purpose: 'file_splitting',
    },
  });
  if (ctx.client.user_id) {
    await llmUsage.add(ctx.client.user_id, ctx.client.agent_instance_id, model, usage);
  }
  // Step validate_file_split: the code check of the proposed page ranges.
  // result true with one document = accepted, nothing to cut.
  recordAudit({
    actorType: 'system',
    action: 'validate_file_split',
    agentInstanceId: ctx.client.agent_instance_id,
    clientId,
    targetType: 'document_file',
    targetId: file.id,
    severity: gate.result ? 'info' : 'warning',
    detail: {
      clientName: ctx.client.name,
      filename: file.filename,
      result: gate.result,
      reason: gate.reason,
      pageCount,
      documentCount: raw.documents.length,
      ranges: gate.proposed.map((r) => `${r.from}-${r.to}`),
      // Audit-only free text from attacker-controlled bytes: sanitized, capped, a bounded list.
      kinds: raw.documents.slice(0, 25).map((d) => sanitizeInline(d.kind, 80)),
      cut: gate.result && gate.ranges.length >= 2,
      checks: gate.checks,
    },
  });
  if (!gate.result || gate.ranges.length < 2) return null;

  const parts = await cutPdf(body, gate.ranges);
  try {
    for (const [index, range] of gate.ranges.entries()) {
      await storeChild(file, range, parts[index]!);
    }
  } catch (err) {
    // A half-stored split must not leave stray children next to a parent that
    // is about to be classified whole.
    const removed = await documentFiles.deleteChildren(file.id).catch(() => []);
    for (const blobKey of removed) {
      deleteBlob(blobKey).catch((e) => logger.error('split cleanup: blob delete failed', e, { clientId, blobKey }));
    }
    throw err;
  }
  await documentFiles.setSplit(file.id);
  const children = await documentFiles.listChildren(file.id);
  logger.info('multi-document pdf split into child files', {
    clientId,
    fileId: file.id,
    pageCount,
    children: children.map((c) => ({ id: c.id, from: c.page_from, to: c.page_to })),
  });
  return children;
}

/** Stores one cut-out document as an ordinary file row of the same client and message. Idempotent on the derived attachment id. */
async function storeChild(parent: DocumentFileRow, range: PageRange, bytes: Buffer): Promise<void> {
  const pages = `p${range.from}-${range.to}`;
  const baseName = parent.filename.replace(/\.pdf$/i, '');
  const filename = `${baseName}-${pages}.pdf`;
  const blobKey = `clients/${parent.client_id}/${parent.provider_attachment_id}/split/${pages}.pdf`;
  await uploadBlob(blobKey, bytes, PDF_CONTENT_TYPE);
  await documentFiles.insertIfNew({
    clientId: parent.client_id,
    emailId: parent.email_id,
    providerAttachmentId: `${parent.provider_attachment_id}#${pages}`,
    blobKey,
    filename,
    contentType: PDF_CONTENT_TYPE,
    sizeBytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    parentFileId: parent.id,
    pageFrom: range.from,
    pageTo: range.to,
  });
}

/** Stage file_classification + validate_classification for one file: one file, one verdict, stored on its row. */
async function classifyAndStore(ctx: AgentContext, file: DocumentFileRow, body: Buffer): Promise<void> {
  const clientId = ctx.client.id;
  try {
    // Only items already agreed with the client are match candidates (openspec
    // `unlisted-files`): a file never settles an open question on its own.
    const requiredDocuments = classifierCandidates(await clientDocuments.listForClient(clientId));
    // The client carries its own declaration year (the instance has none) —
    // frame the classifier around it, like plan.ts and verifyDocument.ts do.
    const taxYear = capitalClientTaxYear(ctx.client, new Date());
    const { analysis, gate, usage, model } = await analyzeFile(body, file.content_type, file.filename, requiredDocuments, taxYear, {
      log: {
        userId: ctx.client.user_id,
        agentInstanceId: ctx.client.agent_instance_id,
        clientId,
        purpose: 'file_classification',
      },
    });
    // Step validate_classification: the code check of the model's proposal.
    // result false = an id the model was not shown (or of another type) was
    // dropped; quarantine (suspected / illegible) is reported alongside.
    recordAudit({
      actorType: 'system',
      action: 'validate_classification',
      agentInstanceId: ctx.client.agent_instance_id,
      clientId,
      targetType: 'document_file',
      targetId: file.id,
      severity: gate.quarantined && analysis.injection_suspected ? 'critical' : gate.result ? 'info' : 'warning',
      suspectedInjection: analysis.injection_suspected === true,
      detail: {
        clientName: ctx.client.name,
        filename: file.filename,
        result: gate.result,
        reason: gate.reason,
        rejectedId: gate.rejectedId,
        matched: analysis.matched_document_id,
        type: analysis.document_type ?? null,
        kind: analysis.document_kind,
        confidence: analysis.confidence,
        legible: analysis.legible,
        quarantined: gate.quarantined,
        quarantineReason: gate.quarantineReason,
        candidates: requiredDocuments.map((d) => d.id),
        checks: gate.checks,
      },
    });
    await documentFiles.setAnalysis(file.id, 'done', analysis);
    // A child cut out of a multi-document PDF is shown under the name of the
    // list document it matched; with no match (the gate has already cleared a
    // dropped one), under its document type and the company on it. Our own
    // words either way. A quarantined child keeps its page-range name.
    if (file.parent_file_id !== null) {
      const matched = requiredDocuments.find((d) => d.id === analysis.matched_document_id);
      await documentFiles.setLabel(
        file.id,
        childLabel({
          matchedDocumentName: matched?.name,
          matchedDocumentTypeKey: matched?.type_key,
          documentType: analysis.document_type,
          issuerName: analysis.issuer_name,
          quarantined: gate.quarantined,
        }),
      );
    }
    if (ctx.client.user_id) {
      await llmUsage.add(ctx.client.user_id, ctx.client.agent_instance_id, model, usage);
    }
    logger.info('attachment content analyzed', {
      clientId,
      fileId: file.id,
      documentKind: analysis.document_kind,
      matchedDocumentId: analysis.matched_document_id,
      confidence: analysis.confidence,
    });
  } catch (err) {
    await documentFiles.setAnalysis(file.id, 'failed', null).catch(() => {});
    if (file.parent_file_id !== null) await documentFiles.setLabel(file.id, null).catch(() => {});
    logger.error('attachment content analysis failed', err, { clientId, fileId: file.id });
  }
}
