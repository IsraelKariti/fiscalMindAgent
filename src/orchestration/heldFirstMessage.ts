import * as agentInstances from '../db/queries/agentInstances.js';
import * as emails from '../db/queries/emails.js';
import { getAgentTypeIfKnown } from '../agents/registry.js';
import { holdsFirstMessage } from './holdRule.js';
import type { ClientRow } from '../db/types.js';

export { holdsFirstMessage };

/** Whether this paused client is in the held-first-message state (agent type + sent/received history looked up). */
export async function isHeldFirstMessageClient(client: ClientRow): Promise<boolean> {
  if (!client.paused || !client.agent_instance_id) return false;
  const instance = await agentInstances.getById(client.agent_instance_id);
  const manualKickoff = instance ? getAgentTypeIfKnown(instance.agent_type)?.manualKickoff === true : false;
  if (!manualKickoff) return false;
  const contacted = await emails.listForClient(client.id);
  return holdsFirstMessage({ paused: client.paused, manualKickoff, contactedMessages: contacted.length });
}
