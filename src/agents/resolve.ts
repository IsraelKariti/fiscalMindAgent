import * as agentInstances from '../db/queries/agentInstances.js';
import * as users from '../db/queries/users.js';
import { getAgentType } from './registry.js';
import type { AgentContext, AgentTypeDefinition } from './types.js';
import type { ClientRow } from '../db/types.js';

export interface ResolvedAgent extends AgentContext {
  definition: AgentTypeDefinition;
}

/** The agent context for one client: its instance, type definition, and owning accountant. */
export async function loadAgentContext(client: ClientRow): Promise<ResolvedAgent> {
  const instance = client.agent_instance_id ? await agentInstances.getById(client.agent_instance_id) : null;
  // Legacy CLI-era clients (NULL instance) behave as they always have: doc collector.
  const definition = getAgentType(instance?.agent_type ?? 'doc_collector');
  const accountant = client.user_id ? await users.getById(client.user_id) : null;
  return { instance, client, accountant, definition };
}
