import * as clients from '../db/queries/clients.js';
import { loadAgentContext } from '../agents/resolve.js';
import { adminCommsPaused } from './adminPause.js';
import { isHeldFirstMessageClient } from './heldFirstMessage.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { logger } from '../util/logger.js';
import type { PlanHints } from '../agents/types.js';

/**
 * Runs one planning step for the client's agent (loaded via the agent-type
 * registry) inside the generic lifecycle wrapper: complete/paused guards,
 * drafting stamps for the UI, and failure recording for the manual retry.
 */
export async function setFutureEmail(clientId: string, hints?: PlanHints): Promise<void> {
  const client = await clients.getById(clientId);
  if (!client) throw new Error(`setFutureEmail: client ${clientId} not found`);
  if (client.goal_status === 'complete') return;
  if (client.paused) {
    // A paused, never-contacted manual-kickoff client is holding its first
    // message for the accountant (openspec `first-message-approval`): the
    // planner runs, the draft is stored with its planned time, nothing is
    // queued. Every other paused client: replies/attachments still land and
    // reach this re-plan path, but the agent never schedules the next send.
    // Resuming re-plans.
    if (await isHeldFirstMessageClient(client)) {
      logger.info('client paused before first contact: drafting the held first message', { clientId });
      hints = { ...hints, hold: true };
    } else {
      logger.info('client paused, not scheduling a follow-up', { clientId });
      return;
    }
  }
  if (await adminCommsPaused(client)) {
    // Admin emergency brake (048): also covers freshly webhook-enrolled clients
    // of a paused instance — they enroll normally but get no first contact.
    // The admin unpause replans every affected client.
    logger.info('client admin-paused, not scheduling a follow-up', { clientId });
    return;
  }

  // Stamp the attempt so the UI can tell an in-flight draft from an abandoned one,
  // and record failures so it can offer a manual retry instead of an eternal
  // "drafting…" placeholder (several callers are fire-and-forget with no retry).
  await clients.markDraftingStarted(clientId);
  try {
    const agent = await loadAgentContext(client);
    await agent.definition.planNextAction(hints ? { ...agent, hints } : agent);
    await clients.clearDraftingState(clientId);
  } catch (err) {
    await clients.markDraftingFailed(clientId).catch((markErr) => {
      logger.error('failed to record draft failure', markErr, { clientId });
    });
    publishClientUpdated(clientId);
    throw err;
  }
}
