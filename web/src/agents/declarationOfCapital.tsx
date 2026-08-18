import { DECLARATION_OF_CAPITAL_DOCUMENTS } from '../defaultDocuments';
import { docCollectorUI } from './docCollector';
import type { AgentTypeUI } from './types';

/**
 * The declaration-of-capital collector's workspace UI: identical to the doc
 * collector's (same tabs, same settings panel) — the server-side behavior is
 * shared too (doc-collector family). Differences: its own name/description,
 * icon, add-client default checklist, and no monday board import (that
 * endpoint creates doc_collector clients specifically).
 */
export const declarationOfCapitalUI: AgentTypeUI = {
  ...docCollectorUI,
  agentType: 'declaration_of_capital',
  supportsBoardImport: false,
  // The whole flow lives on the monday board (import sources + kickoff
  // webhook) — no manual add-client button.
  importOnlyClients: true,
  nameKey: 'agentDeclarationOfCapitalName',
  descriptionKey: 'agentDeclarationOfCapitalDesc',
  defaultDocuments: DECLARATION_OF_CAPITAL_DOCUMENTS,
  icon: (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m12 3 8.5 4.5H3.5z" />
      <line x1="4" y1="21" x2="20" y2="21" />
      <line x1="6" y1="18" x2="6" y2="11" />
      <line x1="10" y1="18" x2="10" y2="11" />
      <line x1="14" y1="18" x2="14" y2="11" />
      <line x1="18" y1="18" x2="18" y2="11" />
    </svg>
  ),
};
