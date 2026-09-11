import { withClientLock } from '../../db/withClientLock.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';
import { planFollowUp } from './plan.js';
import { analyzeInboundFile } from './analyzeInboundFile.js';
import { screenInboundMessage } from './screenInbound.js';
import { buildRouter } from './router.js';
import { maybeHandleOtpInbound } from './taxFetch/inboundOtp.js';
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
  collectsTaxYear: true,
  planNextAction: planFollowUp,
  async onInboundMessage(ctx, evt) {
    // A WhatsApp reply carrying the tax-authority OTP is time-critical: route it
    // straight to the worker without an LLM round-trip or a re-plan.
    if (await maybeHandleOtpInbound(ctx, evt)) return;
    // The three injection layers on the message text, before any planning: a
    // hit withholds the text from the planner and answers with a fixed reply.
    await screenInboundMessage(ctx, evt);
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
