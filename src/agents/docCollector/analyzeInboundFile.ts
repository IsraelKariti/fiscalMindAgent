import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { analyzeFile, isAnalyzable } from './analyzeFile.js';
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
    const { analysis, usage, model } = await analyzeFile(body, file.content_type, file.filename, requiredDocuments);
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
