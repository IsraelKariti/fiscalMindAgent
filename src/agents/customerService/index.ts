import { withClientLock } from '../../db/withClientLock.js';
import { logger } from '../../util/logger.js';
import type { AgentTypeDefinition } from '../types.js';
import { replyToInbound } from './reply.js';
import { buildRouter } from './router.js';

/**
 * The customer-service agent: answers client questions on WhatsApp using the
 * accountant's monday workdocs (office knowledge) and board rows scoped to
 * the sender's phone number. Strictly inbound — it never initiates contact,
 * never schedules anything, and can do nothing but answer.
 */
export const customerServiceAgent: AgentTypeDefinition = {
  id: 'customer_service',
  conversationModel: 'immediate_reply',
  async planNextAction(ctx) {
    // Inbound-only by design: there is never a next action to plan.
    logger.info('customer service: planNextAction is a no-op', { clientId: ctx.client.id });
  },
  async onInboundMessage(ctx, evt) {
    // One reply per new WhatsApp message. Duplicate provider redeliveries
    // (isNewMessage=false, media backfill only) get no second answer; email is
    // ignored — CS clients have a synthetic address, but stay defensive.
    if (evt.channel !== 'whatsapp' || !evt.isNewMessage || !ctx.instance || !ctx.accountant) return;
    // Locked so two quick consecutive messages produce two ordered replies.
    await withClientLock(ctx.client.id, () => replyToInbound(ctx));
  },
  // analyzeInboundFile deliberately omitted (v1): inbound media is stored by
  // the shared webhook half and marked 'unsupported'; the agent answers text only.
  buildRouter,
};
