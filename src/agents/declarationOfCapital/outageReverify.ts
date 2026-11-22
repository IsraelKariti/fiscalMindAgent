import * as clientDocuments from '../../db/queries/clientDocuments.js';
import * as documentFiles from '../../db/queries/documentFiles.js';
import { recordRerunAfterVerification, verifyBatch } from './verifyDocument.js';
import { holdClientForOutage, isProviderHeld } from '../../orchestration/outageHold.js';
import { logger } from '../../util/logger.js';
import type { AgentContext } from '../types.js';

/**
 * Recovery after a provider outage hold (openspec `llm-provider-outage`):
 * the documents the planner marked collected whose verification was cut
 * short by the hold (collected, a file tied, no verdict yet) are verified
 * now, so the recovery's planner run sees their verdicts like a normal
 * collect cycle would have. A hold that reopens marks the client held again.
 */
export async function reverifyCollected(ctx: AgentContext): Promise<void> {
  const client = ctx.client;
  const docs = await clientDocuments.listForClient(client.id);
  const files = await documentFiles.listForClient(client.id);
  const targets = docs
    .filter((d) => d.status === 'collected' && d.verification === null)
    .flatMap((d) => {
      const file = [...files].reverse().find((f) => f.client_document_id === d.id && f.analysis_status === 'done');
      return file ? [{ documentId: d.id, fileId: file.id }] : [];
    });
  if (targets.length === 0) return;
  logger.info('outage recovery: verifying the collected documents the hold cut short', { clientId: client.id, documents: targets.length });
  try {
    const results = await verifyBatch(client, ctx.instance, targets);
    await recordRerunAfterVerification(client, results);
  } catch (err) {
    if (!isProviderHeld(err)) throw err;
    await holdClientForOutage(client, err, { what: 'verification' });
  }
}
