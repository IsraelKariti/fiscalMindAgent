import * as clientPortalCredentials from '../../../db/queries/clientPortalCredentials.js';
import type { PortalProvider } from '../../../db/queries/clientPortalCredentials.js';
import type { ClientRow } from '../../../db/types.js';

/** Where a client's national id on file came from (shown next to id checks). */
export type ClientIdSource = 'credentials' | 'monday_crm';

export interface ClientIdOnFile {
  /** The national id (ת"ז) as stored — not normalised. */
  id: string;
  source: ClientIdSource;
}

/** Minimal credentials lookup, injectable for tests. */
export type CredentialsLookup = (clientId: string, provider: PortalProvider) => Promise<{ id_number: string } | null>;

const defaultLookup: CredentialsLookup = (clientId, provider) => clientPortalCredentials.getForClient(clientId, provider);

/**
 * The client's national id on file and where it came from, in one shared
 * order for every consumer (fetch availability, the fetch runner's login,
 * document verification): the preferred provider's portal-credentials row,
 * then the tax-authority row (same person, same ת"ז — a client set up for the
 * 106 fetch needs no second credential), then the id the capital-declaration
 * kickoff stored from the monday CRM card (`agent_fields.id_number`,
 * openspec `declaration-kickoff`). Null when none of them holds an id.
 */
export async function clientIdNumber(
  client: Pick<ClientRow, 'id' | 'agent_fields'>,
  preferredProvider: PortalProvider,
  lookup: CredentialsLookup = defaultLookup,
): Promise<ClientIdOnFile | null> {
  const providers: PortalProvider[] =
    preferredProvider === 'israel_tax_authority' ? ['israel_tax_authority'] : [preferredProvider, 'israel_tax_authority'];
  for (const provider of providers) {
    const row = await lookup(client.id, provider);
    if (row?.id_number && row.id_number.trim() !== '') return { id: row.id_number, source: 'credentials' };
  }
  const stored = client.agent_fields['id_number'];
  if (typeof stored === 'string' && stored.trim() !== '') return { id: stored.trim(), source: 'monday_crm' };
  return null;
}
