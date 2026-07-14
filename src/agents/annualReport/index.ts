import { withClientLock } from '../../db/withClientLock.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';
import { planAnnualReport } from './plan.js';
import { analyzeInboundFile } from '../docCollector/analyzeInboundFile.js';
import { buildRouter } from './router.js';
import type { AgentTypeDefinition } from '../types.js';

/**
 * The annual-report assistant: interviews the client over email/WhatsApp to
 * determine which documents their personal annual tax return (טופס 1301/135)
 * needs — no accountant-defined list — then collects them with LLM-scheduled
 * follow-ups. Documents it determines become ordinary client_documents rows,
 * so the collection machinery is shared with the doc collector.
 */
export const annualReportAgent: AgentTypeDefinition = {
  id: 'annual_report_assistant',
  conversationModel: 'scheduled_follow_up',
  emailSuffix: 'annual',
  planNextAction: planAnnualReport,
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
