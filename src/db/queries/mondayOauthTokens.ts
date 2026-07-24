import { decryptSecret, encryptSecret } from '../../crypto/secretBox.js';
import { pool } from '../pool.js';

/**
 * Per-accountant monday OAuth access token (server-side API reads). The token
 * is encrypted at rest (secretBox); rows returned from this module always
 * carry the plaintext value.
 */
export interface MondayOauthTokenRow {
  user_id: string;
  access_token: string;
  scopes: string;
  monday_account_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export async function getByUserId(userId: string): Promise<MondayOauthTokenRow | null> {
  const { rows } = await pool.query<MondayOauthTokenRow>('SELECT * FROM monday_oauth_tokens WHERE user_id = $1', [
    userId,
  ]);
  const row = rows[0];
  if (!row) return null;
  return { ...row, access_token: decryptSecret(row.access_token) };
}

/** Re-connecting replaces the stored token (monday tokens don't expire, but the user may re-grant). */
export async function upsert(args: {
  userId: string;
  accessToken: string;
  scopes: string;
  mondayAccountId: string | null;
}): Promise<void> {
  await pool.query(
    `INSERT INTO monday_oauth_tokens (user_id, access_token, scopes, monday_account_id)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (user_id) DO UPDATE
       SET access_token = EXCLUDED.access_token, scopes = EXCLUDED.scopes,
           monday_account_id = EXCLUDED.monday_account_id, updated_at = now()`,
    [args.userId, encryptSecret(args.accessToken), args.scopes, args.mondayAccountId],
  );
}

/** Disconnect: the token is deleted, not revoked (monday has no revocation endpoint). */
export async function remove(userId: string): Promise<boolean> {
  const { rowCount } = await pool.query('DELETE FROM monday_oauth_tokens WHERE user_id = $1', [userId]);
  return (rowCount ?? 0) > 0;
}
