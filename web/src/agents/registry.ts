import { customerServiceUI } from './customerService';
import { debtCollectorUI } from './debtCollector';
import { declarationOfCapitalUI } from './declarationOfCapital';
import { docCollectorUI } from './docCollector';
import { stubAgentUIs } from './stubs';
import type { AgentTypeUI } from './types';

const registry: Record<string, AgentTypeUI> = {
  [docCollectorUI.agentType]: docCollectorUI,
  [declarationOfCapitalUI.agentType]: declarationOfCapitalUI,
  [debtCollectorUI.agentType]: debtCollectorUI,
  [customerServiceUI.agentType]: customerServiceUI,
  ...Object.fromEntries(stubAgentUIs.map((ui) => [ui.agentType, ui])),
};

/** Unknown types fall back to the doc collector — mirrors the server's legacy fallback. */
export function getAgentUI(agentType: string): AgentTypeUI {
  return registry[agentType] ?? docCollectorUI;
}

/** Non-throwing, no-fallback lookup — for labeling historical data (e.g. usage rows) that may reference retired agent types. */
export function getAgentUIIfKnown(agentType: string): AgentTypeUI | undefined {
  return registry[agentType];
}

/** Every registered agent type, live agents first (registry insertion order). */
export function getAllAgentUIs(): AgentTypeUI[] {
  return Object.values(registry);
}
