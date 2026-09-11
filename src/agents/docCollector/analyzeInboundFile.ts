import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { analyzeFile, isAnalyzable } from './analyzeFile.js';
import { capitalClientTaxYear, resolveTaxYear } from '../shared/taxYear.js';
import { recordAudit } from '../../audit/audit.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { DocumentFileRow } from '../../db/types.js';

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
  try {
    const requiredDocuments = await clientDocuments.listForClient(clientId);
    const isCapital = ctx.instance?.agent_type === 'declaration_of_capital';
    // Capital-declaration clients carry their own declaration year (the instance's
    // tax_year is NULL for this type) — frame the classifier around it, like plan.ts
    // and verifyDocument.ts do, not around the last concluded year.
    const taxYear = isCapital ? capitalClientTaxYear(ctx.client, new Date()) : resolveTaxYear(ctx.instance, new Date());
    const purpose = isCapital ? 'capital_declaration' : 'annual_report';
    const { analysis, gate, usage, model } = await analyzeFile(body, file.content_type, file.filename, requiredDocuments, taxYear, purpose, {
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
