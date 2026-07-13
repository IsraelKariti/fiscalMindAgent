import { withClientLock } from '../../db/withClientLock.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';
import type { AgentTypeDefinition } from '../types.js';
import { analyzeInboundFile } from './analyzeInboundFile.js';
import { planDebtCollection } from './plan.js';
import { buildRouter } from './router.js';

/**
 * The debt collector: reads the client's financial rows live from the
 * accountant's monday boards / Google Sheets (settings.ts), has the LLM
 * extract the debt picture and decide (plan.ts), chases payment by email, and
 * on a confirmed payment completes the goal and notifies the accountant from
 * no-reply@ (notifyAccountant.ts). A daily scan (dailyScan.ts) sweeps the same
 * sources for debtor rows that have no client yet and auto-enrolls them.
 */
export const debtCollectorAgent: AgentTypeDefinition = {
  id: 'debt_collector',
  conversationModel: 'scheduled_follow_up',
  planNextAction: planDebtCollection,
  async onInboundMessage(ctx) {
    // Same contract as the doc collector: a reply obsoletes the pending send
    // and triggers a re-plan (which re-reads the sheets and re-decides).
    await withClientLock(ctx.client.id, async () => {
      await removeFutureEmail(ctx.client.id);
      await setFutureEmail(ctx.client.id);
    });
  },
  analyzeInboundFile,
  buildRouter,
};
