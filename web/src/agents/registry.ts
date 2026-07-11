import { customerServiceUI } from './customerService';
import { debtCollectorUI } from './debtCollector';
import { docCollectorUI } from './docCollector';
import type { AgentTypeUI } from './types';

const registry: Record<string, AgentTypeUI> = {
  [docCollectorUI.agentType]: docCollectorUI,
  [debtCollectorUI.agentType]: debtCollectorUI,
  [customerServiceUI.agentType]: customerServiceUI,
};

/** Unknown types fall back to the doc collector — mirrors the server's legacy fallback. */
export function getAgentUI(agentType: string): AgentTypeUI {
  return registry[agentType] ?? docCollectorUI;
}
