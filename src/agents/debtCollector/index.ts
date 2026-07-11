import { withClientLock } from '../../db/withClientLock.js';
import { removeFutureEmail } from '../../orchestration/removeFutureEmail.js';
import { setFutureEmail } from '../../orchestration/setFutureEmail.js';
import { logger } from '../../util/logger.js';
import type { AgentTypeDefinition } from '../types.js';

/**
 * STUB — proves a second agent type plugs into the platform (own instance,
 * own client list, own workspace surface) and makes the agents-home page and
 * sidebar switcher real. The actual debt-collection brain (prompt, decision
 * schema, client_debt fields) is not built yet: planning deliberately does
 * nothing, so no message is ever drafted or sent.
 */
export const debtCollectorAgent: AgentTypeDefinition = {
  id: 'debt_collector',
  conversationModel: 'scheduled_follow_up',
  async planNextAction(ctx) {
    logger.info('debt collector stub: planning skipped (not implemented)', { clientId: ctx.client.id });
  },
  async onInboundMessage(ctx) {
    // Same contract as the doc collector: a reply obsoletes the pending send
    // and triggers a re-plan (which, in the stub, drafts nothing).
    await withClientLock(ctx.client.id, async () => {
      await removeFutureEmail(ctx.client.id);
      await setFutureEmail(ctx.client.id);
    });
  },
};
