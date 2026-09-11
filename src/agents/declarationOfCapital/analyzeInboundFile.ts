import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { analyzeFile, isAnalyzable } from './analyzeFile.js';
import { capitalClientTaxYear } from '../shared/taxYear.js';
import { recordAudit } from '../../audit/audit.js';
import { extractFileText } from '../shared/fileText.js';
import { runInjectionRegexStep, screenFileForInjection } from '../shared/injectionScreen.js';
import { sanitizeInline, sanitizeUntrusted } from '../shared/promptSafety.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { DocumentFileRow, InjectionBlock } from '../../db/types.js';

/**
 * Reads the file's actual contents with Gemini and stores the verdict on the
 * row, so the decision loop judges receipt from content rather than filename.
 * Failures only mark the row 'failed' — the file itself is already stored and
 * the decision prompt treats missing analysis as "judge from context".
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
    recordAudit({
      actorType: 'system',
      action: 'file.blocked',
      agentInstanceId: ctx.client.agent_instance_id,
      clientId,
      targetType: 'document_file',
      targetId: file.id,
      severity: 'critical',
      suspectedInjection: true,
      detail: { clientName: ctx.client.name, filename: file.filename, contentType: file.content_type, ...block },
    });
    recordAudit({
      actorType: 'agent',
      action: 'injection.cycle_suppressed',
      agentInstanceId: ctx.client.agent_instance_id,
      clientId,
      severity: 'critical',
      suspectedInjection: true,
      detail: { clientName: ctx.client.name, source: 'inbound_file_screen', fileId: file.id, ...block },
    });
    logger.warn('attachment quarantined by the injection screen', { clientId, fileId: file.id, detector: block.detector, kind: block.kind });
    return;
  }

  try {
    const requiredDocuments = await clientDocuments.listForClient(clientId);
    // The client carries its own declaration year (the instance has none) —
    // frame the classifier around it, like plan.ts and verifyDocument.ts do.
    const taxYear = capitalClientTaxYear(ctx.client, new Date());
    const { analysis, gate, usage, model } = await analyzeFile(body, file.content_type, file.filename, requiredDocuments, taxYear, {
      log: {
        userId: ctx.client.user_id,
        agentInstanceId: ctx.client.agent_instance_id,
        clientId,
        purpose: 'analyze_file',
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
      },
    });
    await documentFiles.setAnalysis(file.id, 'done', analysis);
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
    logger.error('attachment content analysis failed', err, { clientId, fileId: file.id });
  }
}
