import { docCollectorAgent } from '../docCollector/index.js';
import { catalogSeedRows } from './catalog.js';
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
  // A הצהרת הון demand is accountant-initiated: imported clients wait paused
  // until the accountant fires the monday kickoff webhook (button on the board
  // row) or resumes them in the workspace.
  manualKickoff: true,
  // WhatsApp is the only client channel (no emailSuffix — the agent has no
  // mailbox): clients are keyed by their phone column, first contact goes out
  // as an approved template, and the planner may never pick email.
  whatsappOnly: true,
  // The hardcoded catalog is the ONLY checklist supply: every new client
  // starts with one 'unresolved' row per document type and the intake
  // interview resolves them — the import source's documents column is ignored.
  seedClientDocuments: catalogSeedRows,
  // The declaration year is PER CLIENT — read from the monday board row's
  // year column at kickoff (agent_fields.tax_year). There is no instance-wide
  // year: the admin field is hidden and a row without a parseable year is not
  // started.
  collectsTaxYear: false,
};
