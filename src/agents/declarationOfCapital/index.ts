import { docCollectorAgent } from '../docCollector/index.js';
import type { AgentTypeDefinition } from '../types.js';

/**
 * The declaration-of-capital collector: identical behavior to the document
 * collector (checklist chased over email/WhatsApp, client-import sources,
 * due-date handling), but the documents are for a הצהרת הון — the capital
 * declaration the tax authority requires once every few years — as of the
 * 31.12.{{tax_year}} valuation date. The behavioral difference lives entirely
 * in its own prompt template (selected per agent type in docCollector/plan.ts)
 * and the file analyzer's valuation-date framing. Family membership is
 * declared in docCollector/family.ts, which routes the shared router,
 * client-import scan and overdue scan to both types.
 */
export const declarationOfCapitalAgent: AgentTypeDefinition = {
  ...docCollectorAgent,
  id: 'declaration_of_capital',
  emailSuffix: 'capital',
  // A הצהרת הון demand is accountant-initiated: imported clients wait paused
  // until the accountant fires the monday kickoff webhook (button on the board
  // row) or resumes them in the workspace.
  manualKickoff: true,
};
