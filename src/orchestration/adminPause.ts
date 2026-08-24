import * as clients from '../db/queries/clients.js';
import * as agentInstances from '../db/queries/agentInstances.js';
import { withClientLock } from '../db/withClientLock.js';
import { removeFutureEmail } from './removeFutureEmail.js';
import { setFutureEmail } from './setFutureEmail.js';
import { logger } from '../util/logger.js';
import type { AgentInstanceRow, ClientRow } from '../db/types.js';

/**
 * Admin-only pilot supervision (048) is scoped to the declaration_of_capital
 * live pilot: the flags exist on every instance/client but only take effect
 * here, so a flag accidentally set elsewhere does nothing.
 */
export function isSupervisedInstance(instance: AgentInstanceRow | null): instance is AgentInstanceRow {
  return instance?.agent_type === 'declaration_of_capital';
}

/**
 * The admin emergency brake: true while the client's own admin_paused flag or
 * its instance's is set. Deliberately separate from agentWorkBlocked (whose
 * semantics are "agent disabled") and from the accountant-visible
 * clients.paused — this one is invisible to the accountant.
 */
export async function adminCommsPaused(client: ClientRow, instance?: AgentInstanceRow | null): Promise<boolean> {
  const inst =
    instance !== undefined
      ? instance
      : client.agent_instance_id
        ? await agentInstances.getById(client.agent_instance_id)
        : null;
  if (!isSupervisedInstance(inst)) return false;
  return client.admin_paused || inst.admin_paused;
}

/**
 * Recovery after an admin unpause. While paused, due jobs were consumed
 * without sending and inbound replies were left unplanned, so each client is
 * put through a full replan: the stale pending action is discarded (pending
 * review drafts get superseded) and the agent decides afresh. In review mode
 * the new drafts re-enter the review queue.
 */
export async function replanClientsAfterUnpause(clientIds: string[]): Promise<void> {
  for (const clientId of clientIds) {
    try {
      await withClientLock(clientId, async () => {
        const client = await clients.getById(clientId);
        if (!client) return;
        if (client.goal_status === 'complete' || client.paused || client.admin_paused) return;
        if (await adminCommsPaused(client)) return; // instance still paused
        await removeFutureEmail(clientId);
        await setFutureEmail(clientId);
      });
    } catch (err) {
      logger.error('unpause replan failed for client', err, { clientId });
    }
  }
}
