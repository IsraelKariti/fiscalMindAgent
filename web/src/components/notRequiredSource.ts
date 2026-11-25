import type { ClientDocument } from '../api.js';

/**
 * Where a "not required" row's decision came from (openspec
 * `split-not-required-by-source`), read off the stored evidence — the same
 * rule the admin documents tab applies in SQL (db/queries/documentCost.ts):
 * - `form`: the intake questionnaire settled it (source 'form' / 'form_empty');
 * - `chat`: the client's words in the conversation settled it (any other evidence);
 * - `accountant`: marked by hand — the row carries no evidence at all.
 */
export type NotRequiredSource = 'form' | 'chat' | 'accountant';

export function notRequiredSource(doc: Pick<ClientDocument, 'resolution_evidence'>): NotRequiredSource {
  const evidence = doc.resolution_evidence;
  if (!evidence) return 'accountant';
  if (evidence.source === 'form' || evidence.source === 'form_empty') return 'form';
  return 'chat';
}
