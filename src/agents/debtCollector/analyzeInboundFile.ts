import * as documentFiles from '../../db/queries/documentFiles.js';
import * as llmUsage from '../../db/queries/llmUsage.js';
import { isAnalyzable } from '../docCollector/analyzeFile.js';
import { analyzeReceipt } from './analyzeReceipt.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';
import type { DocumentFileRow } from '../../db/types.js';

/**
 * Reads an inbound attachment's contents with Gemini and stores the verdict —
 * is this a payment confirmation, for what amount — so the decision loop
 * judges payment from content rather than filename. Failures only mark the
 * row 'failed'; the decision prompt treats missing analysis as "judge from
 * context".
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
    const { analysis, usage, model } = await analyzeReceipt(body, file.content_type, file.filename);
    await documentFiles.setAnalysis(file.id, 'done', analysis);
    if (ctx.client.user_id) {
      await llmUsage.add(ctx.client.user_id, ctx.client.agent_instance_id, model, usage);
    }
    logger.info('attachment content analyzed (receipt)', {
      clientId,
      fileId: file.id,
      documentKind: analysis.document_kind,
      confidence: analysis.confidence,
    });
  } catch (err) {
    await documentFiles.setAnalysis(file.id, 'failed', null).catch(() => {});
    logger.error('attachment content analysis failed', err, { clientId, fileId: file.id });
  }
}
