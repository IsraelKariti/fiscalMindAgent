import { withClientLock } from '../../db/withClientLock.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';
import { planFollowUp } from './plan.js';
import { analyzeInboundFile } from './analyzeInboundFile.js';
import { buildRouter } from './router.js';
import type { AgentTypeDefinition } from '../types.js';

/**
 * The document collector: converses with clients over email/WhatsApp to
 * collect the required-documents list (client_documents), with LLM-scheduled
 * follow-ups.
 */
export const docCollectorAgent: AgentTypeDefinition = {
  id: 'doc_collector',
  conversationModel: 'scheduled_follow_up',
  emailSuffix: 'document',
  planNextAction: planFollowUp,
  async onInboundMessage(ctx) {
    // A reply (or backfilled files) always obsoletes the pending send; the
    // re-plan drafts the next one. Locked so a concurrent worker send and this
    // re-plan can't interleave.
    await withClientLock(ctx.client.id, async () => {
      await removeFutureEmail(ctx.client.id);
      await setFutureEmail(ctx.client.id);
    });
  },
  analyzeInboundFile,
  buildRouter,
};
