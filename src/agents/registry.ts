import { docCollectorAgent } from './docCollector/index.js';
import type { AgentTypeDefinition } from './types.js';

const registry: Record<string, AgentTypeDefinition> = {
  [docCollectorAgent.id]: docCollectorAgent,
};

export function getAgentType(id: string): AgentTypeDefinition {
  const definition = registry[id];
  if (!definition) throw new Error(`unknown agent type: ${id}`);
  return definition;
}

export function listAgentTypes(): AgentTypeDefinition[] {
  return Object.values(registry);
}
