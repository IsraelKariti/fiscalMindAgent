import type { ClientDocumentRow, RetirementReplacement } from '../../db/types.js';
import { paperMayBeStatedInChat } from './catalog.js';

/**
 * What replaced a row the planner retires (openspec `retired-by-declaration-tab`):
 * the client's own declaration when the same answer gives the client a
 * declaration-paper item of the retired row's type — an instance added with a
 * statable paper (the property cost declaration, the client vehicle
 * declaration), or a cost / vehicle statement on an existing item with such a
 * paper — and other documents otherwise. The planner never says which; this
 * reads the answer. Same type is enough: the ladder never retires a paper of
 * one vehicle while declaring another in the same answer.
 */
export function replacementOfRetirement(
  retired: Pick<ClientDocumentRow, 'type_key'>,
  createdRows: Pick<ClientDocumentRow, 'type_key' | 'paper_key'>[],
  statedRows: Pick<ClientDocumentRow, 'type_key' | 'paper_key'>[],
): RetirementReplacement {
  const declaresSameType = (row: Pick<ClientDocumentRow, 'type_key' | 'paper_key'>) =>
    row.type_key !== null && row.type_key === retired.type_key && paperMayBeStatedInChat(row.paper_key);
  return createdRows.some(declaresSameType) || statedRows.some(declaresSameType) ? 'client_declaration' : 'documents';
}
