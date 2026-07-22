import { pool } from '../pool.js';

/** Browser-automation portals we can log into on a client's behalf. */
export type PortalProvider = 'israel_tax_authority';

/** Per-client portal login credentials, imported from the accountant's boards/sheets. */
export interface ClientPortalCredentialRow {
  id: string;
  client_id: string;
  provider: string;
  id_number: string;
  user_code: string;
  created_at: Date;
  updated_at: Date;
}

export async function getForClient(clientId: string, provider: PortalProvider): Promise<ClientPortalCredentialRow | null> {
  const { rows } = await pool.query<ClientPortalCredentialRow>(
    'SELECT * FROM client_portal_credentials WHERE client_id = $1 AND provider = $2',
    [clientId, provider],
  );
  return rows[0] ?? null;
}

/** Import sweeps re-run daily; the latest source row wins. */
export async function upsert(args: {
  clientId: string;
  provider: PortalProvider;
  idNumber: string;
  userCode: string;
}): Promise<void> {
  await pool.query(
    `INSERT INTO client_portal_credentials (client_id, provider, id_number, user_code)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (client_id, provider) DO UPDATE
       SET id_number = EXCLUDED.id_number, user_code = EXCLUDED.user_code, updated_at = now()`,
    [args.clientId, args.provider, args.idNumber, args.userCode],
  );
}
