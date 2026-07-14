import { annualReportAgent } from './annualReport/index.js';
import { customerServiceAgent } from './customerService/index.js';
import { debtCollectorAgent } from './debtCollector/index.js';
import { docCollectorAgent } from './docCollector/index.js';
import { stubAgents } from './stubs.js';
import type { AgentTypeDefinition } from './types.js';

const registry: Record<string, AgentTypeDefinition> = {
  [docCollectorAgent.id]: docCollectorAgent,
  [annualReportAgent.id]: annualReportAgent,
  [debtCollectorAgent.id]: debtCollectorAgent,
  [customerServiceAgent.id]: customerServiceAgent,
  ...Object.fromEntries(stubAgents.map((agent) => [agent.id, agent])),
};

export function getAgentType(id: string): AgentTypeDefinition {
  const definition = registry[id];
  if (!definition) throw new Error(`unknown agent type: ${id}`);
  return definition;
}

export function listAgentTypes(): AgentTypeDefinition[] {
  return Object.values(registry);
}
