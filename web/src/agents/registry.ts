import { declarationOfCapitalUI } from './declarationOfCapital';
import type { AgentTypeUI } from './types';

const registry: Record<string, AgentTypeUI> = {
  [declarationOfCapitalUI.agentType]: declarationOfCapitalUI,
};

/** Unknown types fall back to the declaration-of-capital collector — the platform's only agent. */
export function getAgentUI(agentType: string): AgentTypeUI {
  return registry[agentType] ?? declarationOfCapitalUI;
}

/** Non-throwing, no-fallback lookup — for labeling historical data (e.g. usage rows) that may reference retired agent types. */
export function getAgentUIIfKnown(agentType: string): AgentTypeUI | undefined {
  return registry[agentType];
}

/** Every registered agent type (registry insertion order). */
export function getAllAgentUIs(): AgentTypeUI[] {
  return Object.values(registry);
}
