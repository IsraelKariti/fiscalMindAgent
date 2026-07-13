import type { AgentTypeDefinition } from './types.js';

/**
 * Coming-soon agent types: registered so admins can enable them and they show
 * up in the agent picker, but with no behavior yet — every hook is a no-op.
 * When one of these grows real behavior, move it to its own
 * src/agents/<type>/ directory like the live agents.
 */
function makeStubAgent(id: string): AgentTypeDefinition {
  return {
    id,
    conversationModel: 'none',
    async planNextAction() {},
    async onInboundMessage() {},
  };
}

export const stubAgents: AgentTypeDefinition[] = [
  'invoice_processing',
  'bank_reconciliation',
  'transaction_categorization',
  'tax_deadlines',
  'client_onboarding',
  'payroll_prep',
  'financial_reports',
  'expense_tracking',
  'cashflow_forecast',
].map(makeStubAgent);
