import { customerServiceAgent } from './customerService/index.js';
import { debtCollectorAgent } from './debtCollector/index.js';
import { docCollectorAgent } from './docCollector/index.js';
import { stubAgents } from './stubs.js';
import type { AgentTypeDefinition } from './types.js';

const registry: Record<string, AgentTypeDefinition> = {
  [docCollectorAgent.id]: docCollectorAgent,
  [debtCollectorAgent.id]: debtCollectorAgent,
  [customerServiceAgent.id]: customerServiceAgent,
  ...Object.fromEntries(stubAgents.map((agent) => [agent.id, agent])),
};

export function getAgentType(id: string): AgentTypeDefinition {
  const definition = registry[id];
  if (!definition) throw new Error(`unknown agent type: ${id}`);
  return definition;
}

/**
 * Non-throwing lookup for DB-sourced types: instance rows of retired agent
 * types survive forever (they are never deleted — clients cascade off them),
 * so paths that read `agent_instances.agent_type` back from the DB must
 * tolerate a type the registry no longer knows.
 */
export function getAgentTypeIfKnown(id: string): AgentTypeDefinition | undefined {
  return registry[id];
}

export function listAgentTypes(): AgentTypeDefinition[] {
  return Object.values(registry);
}
