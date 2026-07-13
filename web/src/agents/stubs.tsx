import type { ReactNode } from 'react';
import type { AgentTypeUI, MessageStringKey } from './types';

/**
 * Coming-soon agent types: a normal card in the agent picker, a "coming soon"
 * pane instead of a workspace. Mirrors the server's src/agents/stubs.ts —
 * when a type gets real behavior it moves to its own <type>.tsx like the
 * live agents.
 */
function makeStubUI(
  agentType: string,
  nameKey: MessageStringKey,
  descriptionKey: MessageStringKey,
  icon: ReactNode,
): AgentTypeUI {
  return { agentType, nameKey, descriptionKey, icon, comingSoon: true, clientTabs: [], channels: [] };
}

const svgProps = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export const stubAgentUIs: AgentTypeUI[] = [
  makeStubUI(
    'invoice_processing',
    'agentInvoiceProcessingName',
    'agentInvoiceProcessingDesc',
    <svg {...svgProps}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6" />
      <path d="M9 13h6" />
      <path d="M9 17h4" />
    </svg>,
  ),
  makeStubUI(
    'bank_reconciliation',
    'agentBankReconciliationName',
    'agentBankReconciliationDesc',
    <svg {...svgProps}>
      <path d="M12 3v18" />
      <path d="M7 21h10" />
      <path d="M5 7h14" />
      <path d="m5 7-3 6c.9.7 1.9 1 3 1s2.1-.3 3-1L5 7Z" />
      <path d="m19 7-3 6c.9.7 1.9 1 3 1s2.1-.3 3-1l-3-6Z" />
    </svg>,
  ),
  makeStubUI(
    'transaction_categorization',
    'agentTransactionCategorizationName',
    'agentTransactionCategorizationDesc',
    <svg {...svgProps}>
      <path d="M12 2H4a2 2 0 0 0-2 2v8l8.6 8.6a2 2 0 0 0 2.8 0l6.6-6.6a2 2 0 0 0 0-2.8L12 2Z" />
      <circle cx="7.5" cy="7.5" r="0.5" />
    </svg>,
  ),
  makeStubUI(
    'tax_deadlines',
    'agentTaxDeadlinesName',
    'agentTaxDeadlinesDesc',
    <svg {...svgProps}>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M8 2v4" />
      <path d="M16 2v4" />
      <path d="M3 10h18" />
      <path d="M12 13.5V16l1.5 1" />
    </svg>,
  ),
  makeStubUI(
    'client_onboarding',
    'agentClientOnboardingName',
    'agentClientOnboardingDesc',
    <svg {...svgProps}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M19 8v6" />
      <path d="M22 11h-6" />
    </svg>,
  ),
  makeStubUI(
    'payroll_prep',
    'agentPayrollPrepName',
    'agentPayrollPrepDesc',
    <svg {...svgProps}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01" />
      <path d="M18 12h.01" />
    </svg>,
  ),
  makeStubUI(
    'financial_reports',
    'agentFinancialReportsName',
    'agentFinancialReportsDesc',
    <svg {...svgProps}>
      <path d="M3 3v18h18" />
      <path d="M8 17v-5" />
      <path d="M13 17V9" />
      <path d="M18 17V5" />
    </svg>,
  ),
  makeStubUI(
    'expense_tracking',
    'agentExpenseTrackingName',
    'agentExpenseTrackingDesc',
    <svg {...svgProps}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>,
  ),
  makeStubUI(
    'cashflow_forecast',
    'agentCashflowForecastName',
    'agentCashflowForecastDesc',
    <svg {...svgProps}>
      <path d="M22 7 13.5 15.5 8.5 10.5 2 17" />
      <path d="M16 7h6v6" />
    </svg>,
  ),
];
