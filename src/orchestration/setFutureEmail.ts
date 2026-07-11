import * as clients from '../db/queries/clients.js';
import { loadAgentContext } from '../agents/resolve.js';
import { publishClientUpdated } from '../events/clientEvents.js';
import { logger } from '../util/logger.js';

/**
 * Runs one planning step for the client's agent (loaded via the agent-type
 * registry) inside the generic lifecycle wrapper: complete/paused guards,
 * drafting stamps for the UI, and failure recording for the manual retry.
 */
export async function setFutureEmail(clientId: string): Promise<void> {
  const client = await clients.getById(clientId);
  if (!client) throw new Error(`setFutureEmail: client ${clientId} not found`);
  if (client.goal_status === 'complete') return;
  if (client.paused) {
    // Replies/attachments still land and reach this re-plan path; while paused
    // the agent just never schedules the next send. Resuming re-plans.
    logger.info('client paused, not scheduling a follow-up', { clientId });
    return;
  }

  // Stamp the attempt so the UI can tell an in-flight draft from an abandoned one,
  // and record failures so it can offer a manual retry instead of an eternal
  // "drafting…" placeholder (several callers are fire-and-forget with no retry).
  await clients.markDraftingStarted(clientId);
  try {
    const agent = await loadAgentContext(client);
    await agent.definition.planNextAction(agent);
    await clients.clearDraftingState(clientId);
  } catch (err) {
    await clients.markDraftingFailed(clientId).catch((markErr) => {
      logger.error('failed to record draft failure', markErr, { clientId });
    });
    publishClientUpdated(clientId);
    throw err;
  }
}
